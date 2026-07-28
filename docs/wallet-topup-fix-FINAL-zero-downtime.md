# Wallet Topup Fix - FINAL Plan (Zero-Downtime)

**Date:** 2026-07-23  
**Status:** DESIGN PHASE - NOT EXECUTED  
**Priority:** Data safety > Speed

---

## ⚠️ CRITICAL REQUIREMENTS

### FORBIDDEN (ممنوع):
- ❌ ANY changes to production NOW
- ❌ `prisma migrate dev` on server
- ❌ `prisma db push`
- ❌ `prisma migrate reset`
- ❌ Manual SQL on production
- ❌ Modify/delete existing migrations
- ❌ Commit/Push/Deploy before approval
- ❌ Reconciliation writes
- ❌ Modify customer balance now
- ❌ DROP/RENAME/MODIFY existing columns
- ❌ NOT NULL without safe default
- ❌ CASCADE delete on financial records
- ❌ Backfill inside migration
- ❌ Change existing Float types now
- ❌ Test on fitzone_prod database

### REQUIRED (مطلوب):
- ✅ Backward-compatible schema (old code still works)
- ✅ Additive-only changes (no deletes)
- ✅ Nullable fields first
- ✅ Separate small releases
- ✅ Tests on fitzone_test only
- ✅ Database backup before migration
- ✅ Safe rollback plan (no full restore)

---

## Release Strategy (5 Phases)

| Release | Purpose | Schema Change | Code Change | Risk |
|---------|---------|---------------|-------------|------|
| **R0** | Safety | ❌ None | Disable wallet_topup UI/API | 🟢 LOW |
| **R1** | Schema | ✅ Add nullable columns | ❌ None (old code works) | 🟡 MEDIUM |
| **R2** | Code | ❌ None | New settlement logic | 🟡 MEDIUM |
| **R3** | Data | ❌ None | One reconciliation only | 🟢 LOW |
| **R4** | Enable | ❌ None | Re-enable wallet_topup | 🟢 LOW |

**Total Downtime:** 0 seconds  
**Rollback Time:** < 1 minute (code revert only)

---

## RELEASE 0: Disable wallet_topup (Safety First)

### Purpose
Prevent new unsettled transactions while we fix the system.

### Changes

**File: `src/app/api/payments/checkout/route.ts`**

```diff
+  // Temporary: wallet_topup disabled for maintenance
+  if (purpose === "wallet_topup") {
+    return NextResponse.json(
+      { 
+        error: "خدمة شحن المحفظة متوقفة مؤقتاً للصيانة. نعتذر عن الإزعاج.",
+        code: "SERVICE_TEMPORARILY_UNAVAILABLE"
+      },
+      { status: 503 }
+    );
+  }
```

**File: `src/app/FitzoneApp.tsx` (UI)**

```diff
+  // Temporary: Hide wallet topup option
+  const isWalletTopupDisabled = true;
+
   <select>
-    <option value="wallet_topup">شحن المحفظة</option>
+    {!isWalletTopupDisabled && <option value="wallet_topup">شحن المحفظة</option>}
   </select>
```

### Deployment

```bash
# 1. Commit
git add src/app/api/payments/checkout/route.ts src/app/FitzoneApp.tsx
git commit -m "temp: disable wallet_topup for maintenance

- Prevent new wallet_topup transactions
- API returns 503 with Arabic message
- UI hides wallet topup option
- Other payment types (membership/order/sessions) unaffected

Release 0/4: Safety"

# 2. Deploy
git push origin main
npm run build
pm2 reload fitzone

# 3. Verify
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{"purpose":"wallet_topup","amount":100}'
# Expected: 503 error

curl http://localhost:3000/api/health
# Expected: 200 OK
```

### Rollback (R0)

```bash
git revert HEAD
git push
npm run build
pm2 reload fitzone
```

**Impact:** Wallet topup disabled. Other payments work normally.

---

## RELEASE 1: Additive Schema (Backward-Compatible)

### Purpose
Add new columns WITHOUT breaking old code.

### Schema Changes (ALL NULLABLE, ALL ADDITIVE)

**prisma/schema.prisma:**

```prisma
model PaymentTransaction {
  // ... existing fields (UNCHANGED)
  
  // NEW (nullable - backward compatible)
  settlementStatus  String?   // NULL initially
  settledAt         DateTime?
  settlementError   String?   @db.Text
  
  // NEW relation (nullable)
  walletTransaction WalletTransaction?
  
  // ... rest unchanged
}

model WalletTransaction {
  // ... existing fields (UNCHANGED)
  
  // NEW (nullable - backward compatible)
  paymentTransactionId String?            @unique
  paymentTransaction   PaymentTransaction? @relation(fields: [paymentTransactionId], references: [id], onDelete: SetNull)
  
  // @@index([walletId]) - already exists
  // NO @@index([paymentTransactionId]) - @unique already creates index
}

// NO NEW TABLE (use existing AuditLog)
// Reason: AuditLog exists, can log settlement in details field
// Separate PaymentAuditLog deferred to future release
```

### Migration SQL (COMPLETE)

**File: `prisma/migrations/20260723_add_settlement_fields/migration.sql`**

```sql
-- ═══════════════════════════════════════════════════════════════════
-- Migration: Add Settlement Tracking Fields (Additive Only)
-- Date: 2026-07-23
-- Backward Compatible: YES (all fields nullable)
-- Safe to rollback: YES (old code ignores new columns)
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- Step 1: Add nullable settlement fields to PaymentTransaction
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE `PaymentTransaction` 
  ADD COLUMN `settlementStatus` VARCHAR(191) NULL 
  COMMENT 'Settlement state: NULL=not_applicable, pending, processing, settled, failed, requires_reconciliation';

ALTER TABLE `PaymentTransaction` 
  ADD COLUMN `settledAt` DATETIME(3) NULL 
  COMMENT 'When settlement completed (wallet credited)';

ALTER TABLE `PaymentTransaction` 
  ADD COLUMN `settlementError` TEXT NULL 
  COMMENT 'Sanitized error message if settlement failed';

-- ───────────────────────────────────────────────────────────────────
-- Step 2: Add nullable payment link to WalletTransaction
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE `WalletTransaction` 
  ADD COLUMN `paymentTransactionId` VARCHAR(191) NULL 
  COMMENT 'Link to PaymentTransaction (idempotency key)';

-- Unique constraint (prevents duplicate settlements)
ALTER TABLE `WalletTransaction` 
  ADD UNIQUE INDEX `WalletTransaction_paymentTransactionId_key`(`paymentTransactionId`);

-- Foreign key (SetNull on delete - don't orphan wallet transactions)
ALTER TABLE `WalletTransaction` 
  ADD CONSTRAINT `WalletTransaction_paymentTransactionId_fkey` 
  FOREIGN KEY (`paymentTransactionId`) 
  REFERENCES `PaymentTransaction`(`id`) 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Verification (run after migration)
-- ═══════════════════════════════════════════════════════════════════

-- Check columns added
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE, 
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'PaymentTransaction'
  AND COLUMN_NAME IN ('settlementStatus', 'settledAt', 'settlementError');
-- Expected: 3 rows, all IS_NULLABLE = YES

SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'WalletTransaction'
  AND COLUMN_NAME = 'paymentTransactionId';
-- Expected: 1 row, IS_NULLABLE = YES

-- Check unique constraint
SELECT 
  CONSTRAINT_NAME, 
  TABLE_NAME, 
  CONSTRAINT_TYPE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'WalletTransaction'
  AND CONSTRAINT_NAME LIKE '%paymentTransactionId%';
-- Expected: 1 row, CONSTRAINT_TYPE = UNIQUE

-- Check foreign key
SELECT 
  CONSTRAINT_NAME, 
  TABLE_NAME, 
  REFERENCED_TABLE_NAME,
  DELETE_RULE
FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME LIKE '%WalletTransaction_paymentTransactionId%';
-- Expected: 1 row, DELETE_RULE = SET NULL

-- ═══════════════════════════════════════════════════════════════════
-- NO BACKFILL IN THIS MIGRATION
-- Backfill will be done in code (Release 2) to allow:
-- - Testing
-- - Monitoring
-- - Gradual rollout
-- - Easy rollback
-- ═══════════════════════════════════════════════════════════════════

-- Migration complete
-- Old code continues to work (ignores new nullable columns)
-- New code (Release 2) will use these columns
```

### Deployment (R1)

```bash
# LOCAL FIRST:

# 1. Create migration locally
npx prisma migrate dev --name add_settlement_fields --create-only

# 2. Review generated SQL
cat prisma/migrations/*add_settlement_fields*/migration.sql

# 3. Verify it matches above (additive only, no backfill)

# 4. Test on LOCAL database
npx prisma migrate dev

# 5. Verify columns
npx prisma db execute --sql "DESCRIBE PaymentTransaction;"
# Check: settlementStatus, settledAt, settlementError (all NULL allowed)

# 6. Test old code still works (no errors from new nullable columns)
npm run build
npm run dev
# Try: create membership, create order (should work normally)

# 7. Commit
git add prisma/schema.prisma prisma/migrations/
git commit -m "schema: add settlement tracking fields (nullable, additive)

- Add settlementStatus, settledAt, settlementError to PaymentTransaction
- Add paymentTransactionId to WalletTransaction (unique constraint)
- All fields nullable (backward compatible)
- No backfill (done in code later)
- Old code unaffected

Release 1/4: Schema"

# PRODUCTION:

# 8. Backup database FIRST
mysqldump -u fitzone -p fitzone_prod | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# 9. Test backup integrity
gunzip -t backup_*.sql.gz
echo $?  # Expected: 0 (success)

# 10. Pull code
git pull origin main

# 11. Run migration (migrate deploy, NOT migrate dev)
npx prisma migrate deploy

# 12. Verify columns added
npx prisma db execute --sql "
SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'fitzone_prod' 
  AND TABLE_NAME = 'PaymentTransaction' 
  AND COLUMN_NAME IN ('settlementStatus', 'settledAt', 'settlementError');"
# Expected: 3 rows, all IS_NULLABLE = YES

# 13. Verify old code still works (no restart needed, schema is additive)
curl http://localhost:3000/api/health
# Expected: 200 OK

# Try create membership payment (should work)
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{"purpose":"membership","membershipId":"xxx"}'
# Expected: 200 OK (new columns ignored by old code)
```

### Rollback (R1)

```bash
# Columns are additive and nullable
# Old code ignores them
# NO NEED to drop columns (safe to keep)

# If migration failed:
# 1. Check migration status
npx prisma migrate status

# 2. If partially applied:
#    Investigate error, fix, re-run migrate deploy

# 3. If need to abandon:
#    Mark migration as rolled back
npx prisma migrate resolve --rolled-back 20260723_add_settlement_fields

# 4. Drop columns manually (ONLY if necessary)
mysql -u fitzone -p fitzone_prod -e "
ALTER TABLE PaymentTransaction 
  DROP COLUMN settlementStatus,
  DROP COLUMN settledAt,
  DROP COLUMN settlementError;

ALTER TABLE WalletTransaction 
  DROP FOREIGN KEY WalletTransaction_paymentTransactionId_fkey;
  
ALTER TABLE WalletTransaction 
  DROP INDEX WalletTransaction_paymentTransactionId_key;
  
ALTER TABLE WalletTransaction 
  DROP COLUMN paymentTransactionId;
"
```

**Impact:** Schema changed, but old code works normally (columns nullable).

---

## RELEASE 2: Settlement Logic (Code Only)

### Purpose
Deploy new settlement code that uses the new schema columns.

### Files Created

**1. src/lib/payments/wallet-settlement.ts** (NEW - 300 lines)

Key features:
- ✅ Atomic: `db.$transaction`
- ✅ Idempotent: `paymentTransactionId @unique`
- ✅ Validated: status/purpose/currency/amount/userId checks
- ✅ Rollback-safe: unique violation = already settled
- ✅ Error handling: sanitized errors, no secrets
- ✅ Audit: logs to existing AuditLog table

```typescript
// Simplified signature (full file available on request):

export async function settleWalletTopup(
  paymentTransactionId: string,
  source: "webhook" | "verify" | "reconciliation"
): Promise<{
  success: boolean;
  walletTransactionId?: string;
  error?: string;
  alreadySettled?: boolean;
}> {
  return await db.$transaction(async (tx) => {
    // 1. Read payment with walletTransaction relation
    const payment = await tx.paymentTransaction.findUnique({
      where: { id },
      include: { walletTransaction: true },
    });

    // 2. Idempotency: already settled?
    if (payment.walletTransaction) {
      return { success: true, alreadySettled: true, walletTransactionId: payment.walletTransaction.id };
    }

    // 3. Validate: paid, wallet_topup, EGP, amount > 0, userId exists
    // ... (returns {success: false, error} if validation fails)

    // 4. Update settlementStatus = "processing"
    await tx.paymentTransaction.update({ where: { id }, data: { settlementStatus: "processing" } });

    // 5. Upsert wallet, increment balance
    const wallet = await tx.wallet.upsert({
      where: { userId },
      update: { balance: { increment: amount } },
      create: { userId, balance: amount },
    });

    // 6. Create WalletTransaction (UNIQUE paymentTransactionId)
    //    If duplicate, P2002 error → transaction ROLLBACK → balance NOT incremented
    const walletTx = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: "credit",
        description: `شحن المحفظة عبر Paymob`,
        paymentTransactionId: id, // ← UNIQUE
      },
    });

    // 7. Mark as settled
    await tx.paymentTransaction.update({
      where: { id },
      data: { settlementStatus: "settled", settledAt: new Date() },
    });

    // 8. Log to AuditLog (existing table)
    await tx.auditLog.create({
      data: {
        action: "wallet_topup_settled",
        targetType: "PaymentTransaction",
        targetId: id,
        details: JSON.stringify({ walletTransactionId: walletTx.id, amount, source }),
      },
    });

    return { success: true, walletTransactionId: walletTx.id, alreadySettled: false };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 10000,
  });
  
  // Catch P2002 outside transaction:
  catch (error) {
    if (error.code === "P2002") {
      // Another process settled concurrently
      // Balance increment was ROLLED BACK
      return { success: true, alreadySettled: true };
    }
    // Other errors...
  }
}
```

**2. src/lib/payments/service.ts** (MODIFIED - add settlement handler)

```diff
+import { settleWalletTopup } from "./wallet-settlement";

 export async function updatePaymentTransactionStatus(...) {
   // ... existing code ...
   
+  // NEW: Wallet topup settlement handler
+  if (transaction.purpose === "wallet_topup" && transaction.status === "paid") {
+    try {
+      const result = await settleWalletTopup(transaction.id, "webhook");
+      
+      if (!result.success) {
+        console.error("[WALLET_SETTLEMENT_FAILED]", { id: transaction.id, error: result.error });
+        await db.paymentTransaction.update({
+          where: { id: transaction.id },
+          data: { settlementStatus: "failed", settlementError: result.error },
+        });
+      } else if (!result.alreadySettled) {
+        console.info("[WALLET_SETTLED]", { id: transaction.id, walletTxId: result.walletTransactionId });
+      }
+    } catch (error) {
+      console.error("[WALLET_SETTLEMENT_ERROR]", { id: transaction.id, error });
+      await db.paymentTransaction.update({
+        where: { id: transaction.id },
+        data: { settlementStatus: "requires_reconciliation", settlementError: String(error) },
+      }).catch(() => {});
+    }
+  }
   
   return mapPaymentTransaction(transaction);
 }
```

**Note:** No changes to early return, membership, order, sessions handlers in R2.  
Those tested separately in R5 (future).

### Tests Created

**File: tests/payments/wallet-settlement.test.ts** (NEW - 400 lines)

12 tests:
1. ✅ Paid wallet_topup credits wallet (happy path)
2. ✅ Duplicate webhook idempotent (no double credit)
3. ✅ Concurrent webhook+verify (no race condition)
4. ✅ Non-paid rejected
5. ✅ Non-wallet_topup rejected
6. ✅ Non-EGP rejected
7. ✅ Zero amount rejected
8. ✅ Negative amount rejected
9. ✅ Null userId rejected
10. ✅ **REAL Rollback test:** Pre-create WalletTransaction → P2002 → balance NOT incremented
11. ✅ AuditLog entries created
12. ✅ Reconciliation retry idempotent

**Database:** `fitzone_test` ONLY (never fitzone_prod)

### Deployment (R2)

```bash
# LOCAL:

# 1. Create test database
mysql -u fitzone -p -e "CREATE DATABASE IF NOT EXISTS fitzone_test;"

# 2. Run migrations on test
DATABASE_URL="mysql://fitzone:xxx@localhost:3306/fitzone_test" npx prisma migrate deploy

# 3. Run tests
npm test -- wallet-settlement

# Expected: All 12 tests PASS

# 4. Build
npm run build

# 5. Verify TypeScript
npx tsc --noEmit

# 6. Validate schema
npx prisma validate

# 7. Commit
git add src/lib/payments/wallet-settlement.ts
git add src/lib/payments/service.ts
git add tests/payments/wallet-settlement.test.ts
git commit -m "feat(payments): add wallet_topup settlement logic

- Implement idempotent settleWalletTopup function
- Add settlement handler in updatePaymentTransactionStatus
- Atomic transaction (db.$transaction)
- Unique constraint idempotency (paymentTransactionId)
- Comprehensive tests (12 scenarios, all pass)
- wallet_topup still DISABLED (enabled in Release 4)

Tests on fitzone_test only
NO changes to membership/order/session handlers

Release 2/4: Code"

# PRODUCTION:

# 8. Pull code
git pull origin main

# 9. Install dependencies (if changed)
npm install --production

# 10. Build
npm run build

# 11. Restart (zero-downtime with PM2)
pm2 reload fitzone --update-env

# 12. Health check
curl http://localhost:3000/api/health
# Expected: 200 OK

# 13. Verify wallet_topup still disabled
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{"purpose":"wallet_topup","amount":100}'
# Expected: 503 (still disabled from R0)

# 14. Verify other payments work
# Test membership, order, sessions (should work normally)
```

### Rollback (R2)

```bash
git revert HEAD
git push
npm run build
pm2 reload fitzone
```

**Impact:** New code deployed, but wallet_topup still disabled. Other payments work.

---

## RELEASE 3: One Reconciliation (Data Write)

### Purpose
Settle the ONE confirmed unsettled transaction: `cmrxtztyq0001l11icou4grjj`

### Script

**File: scripts/reconciliation/settle-one-transaction.ts** (NEW - 200 lines)

Key features:
- ✅ Hardcoded transaction ID (rejects any other)
- ✅ Dry-run by default (`--execute` required)
- ✅ Reads balanceBefore from database
- ✅ Calls `settleWalletTopup` (same function as webhook)
- ✅ Reads balanceAfter from database
- ✅ Verifies delta = 20 EGP (not absolute balance)
- ✅ Idempotent (safe to re-run)
- ✅ Detailed verification

```typescript
// Simplified (full file available):

const ALLOWED_ID = "cmrxtztyq0001l11icou4grjj";
const EXPECTED_DELTA = 20;

async function reconcile() {
  const isDryRun = !process.argv.includes("--execute");

  // 1. Read payment
  const payment = await db.paymentTransaction.findUnique({
    where: { id: ALLOWED_ID },
    include: { 
      user: { include: { wallet: true } },
      walletTransaction: true,
    },
  });

  if (!payment || payment.id !== ALLOWED_ID) {
    throw new Error("Security: Transaction ID mismatch");
  }

  // 2. Check if already settled
  if (payment.walletTransaction) {
    console.log("✅ Already settled, no action needed");
    return;
  }

  // 3. Record balanceBefore
  const balanceBefore = payment.user.wallet?.balance ?? 0;

  // 4. Validate
  // ... (status=paid, purpose=wallet_topup, currency=EGP, etc.)

  // 5. Dry-run mode?
  if (isDryRun) {
    console.log("🔒 DRY-RUN: No changes. Use --execute to run.");
    return;
  }

  // 6. Confirmation wait
  console.log("⚠️  EXECUTE MODE: Will modify database in 5 seconds...");
  await new Promise((r) => setTimeout(r, 5000));

  // 7. Execute settlement
  const result = await settleWalletTopup(ALLOWED_ID, "reconciliation");

  if (!result.success) {
    throw new Error(`Settlement failed: ${result.error}`);
  }

  // 8. Read balanceAfter
  const updated = await db.paymentTransaction.findUnique({
    where: { id: ALLOWED_ID },
    include: { 
      user: { include: { wallet: true } },
      walletTransaction: true,
    },
  });

  const balanceAfter = updated.user.wallet?.balance ?? 0;
  const actualDelta = balanceAfter - balanceBefore;

  // 9. Verify delta
  if (actualDelta !== EXPECTED_DELTA) {
    throw new Error(`Delta mismatch: expected ${EXPECTED_DELTA}, got ${actualDelta}`);
  }

  // 10. Verify WalletTransaction link
  if (updated.walletTransaction?.paymentTransactionId !== ALLOWED_ID) {
    throw new Error("WalletTransaction link incorrect");
  }

  console.log("✅ Reconciliation successful");
  console.log(`   Delta: +${actualDelta} EGP`);
  console.log(`   Balance: ${balanceBefore} → ${balanceAfter}`);
  console.log(`   WalletTransaction: ${updated.walletTransaction?.id}`);
}
```

### Deployment (R3)

```bash
# 1. Dry-run first
npx tsx scripts/reconciliation/settle-one-transaction.ts

# Review output:
# - Shows current state
# - Shows planned changes
# - Shows balanceBefore
# - NO actual write

# 2. Execute
npx tsx scripts/reconciliation/settle-one-transaction.ts --execute

# Expected output:
# ✅ Settlement successful
#    Delta: +20 EGP
#    Balance: 100 → 120 (example, actual may differ)
#    WalletTransaction: wt_xxxxx

# 3. Verify in database
npx prisma db execute --sql "
SELECT 
  pt.id,
  pt.settlementStatus,
  pt.settledAt,
  wt.id as walletTxId,
  wt.amount,
  wt.paymentTransactionId,
  w.balance
FROM PaymentTransaction pt
LEFT JOIN WalletTransaction wt ON wt.paymentTransactionId = pt.id
LEFT JOIN Wallet w ON w.userId = pt.userId
WHERE pt.id = 'cmrxtztyq0001l11icou4grjj';"

# Expected:
# | id | settlementStatus | settledAt | walletTxId | amount | paymentTransactionId | balance |
# | cm... | settled | 2026-07-23... | wt_... | 20 | cm... | 120 |

# 4. Re-run (idempotency test)
npx tsx scripts/reconciliation/settle-one-transaction.ts --execute

# Expected:
# ✅ Already settled, no action needed
# (Balance unchanged)

# 5. Document
git add scripts/reconciliation/settle-one-transaction.ts
git commit -m "chore: reconcile transaction cmrxtztyq0001l11icou4grjj

- Settled 1 confirmed unsettled wallet_topup
- Delta verified: +20 EGP
- Idempotent (re-run safe)

Release 3/4: Data"
```

### Rollback (R3)

```bash
# If settlement created incorrect WalletTransaction:

# 1. Read state
npx prisma db execute --sql "
SELECT * FROM WalletTransaction 
WHERE paymentTransactionId = 'cmrxtztyq0001l11icou4grjj';"

# 2. Manual correction (ONLY if necessary):
# a. Delete WalletTransaction
# b. Decrement Wallet.balance
# c. Update PaymentTransaction.settlementStatus = 'requires_reconciliation'

# DO NOT use automatic script for rollback (too risky)
# Manual verification at each step
```

**Impact:** 1 transaction settled. Balance increased by 20 EGP.

---

## RELEASE 4: Re-enable wallet_topup

### Purpose
Allow users to topup wallet again (now with working settlement).

### Changes

**Revert R0 changes:**

```bash
git revert <R0-commit-hash>
```

**Or manual:**

```diff
-  // Temporary: wallet_topup disabled
-  if (purpose === "wallet_topup") {
-    return NextResponse.json({ error: "..." }, { status: 503 });
-  }

-  const isWalletTopupDisabled = true;
```

### Deployment (R4)

```bash
# 1. Commit
git commit -m "feat: re-enable wallet_topup

- Remove temporary 503 block
- Re-show wallet topup option in UI
- Settlement logic in place (Release 2)
- Schema ready (Release 1)
- Reconciliation complete (Release 3)

Release 4/4: Enable"

# 2. Deploy
git push origin main
npm run build
pm2 reload fitzone

# 3. Verify
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{"purpose":"wallet_topup","amount":50}'
# Expected: 200 OK (checkout URL returned)

# 4. Monitor
# Watch logs for:
# [WALLET_SETTLED] - successful settlements
# [WALLET_SETTLEMENT_FAILED] - failures
# [WALLET_SETTLEMENT_ERROR] - errors

tail -f logs/production.log | grep WALLET
```

### Rollback (R4)

```bash
# Re-disable wallet_topup
git revert HEAD
git push
npm run build
pm2 reload fitzone
```

**Impact:** Wallet topup enabled. Users can topup. Settlement automatic.

---

## Test Matrix

| Test | Database | Purpose | Expected |
|------|----------|---------|----------|
| **Unit Tests** | fitzone_test | settleWalletTopup function | All 12 pass |
| **Integration** | fitzone_test | service.ts integration | Webhook triggers settlement |
| **Concurrency** | fitzone_test | 2 parallel settleWalletTopup | Only 1 credits wallet |
| **Rollback** | fitzone_test | Pre-create WalletTransaction | P2002 → balance unchanged |
| **Idempotency** | fitzone_test | Call twice | Second returns alreadySettled |
| **Validation** | fitzone_test | Invalid inputs | Rejected with errors |
| **Build** | N/A | TypeScript compilation | No errors |
| **Prisma** | N/A | Schema validation | Valid |
| **Migration** | fitzone_test | Apply migration | Success, columns added |
| **Backward Compat** | fitzone_test | Old code + new schema | Works (ignores new columns) |

**FORBIDDEN:**
- ❌ Tests on fitzone_prod
- ❌ Tests against Paymob Live API
- ❌ Manual balance updates

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests pass on fitzone_test
- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] Prisma validates (`npx prisma validate`)
- [ ] Migration SQL reviewed (additive only, no backfill)
- [ ] Backup plan prepared
- [ ] Rollback plan prepared
- [ ] Team notified

### R0: Disable

- [ ] Code review
- [ ] Commit
- [ ] Push
- [ ] Build
- [ ] Deploy
- [ ] Verify wallet_topup disabled (503)
- [ ] Verify other payments work
- [ ] Monitor logs (no errors)

### R1: Schema

- [ ] Backup database (gzip, test integrity)
- [ ] Record table counts (`SELECT COUNT(*) FROM PaymentTransaction;`)
- [ ] Record git commit hash
- [ ] Pull code
- [ ] Run `prisma migrate deploy`
- [ ] Verify columns added (DESCRIBE table)
- [ ] Verify old code still works (no restart)
- [ ] Monitor logs (no errors)

### R2: Code

- [ ] Tests pass locally
- [ ] Build succeeds
- [ ] Pull code
- [ ] npm install
- [ ] npm run build
- [ ] PM2 reload (zero-downtime)
- [ ] Health check
- [ ] Verify wallet_topup still disabled
- [ ] Verify other payments work
- [ ] Monitor logs

### R3: Reconciliation

- [ ] Dry-run
- [ ] Review output
- [ ] Record balanceBefore
- [ ] Execute with --execute
- [ ] Verify delta = 20
- [ ] Verify WalletTransaction created
- [ ] Verify settlementStatus = settled
- [ ] Re-run (idempotency check)
- [ ] Commit

### R4: Enable

- [ ] Code review
- [ ] Commit
- [ ] Push
- [ ] Build
- [ ] Deploy
- [ ] Verify wallet_topup enabled
- [ ] Test small topup (10 EGP)
- [ ] Verify wallet credited
- [ ] Monitor logs for 24 hours

---

## Rollback Checklist

### General Principles

- ✅ Code rollback: `git revert` (always safe)
- ✅ Schema kept: Columns nullable, old code ignores them
- ❌ Database restore: FORBIDDEN (except catastrophic failure)

### Rollback R0

```bash
git revert <R0-commit>
git push
pm2 reload fitzone
# Wallet topup re-enabled
```

### Rollback R1

```bash
# Option 1: Keep columns (RECOMMENDED)
# - Old code ignores them
# - No action needed

# Option 2: Drop columns (if migration failed)
npx prisma migrate resolve --rolled-back <migration-name>
mysql -u fitzone -p fitzone_prod -e "ALTER TABLE PaymentTransaction DROP COLUMN settlementStatus, DROP COLUMN settledAt, DROP COLUMN settlementError;"
mysql -u fitzone -p fitzone_prod -e "ALTER TABLE WalletTransaction DROP FOREIGN KEY WalletTransaction_paymentTransactionId_fkey, DROP INDEX WalletTransaction_paymentTransactionId_key, DROP COLUMN paymentTransactionId;"
```

### Rollback R2

```bash
git revert <R2-commit>
git push
npm run build
pm2 reload fitzone
# New settlement code removed, old code (no settlement) restored
```

### Rollback R3

```bash
# Manual correction (NO automatic script)
# 1. Verify transaction state
# 2. Delete WalletTransaction if incorrect
# 3. Adjust Wallet.balance if needed
# 4. Update PaymentTransaction.settlementStatus = 'requires_reconciliation'
```

### Rollback R4

```bash
git revert <R4-commit>
git push
pm2 reload fitzone
# Wallet topup disabled again
```

---

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Migration fails | 🟡 Low | 🔴 High | Tested locally, backup ready, rollback plan |
| Old code breaks after schema change | 🟢 Very Low | 🔴 High | All columns nullable, backward compatible |
| Settlement creates duplicate WalletTransaction | 🟢 Very Low | 🟡 Medium | Unique constraint prevents, tests verify |
| Concurrent webhook+verify double-credits | 🟢 Very Low | 🔴 High | Unique constraint, transaction rollback, test #3 verifies |
| Reconciliation credits wrong amount | 🟢 Very Low | 🔴 High | Hardcoded transaction ID, delta verification, idempotent |
| Other payments (membership/order) break | 🟢 Very Low | 🔴 High | No changes to their handlers in R2, tested separately later |
| Database backup fails | 🟡 Low | 🔴 High | Test backup integrity with `gunzip -t` |
| PM2 restart causes downtime | 🟢 Very Low | 🟡 Medium | Use `pm2 reload` (zero-downtime) not `pm2 restart` |

---

## Monitoring

### Metrics to Watch

1. **Settlement Success Rate**
   ```sql
   SELECT 
     COUNT(CASE WHEN settlementStatus = 'settled' THEN 1 END) as settled,
     COUNT(CASE WHEN settlementStatus = 'failed' THEN 1 END) as failed,
     COUNT(CASE WHEN settlementStatus = 'requires_reconciliation' THEN 1 END) as stuck
   FROM PaymentTransaction
   WHERE purpose = 'wallet_topup' 
     AND status = 'paid'
     AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR);
   ```

2. **Settlement Latency**
   ```sql
   SELECT 
     AVG(TIMESTAMPDIFF(SECOND, paidAt, settledAt)) as avg_seconds,
     MAX(TIMESTAMPDIFF(SECOND, paidAt, settledAt)) as max_seconds
   FROM PaymentTransaction
   WHERE settlementStatus = 'settled'
     AND paidAt IS NOT NULL
     AND settledAt IS NOT NULL;
   ```

3. **Unsettled Transactions**
   ```sql
   SELECT 
     id, 
     referenceCode,
     amount,
     paidAt,
     settlementStatus,
     settlementError
   FROM PaymentTransaction
   WHERE purpose = 'wallet_topup'
     AND status = 'paid'
     AND settlementStatus != 'settled';
   ```

### Alerts

- 🚨 `settlementStatus = 'failed'` → Investigate immediately
- 🚨 `settlementStatus = 'requires_reconciliation'` → Manual review
- ⚠️  `paidAt < NOW() - INTERVAL 10 MINUTE AND settlementStatus != 'settled'` → Stuck transaction

---

## Summary

### Changes Per Release

| Release | Schema | Code | Data | Downtime | Rollback |
|---------|--------|------|------|----------|----------|
| R0 | ❌ | ✅ Disable UI/API | ❌ | 0s | Easy (git revert) |
| R1 | ✅ Add columns | ❌ | ❌ | 0s | Easy (keep columns) |
| R2 | ❌ | ✅ Settlement logic | ❌ | 0s | Easy (git revert) |
| R3 | ❌ | ❌ | ✅ 1 reconciliation | 0s | Manual (careful) |
| R4 | ❌ | ✅ Re-enable | ❌ | 0s | Easy (git revert) |

### Total Impact

- **Downtime:** 0 seconds
- **Backward Compatible:** Yes (nullable columns)
- **Transactions Affected:** 1 (cmrxtztyq0001l11icou4grjj)
- **Amount Credited:** 20 EGP
- **Rollback Time:** < 1 minute (code revert)
- **Risk Level:** 🟢 LOW

### Deferred to Future

- HMAC validation enforcement (separate PR)
- Amount/currency validation (separate PR)
- Wallet bonus idempotency (separate PR)
- Order concurrency fixes (separate PR)
- Silent catch block fixes (separate PR)
- Float → Decimal migration (separate PR)
- PaymentAuditLog table (separate PR)

---

## Current Status

```
git status --short
```

**Expected:**
```
?? docs/wallet-topup-fix-FINAL-zero-downtime.md
?? scripts/audit/wallet-topup-reconciliation.ts
```

**NOT created yet (waiting for approval):**
- src/lib/payments/wallet-settlement.ts
- tests/payments/wallet-settlement.test.ts
- scripts/reconciliation/settle-one-transaction.ts
- prisma schema changes
- prisma migration
- service.ts changes

---

## Next Steps

1. **Review this plan**
2. **Approve or request changes**
3. **Execute R0** (disable wallet_topup - safe, reversible)
4. **Create migration locally** (R1)
5. **Write tests locally** (R2)
6. **Deploy to production** (R1 → R2 → R3 → R4)

**NO execution until approved.**

---

**END OF PLAN**
