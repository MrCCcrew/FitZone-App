-- Customer Class Exchange Request workflow.
--
-- Creating a request is metadata-only:
-- no Booking is cancelled, no entitlement is consumed,
-- and no Schedule seat is reserved until admin approval.

CREATE TABLE `ClassExchangeRequest` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `userMembershipId` VARCHAR(191) NOT NULL,
  `targetScheduleId` VARCHAR(191) NOT NULL,
  `note` TEXT NULL,

  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `pendingKey` VARCHAR(191) NULL,

  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt` DATETIME(3) NULL,
  `reviewedByUserId` VARCHAR(191) NULL,
  `rejectionReason` TEXT NULL,

  `sourceBookingIds` LONGTEXT NULL,

  `archivedAt` DATETIME(3) NULL,
  `archivedByUserId` VARCHAR(191) NULL,

  UNIQUE INDEX `ClassExchangeRequest_pendingKey_key` (`pendingKey`),
  INDEX `ClassExchangeRequest_userId_idx` (`userId`),
  INDEX `ClassExchangeRequest_userMembershipId_idx` (`userMembershipId`),
  INDEX `ClassExchangeRequest_targetScheduleId_idx` (`targetScheduleId`),
  INDEX `ClassExchangeRequest_status_idx` (`status`),
  INDEX `ClassExchangeRequest_requestedAt_idx` (`requestedAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClassExchangeRequest`
  ADD CONSTRAINT `ClassExchangeRequest_userId_fkey`
  FOREIGN KEY (`userId`)
  REFERENCES `User`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `ClassExchangeRequest`
  ADD CONSTRAINT `ClassExchangeRequest_userMembershipId_fkey`
  FOREIGN KEY (`userMembershipId`)
  REFERENCES `UserMembership`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `ClassExchangeRequest`
  ADD CONSTRAINT `ClassExchangeRequest_targetScheduleId_fkey`
  FOREIGN KEY (`targetScheduleId`)
  REFERENCES `Schedule`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
