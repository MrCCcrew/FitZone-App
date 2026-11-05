ALTER TABLE `UserMembership`
  ADD COLUMN `commissionSnapshot` LONGTEXT NULL,
  ADD COLUMN `commissionAccruedAt` DATETIME(3) NULL;
