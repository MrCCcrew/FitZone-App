-- Additive only. No existing rows are rewritten.
-- Independent Offer Box redemption ownership.

CREATE TABLE `OfferBoxEntitlement` (
  `id` VARCHAR(191) NOT NULL,
  `purchaseId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `startDate` DATETIME(3) NOT NULL,
  `endDate` DATETIME(3) NOT NULL,
  `totalSessions` INTEGER NOT NULL,
  `eligibilitySnapshot` LONGTEXT NOT NULL,
  `allowedClassTypesSnapshot` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `OfferBoxEntitlement_purchaseId_key`
  ON `OfferBoxEntitlement`(`purchaseId`);

CREATE INDEX `OfferBoxEntitlement_userId_status_idx`
  ON `OfferBoxEntitlement`(`userId`, `status`);

ALTER TABLE `Booking`
  ADD COLUMN `offerBoxEntitlementId` VARCHAR(191) NULL;

CREATE INDEX `Booking_offerBoxEntitlementId_idx`
  ON `Booking`(`offerBoxEntitlementId`);

ALTER TABLE `OfferBoxEntitlement`
  ADD CONSTRAINT `OfferBoxEntitlement_purchaseId_fkey`
  FOREIGN KEY (`purchaseId`)
  REFERENCES `OfferBoxPurchase`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OfferBoxEntitlement`
  ADD CONSTRAINT `OfferBoxEntitlement_userId_fkey`
  FOREIGN KEY (`userId`)
  REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Booking`
  ADD CONSTRAINT `Booking_offerBoxEntitlementId_fkey`
  FOREIGN KEY (`offerBoxEntitlementId`)
  REFERENCES `OfferBoxEntitlement`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
