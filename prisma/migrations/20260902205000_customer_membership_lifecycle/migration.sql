ALTER TABLE `User`
  ADD COLUMN `suspendedAt` DATETIME(3) NULL,
  ADD COLUMN `suspensionReason` TEXT NULL;

ALTER TABLE `UserMembership`
  ADD COLUMN `activatedAt` DATETIME(3) NULL;
