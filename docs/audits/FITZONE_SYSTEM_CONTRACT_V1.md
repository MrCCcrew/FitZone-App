# FitZone System Contract v1

## Purpose

This document defines the system-wide contracts that must remain true across FitZone.

Its purpose is to prevent a change in one module from silently breaking another module.

Protected domains include:

- Membership Lifecycle
- Payments
- Bookings
- Attendance
- Class Exchange
- Make-up
- Reschedule
- Commissions
- Accounting
- Referrals
- Wallet
- Rewards
- Inventory
- Cron Jobs

---

## 1. Membership Lifecycle

Membership status represents operational entitlement and access.

Typical lifecycle:

pending_payment -> active -> expired

cancelled is an independent termination state.

Rules:

- Membership status controls operational access, not financial history.
- active -> expired must not rewrite historical revenue.
- Membership status changes must not delete or recalculate accrued commissions.
- Cancellation must not erase an already completed financial event.
- Make-up rights may survive membership expiry where explicitly allowed by policy.
- Lifecycle logic must remain separate from accounting recognition.

---

## 2. Payment Contract

A successful payment is the authoritative financial boundary.

Post-payment processing must be exact-once.

Required behavior:

- Lock the relevant PaymentTransaction before reconciliation.
- Re-read authoritative state after locking.
- Execute related DB side effects transactionally.
- Use idempotency/completion markers.
- Do not repeat reconciliation after completion.
- External notifications occur only after successful commit.

Possible post-payment effects include:

- Membership activation
- Commission accrual
- Accounting journal
- Wallet bonus
- Reward points
- Inventory rewards
- Offer counters
- Notifications

---

## 3. Revenue Recognition

Subscription revenue represents actual economic consideration.

Subscription Revenue =

External Paid
+ Wallet Redeemed
+ Reward Points Redeemed

Rules:

- Discounts are not revenue.
- Wallet top-up is a liability when collected.
- Revenue must not depend on current Membership status.
- Revenue does not disappear because a Membership later expires.
- Revenue recognition must derive from authoritative financial events.

---

## 4. Accounting Periods

Every financial event must have a defined recognition date.

Examples:

- Store Sale -> confirmedAt
- Store Return -> cancelledAt
- Subscription Revenue -> successful financial payment/activation event
- Commission -> accrual event
- Wallet Top-up -> successful top-up event
- Refund/Reversal -> refund or reversal event

Rules:

- Historical periods must not change because current status changed.
- Reversals belong to their own recognition period.
- Accounting reports use Africa/Cairo timezone.
- Date ranges use half-open intervals:

[from, to)

---

## 5. Commission Contract

Commission economics must be frozen before accrual.

Rules:

- Commission terms come from an immutable versioned snapshot.
- Accrual must never re-read mutable commission configuration.
- Accrual is exact-once.
- Membership locking is required during accrual.
- Unique constraints prevent duplicate commission records.
- commissionAccruedAt is the membership accrual completion marker.
- earned / settled represents liability settlement state.
- Membership lifecycle state must not redefine historical commissions.
- Commission reporting must use a consistent financial recognition event.

---

## 6. Accounting Contract

All accounting journals follow double-entry accounting.

Rules:

- Debits equal credits exactly.
- Journal posting is idempotent.
- Historical journals are preserved.
- Corrections use reversal entries.
- Wallet top-ups create liabilities, not revenue.
- Promotional wallet and reward grants must follow their defined accounting treatment.
- Subscription revenue reflects actual settlement components.
- UI calculations must never replace General Ledger truth.

---

## 7. Refund and Reversal

A later refund or cancellation must not erase the original event.

Correct model:

Original Event
+
Reversal Event

Rules:

- Never rewrite the original financial period.
- Never delete the original journal solely because of a later refund.
- Reversal processing must be idempotent.
- Refund-specific membership behavior must be audited before modification.
- Original paid events remain auditable.

---

## 8. Reporting

Reports are derived views over authoritative events.

Rules:

- Reports must not reconstruct financial truth from mutable current state.
- UI does not own core financial rules.
- API routes remain thin.
- Shared business rules live in tested services.
- Store and Club reporting should follow event-based principles.
- Report values must be reproducible from underlying authoritative events.

---

## 9. Clean Architecture

Target dependency direction:

Domain
-> Application Services
-> Infrastructure
-> API / UI

Rules:

- Adoption is incremental.
- No big-bang refactor.
- Refactor only affected boundaries when justified.
- Business rules belong in authoritative services.
- Prisma is infrastructure, not business policy.
- UI is presentation, not Source of Truth.
- API routes orchestrate rather than own policy.
- Cron jobs call shared application logic instead of duplicating rules.
- Existing behavior must be protected by characterization tests before refactoring.

---

## 10. Cross-Module Impact

Any change touching Membership or Payment must assess impact on:

- Memberships
- Payments
- Bookings
- Attendance
- Class Exchange
- Make-up
- Reschedule
- Commissions
- Accounting
- Referrals
- Wallet
- Rewards
- Inventory
- Cron Jobs

A change is not complete because one screen works.

Connected-module regression risk must be checked.

---

## 11. Historical Data

Historical data must not be modified casually.

Required sequence:

Audit
-> Reconciliation
-> Approval
-> Backup
-> Controlled Repair

Rules:

- No automatic backfill without evidence.
- No historical mutation merely to make a report visually match expectations.
- Preserve backward compatibility where possible.
- Historical repairs must remain auditable.

---

## 12. Testing and Release Gates

Before Production:

1. Understand current behavior.
2. Identify root cause.
3. Add characterization/regression tests when needed.
4. Implement in isolated DEV/Staging.
5. Run unit tests.
6. Run integration tests.
7. Run protected-flow regression tests.
8. Build in an isolated environment.
9. Verify release candidate.
10. Verify protected engines.
11. Take Production backup.
12. Deploy FitZone only.
13. Restart FitZone only when required.
14. Perform post-deploy smoke checks.
15. Perform financial reconciliation for financial changes.

---

## 13. Production Safety

Production:

/var/www/fitzone

Production Database:

fitzone_prod

Rules:

- No mutation testing on Production.
- No build inside live Production.
- No broad PM2 restart.
- Never use pm2 restart all.
- Production diagnosis is read-only unless deployment is explicitly approved.
- Existing live behavior must not be disturbed while investigating issues.

---

## 14. Protected Engines

These engines require explicit root cause and regression coverage before modification:

- Membership Lifecycle
- Payment Reconciliation
- Attendance
- Booking
- Reschedule
- Class Exchange
- Make-up
- Pending Payment Cleanup

---

## 15. Server Isolation

ArasGroup is a separate production system.

Protected:

- /var/www/arasgroup.app
- PM2 application: arasgroup
- Port: 3001

FitZone work must never:

- restart ArasGroup
- build ArasGroup
- modify ArasGroup
- delete ArasGroup files
- change ArasGroup permissions or ownership
- run broad cleanup against /var/www

---

## 16. Disk Capacity

FitZone release work must minimize disk usage.

Rules:

- Reuse Staging when safe.
- Avoid unnecessary multi-GB release copies.
- Audit releases before deletion.
- Verify PM2, Nginx, Cron, Systemd and open-file references before deletion.
- Delete old releases only in controlled batches.
- Check available disk before builds.

---

## Core Principle

Operational state and financial history are separate concerns.

Membership status controls entitlement.

Financial events control accounting.

Immutable snapshots control commission economics.

Reports consume authoritative events.

No module may silently redefine another module's Source of Truth.
