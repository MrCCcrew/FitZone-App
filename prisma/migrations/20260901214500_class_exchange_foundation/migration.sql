-- Class Exchange foundation.
--
-- Existing Booking rows retain historical semantics because the new
-- entitlementUnits column is NOT NULL with DEFAULT 1.
--
-- No existing UserMembership entitlement snapshot is modified.

ALTER TABLE `Booking`
  ADD COLUMN `entitlementUnits` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `Booking`
  ADD CONSTRAINT `Booking_entitlementUnits_positive`
  CHECK (`entitlementUnits` >= 1);

CREATE TABLE `MembershipClassExchange` (
  `id` VARCHAR(191) NOT NULL,
  `userMembershipId` VARCHAR(191) NOT NULL,
  `bookingId` VARCHAR(191) NOT NULL,
  `entitlementUnits` INTEGER NOT NULL DEFAULT 2,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `reason` TEXT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reversedAt` DATETIME(3) NULL,
  `reversedByUserId` VARCHAR(191) NULL,

  CONSTRAINT `MembershipClassExchange_entitlementUnits_min`
    CHECK (`entitlementUnits` >= 2),

  UNIQUE INDEX `MembershipClassExchange_bookingId_key` (`bookingId`),
  INDEX `MembershipClassExchange_userMembershipId_status_idx`
    (`userMembershipId`, `status`),
  INDEX `MembershipClassExchange_createdByUserId_createdAt_idx`
    (`createdByUserId`, `createdAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MembershipClassExchange`
  ADD CONSTRAINT `MembershipClassExchange_userMembershipId_fkey`
  FOREIGN KEY (`userMembershipId`)
  REFERENCES `UserMembership`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `MembershipClassExchange`
  ADD CONSTRAINT `MembershipClassExchange_bookingId_fkey`
  FOREIGN KEY (`bookingId`)
  REFERENCES `Booking`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
