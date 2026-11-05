-- Backfill Order.confirmedAt for historical cancelled orders
-- that were legitimate completed sales with deterministic evidence

-- ═══════════════════════════════════════════════════════════════════════════
-- CRITICAL ACCOUNTING INVARIANT FIX
-- ═══════════════════════════════════════════════════════════════════════════
-- Historical orders that are CURRENTLY cancelled but were PREVIOUSLY
-- completed sales must have confirmedAt set to enable proper accounting.
--
-- Without confirmedAt, event-based accounting excludes both:
-- - The original sale (no confirmedAt)
-- - The return (requires confirmedAt IS NOT NULL)
--
-- This creates a data gap where real revenue was earned but never recognized.
-- ═══════════════════════════════════════════════════════════════════════════

-- Strategy A: Backfill from authoritative sale InventoryMovement
-- For store orders that are currently cancelled but have sale movement evidence
UPDATE `Order` o
INNER JOIN (
  SELECT
    im.referenceId as orderId,
    MIN(im.createdAt) as firstSaleMovementAt
  FROM InventoryMovement im
  WHERE im.referenceType IN ('order', 'Order')
    AND im.type = 'sale'
    AND im.referenceId IS NOT NULL
  GROUP BY im.referenceId
) sale_movements ON sale_movements.orderId = o.id
SET o.confirmedAt = sale_movements.firstSaleMovementAt
WHERE o.businessUnit = 'store'
  AND o.status = 'cancelled'
  AND o.confirmedAt IS NULL
  AND o.inventoryDeducted = true; -- Must have inventory conversion proof

-- Strategy B: Backfill from PaymentTransaction.paidAt (online payments only)
-- For remaining cancelled online orders with paid transaction evidence
UPDATE `Order` o
INNER JOIN (
  SELECT
    pt.orderId,
    MIN(pt.paidAt) as firstPaidAt
  FROM PaymentTransaction pt
  WHERE pt.status = 'paid'
    AND pt.orderId IS NOT NULL
    AND pt.paidAt IS NOT NULL
  GROUP BY pt.orderId
) paid_txns ON paid_txns.orderId = o.id
SET o.confirmedAt = paid_txns.firstPaidAt
WHERE o.businessUnit = 'store'
  AND o.status = 'cancelled'
  AND o.confirmedAt IS NULL  -- Only if not already set by Strategy A
  AND o.inventoryDeducted = true
  AND o.paymentMethod IN ('card', 'paymob', 'wallet'); -- Online payment methods only

-- Strategy C: Historical cancelled COD orders without evidence → remain NULL
-- These represent data quality issues and will be excluded from accounting
-- (no reliable evidence of when/if sale actually completed)

-- Post-migration analysis query:
-- SELECT
--   SUM(CASE WHEN confirmedAt IS NOT NULL THEN 1 ELSE 0 END) as has_confirmed_at,
--   SUM(CASE WHEN confirmedAt IS NULL THEN 1 ELSE 0 END) as missing_confirmed_at
-- FROM `Order`
-- WHERE businessUnit = 'store' AND status = 'cancelled' AND inventoryDeducted = true;
