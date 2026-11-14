-- Preserve nullable purchase-time session entitlements.
-- No data backfill and no changes to existing subscription records.
ALTER TABLE `OfferBoxEntitlement`
  MODIFY COLUMN `totalSessions` INTEGER NULL;
