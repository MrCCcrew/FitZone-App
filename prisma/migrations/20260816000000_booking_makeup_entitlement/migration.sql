ALTER TABLE `Booking`
  ADD COLUMN `isMakeup` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `makeupReason` VARCHAR(191) NULL;

CREATE INDEX `Booking_userMembershipId_isMakeup_status_idx`
ON `Booking`(`userMembershipId`, `isMakeup`, `status`);
