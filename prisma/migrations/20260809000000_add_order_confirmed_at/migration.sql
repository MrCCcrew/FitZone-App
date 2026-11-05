-- Add Order.confirmedAt for accurate sale event recognition
-- Currency: EGP (Egyptian Pound), 2 decimal precision

-- Add confirmedAt column (nullable - existing orders will be backfilled deterministically)
ALTER TABLE `Order`
ADD COLUMN `confirmedAt` DATETIME(3) NULL
AFTER `inventoryDeducted`;

-- Add index for accounting report queries
ALTER TABLE `Order`
ADD INDEX `Order_confirmedAt_idx` (`confirmedAt`);

-- ═══════════════════════════════════════════════════════════════════════════
-- DETERMINISTIC BACKFILL STRATEGY
-- ═══════════════════════════════════════════════════════════════════════════
-- Do NOT blindly set confirmedAt = updatedAt (updatedAt is mutable)
--
-- Strategy A: Use authoritative sale InventoryMovement.createdAt
--   For confirmed orders with matching sale movement
--
-- Strategy B: Use PaymentTransaction.paidAt
--   For online paid orders without sale movement
--
-- Strategy C: Leave NULL
--   For COD/ambiguous orders without reliable evidence
-- ═══════════════════════════════════════════════════════════════════════════

-- Strategy A: Backfill from sale InventoryMovement (most authoritative)
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
WHERE o.status IN ('confirmed', 'delivered', 'preparing', 'ready_to_ship', 'shipped_to_courier', 'in_transit')
  AND o.businessUnit = 'store'
  AND o.confirmedAt IS NULL;

-- Strategy B: Backfill from PaymentTransaction.paidAt (online payments only)
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
WHERE o.status IN ('confirmed', 'delivered', 'preparing', 'ready_to_ship', 'shipped_to_courier', 'in_transit')
  AND o.businessUnit = 'store'
  AND o.confirmedAt IS NULL  -- Only if not already set by Strategy A
  AND o.paymentMethod IN ('card', 'paymob', 'wallet');

-- Strategy C: Historical COD orders without reliable evidence → leave NULL
-- These will be excluded from historical accounting reports (data quality issue)
-- Future COD orders will have confirmedAt set at confirmation time

-- Note: Run post-migration analysis to count:
-- SELECT
--   SUM(CASE WHEN confirmedAt IS NOT NULL THEN 1 ELSE 0 END) as backfilled,
--   SUM(CASE WHEN confirmedAt IS NULL THEN 1 ELSE 0 END) as unresolved
-- FROM `Order`
-- WHERE status IN ('confirmed', 'delivered') AND businessUnit = 'store';
