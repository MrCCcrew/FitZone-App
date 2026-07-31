-- Offer class restrictions and immutable purchase-time snapshots.
-- Existing offers/memberships remain unrestricted because the new snapshot
-- columns are nullable; no historical data is inferred or backfilled.
ALTER TABLE `UserMembership`
  ADD COLUMN `offerSnapshot` LONGTEXT NULL,
  ADD COLUMN `allowedClassTypesSnapshot` LONGTEXT NULL,
  ADD COLUMN `snapshotDurationDays` INTEGER NULL,
  ADD COLUMN `snapshotOriginalPrice` DOUBLE NULL,
  ADD COLUMN `snapshotFinalPrice` DOUBLE NULL;

CREATE TABLE `OfferAllowedClassType` (
  `id` VARCHAR(191) NOT NULL,
  `offerId` VARCHAR(191) NOT NULL,
  `classType` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `OfferAllowedClassType_offerId_classType_key`(`offerId`, `classType`),
  INDEX `OfferAllowedClassType_classType_idx`(`classType`),
  CONSTRAINT `OfferAllowedClassType_offerId_fkey`
    FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
