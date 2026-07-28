# pendingExpiresAt Implementation Guide

## تاريخ التنفيذ: 28 يوليو 2026

## الملخص
تم استبدال آلية حساب مهلة الدفع من استخدام `startDate` إلى استخدام حقل مخصص `pendingExpiresAt` يُضبط بشكل صريح عند إنشاء الاشتراك.

## المشكلة السابقة
- كان النظام يستخدم `UserMembership.startDate` لحساب متى ينتهي وقت الدفع المعلق
- `startDate` هو تاريخ **بداية الاشتراك** وليس وقت **إنشاء الطلب**
- هذا يسبب مشاكل عندما يكون `startDate` في المستقبل أو مختلف عن وقت الطلب

## الحل المنفذ

### 1. Schema Changes
**ملف:** `prisma/schema.prisma`

```prisma
model UserMembership {
  // ... existing fields
  status            String   @default("active") // active | expired | cancelled | pending_payment
  pendingExpiresAt  DateTime? // When pending_payment expires (60 min from creation)
  // ... rest of fields
}
```

**Migration:** `20260728220145_add_pending_expires_at/migration.sql`
- إضافة عمود `pendingExpiresAt` (nullable)
- لا يوجد backfill للسجلات القديمة
- السجلات القديمة (`pendingExpiresAt=null`) تُتجاهل تلقائيًا من الـcron

### 2. Subscription Creation
**ملف:** `src/app/api/subscribe/route.ts`

```typescript
const subscription = await tx.userMembership.create({
  data: {
    // ... other fields
    status: needsPaymentConfirmation ? "pending_payment" : "active",
    pendingExpiresAt: needsPaymentConfirmation
      ? new Date(Date.now() + 60 * 60 * 1000) // 60 minutes
      : null,
    // ... other fields
  },
});
```

**القاعدة:**
- `pending_payment` → `pendingExpiresAt = الآن + 60 دقيقة`
- `active`/`free`/`gift` → `pendingExpiresAt = null`

### 3. Cron Cleanup
**ملف:** `src/app/api/cron/cancel-pending-payments/route.ts`

**التغييرات الرئيسية:**
```typescript
// ✅ الآن: استخدام pendingExpiresAt
const pending = await db.userMembership.findMany({
  where: {
    status: "pending_payment",
    pendingExpiresAt: { lte: now }, // فقط المنتهية
  },
});

// ❌ قبل: كان يستخدم startDate
// const refTime = new Date(m.startDate);
// const age = now.getTime() - refTime.getTime();

// عند الإلغاء: مسح pendingExpiresAt
data: {
  status: "cancelled",
  pendingExpiresAt: null,
}
```

**معالجة السجلات القديمة:**
```typescript
for (const m of pending) {
  if (!m.pendingExpiresAt) {
    // تخطي السجلات القديمة - تحتاج مراجعة يدوية
    console.log(`Skipping legacy record ${m.id}`);
    continue;
  }
  // ... proceed with cancellation
}
```

### 4. Payment Webhook
**ملف:** `src/lib/payments/service.ts`

**عند نجاح الدفع:**
```typescript
const activated = await tx.userMembership.updateMany({
  where: { id: membershipId, status: "pending_payment" },
  data: {
    status: "active",
    startDate: now,
    endDate,
    pendingExpiresAt: null, // ✅ مسح المهلة
  },
});
```

**كشف الدفع المتأخر:**
```typescript
if (membership.status === "cancelled") {
  // لا نستخدم startDate - فقط نسجل التحذير
  console.warn(`Late payment - membership already cancelled`);
  
  // تسجيل في metadata للمراجعة
  await tx.paymentTransaction.update({
    where: { id: transactionId },
    data: {
      metadata: stringifyJson({
        latePaymentWarning: true,
        membershipStatus: "cancelled",
        paymentReceivedAt: new Date().toISOString(),
      }),
    },
  });
  return; // ❌ لا نعيد التفعيل
}
```

### 5. Account Page UI
**ملف:** `src/app/account/page.tsx`

**جلب البيانات:**
```typescript
// ✅ استخدام pendingExpiresAt مباشرة
const pendingPaymentMembership = user.memberships.find((m) => {
  if (m.status !== "pending_payment" || !m.pendingExpiresAt) return false;
  return new Date(m.pendingExpiresAt) > now; // لم ينته بعد
}) ?? null;

// حساب الدقائق المتبقية
minutesRemaining: Math.max(
  1,
  Math.ceil(
    (new Date(pendingPaymentMembership.pendingExpiresAt).getTime() - now.getTime()) 
    / (60 * 1000)
  ),
)
```

**فلترة المنتهية:**
```typescript
const expiredPendingIds = new Set(
  user.memberships
    .filter((m) => {
      if (m.status !== "pending_payment" || !m.pendingExpiresAt) return false;
      return new Date(m.pendingExpiresAt) <= now;
    })
    .map((m) => m.id),
);
```

## ضمانات الأمان

### 1. Race Condition Protection
```typescript
// ✅ Atomic update - فقط واحد ينجح
const result = await db.userMembership.updateMany({
  where: {
    id: membershipId,
    status: "pending_payment", // شرط ذري
  },
  data: {
    status: "active", // أو "cancelled"
    pendingExpiresAt: null,
  },
});

if (result.count === 0) {
  // الطرف الآخر فاز
  return;
}
```

### 2. Legacy Data Handling
```typescript
// السجلات القديمة (pendingExpiresAt=null) لا تُحذف تلقائيًا
WHERE status = "pending_payment" 
  AND pendingExpiresAt <= now
  AND pendingExpiresAt IS NOT NULL
```

### 3. Late Payment Protection
```typescript
// ❌ لا نعيد تفعيل cancelled membership
if (membership.status === "cancelled") {
  // فقط نسجل للمراجعة اليدوية
  recordLatePaymentWarning();
  return;
}
```

## اختبارات التحقق

### Unit Tests
**ملف:** `__tests__/unit/pending-expires-at.test.ts`

- ✅ حساب 60 دقيقة بشكل صحيح
- ✅ تحديد انتهاء المهلة
- ✅ حساب الدقائق المتبقية
- ✅ عدم استخدام startDate أبدًا
- ✅ معالجة null كسجلات قديمة
- ✅ فلترة الـcron الصحيحة
- ✅ مسح pendingExpiresAt عند التفعيل/الإلغاء
- ✅ كشف الدفع المتأخر
- ✅ الحماية من race conditions

**النتائج:**
```
Test Files  1 passed (1)
Tests       10 passed (10)
```

### Integration Tests
النظام الحالي يستخدم 146 اختبار تكامل، جميعها نجحت مع التغييرات الجديدة.

## التحقق من الإنتاج

### TypeScript
```bash
npx tsc --noEmit
# ✅ خطأ واحد فقط (test file غير ذات صلة)
```

### Build
```bash
npm run build
# ✅ Production build successful
```

### Prisma
```bash
npx prisma generate
# ✅ Client generated successfully
```

## سيناريوهات الاستخدام

### ✅ Scenario 1: اشتراك جديد مع دفع
1. المستخدم يختار اشتراك (100 ج.م)
2. النظام ينشئ UserMembership:
   - `status = "pending_payment"`
   - `pendingExpiresAt = الآن + 60 دقيقة`
3. المستخدم يدفع خلال 30 دقيقة
4. Webhook ينشط الاشتراك:
   - `status = "active"`
   - `pendingExpiresAt = null`

### ✅ Scenario 2: اشتراك مجاني
1. المستخدم يستخدم عرض 0 ج.م
2. النظام ينشئ UserMembership:
   - `status = "active"`
   - `pendingExpiresAt = null`
3. لا يوجد timeout

### ✅ Scenario 3: انتهاء مهلة الدفع
1. UserMembership مع `pendingExpiresAt = 20:00`
2. الوقت الحالي 20:05 (بعد المهلة)
3. Cron يلغي الاشتراك:
   - `status = "cancelled"`
   - `pendingExpiresAt = null`
4. يحذف الحجوزات المؤقتة
5. يعيد المقاعد

### ✅ Scenario 4: دفع متأخر
1. Cron ألغى الاشتراك في 20:05
2. Webhook يستلم دفع في 20:10
3. النظام يكتشف `status = "cancelled"`
4. يسجل تحذير في metadata
5. ❌ لا يعيد التفعيل
6. يحتاج مراجعة يدوية

### ✅ Scenario 5: سجلات قديمة
1. UserMembership قديم:
   - `status = "pending_payment"`
   - `pendingExpiresAt = null`
2. Cron يتخطاه (لا يظهر في query)
3. يحتاج مراجعة يدوية

### ✅ Scenario 6: startDate في المستقبل
1. اشتراك يبدأ بعد أسبوع:
   - `startDate = 2026-08-05`
   - `pendingExpiresAt = 2026-07-28 21:00`
2. المهلة تنتهي بعد 60 دقيقة (ليس بعد أسبوع!)
3. ✅ startDate لا يؤثر على timeout

## الملفات المعدلة

1. `prisma/schema.prisma` - إضافة حقل pendingExpiresAt
2. `prisma/migrations/20260728220145_add_pending_expires_at/migration.sql` - Migration
3. `src/app/api/subscribe/route.ts` - ضبط pendingExpiresAt عند الإنشاء
4. `src/app/api/cron/cancel-pending-payments/route.ts` - استخدام pendingExpiresAt
5. `src/lib/payments/service.ts` - مسح pendingExpiresAt عند التفعيل
6. `src/app/account/page.tsx` - عرض الوقت من pendingExpiresAt
7. `src/app/account/AccountClient.tsx` - إضافة pendingExpiresAt للنوع
8. `__tests__/unit/pending-expires-at.test.ts` - اختبارات جديدة

## التوصيات

### للمطورين
1. ❌ **لا تستخدم `startDate` في منطق timeout**
2. ✅ استخدم `pendingExpiresAt` دائمًا
3. ✅ تحقق من `pendingExpiresAt !== null` قبل الحساب
4. ✅ امسح `pendingExpiresAt = null` عند تغيير الحالة

### للإدارة
1. راجع السجلات القديمة (`status=pending_payment AND pendingExpiresAt IS NULL`)
2. قرر إذا كانت تحتاج إلغاء أو تفعيل يدوي
3. راقب logs للـ"late payment" warnings
4. راجع معاملات الدفع المتأخرة في metadata

### للمراقبة
```sql
-- السجلات المعلقة بدون timeout (legacy)
SELECT COUNT(*) 
FROM UserMembership 
WHERE status = 'pending_payment' 
  AND pendingExpiresAt IS NULL;

-- السجلات المنتهية (يجب أن يعالجها الـcron)
SELECT COUNT(*) 
FROM UserMembership 
WHERE status = 'pending_payment' 
  AND pendingExpiresAt <= NOW();

-- معاملات الدفع المتأخرة
SELECT * 
FROM PaymentTransaction 
WHERE JSON_EXTRACT(metadata, '$.latePaymentWarning') = true;
```

## الخلاصة

✅ **تم التنفيذ بنجاح:**
- Migration آمن (additive only)
- TypeScript clean (خطأ واحد غير ذات صلة)
- 146 اختبار نجح
- Production build نجح
- لا استخدام لـstartDate في منطق timeout
- حماية كاملة من race conditions
- معالجة صحيحة للسجلات القديمة
- كشف ومنع الدفع المتأخر

✅ **الضمانات:**
- 60 دقيقة timeout دقيق
- atomic operations
- audit trail محفوظ
- لا فقدان بيانات
- backward compatible (السجلات القديمة آمنة)
