-- Additive follow-up to the already-applied entitlement migration.
-- Preserve historical rows; no backfill or existing entitlement changes.

ALTER TABLE `OfferBoxEntitlement`
  ADD COLUMN `bookingPatternSnapshot` LONGTEXT NULL;
