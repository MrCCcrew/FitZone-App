ALTER TABLE `PrivateSessionEarning`
  ADD COLUMN `commissionSourceSnapshot` VARCHAR(64) NULL,
  ADD COLUMN `positionTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionPayrollPolicyIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `gymShareAmountMinor` INTEGER NULL;

CREATE INDEX `PrivateSessionEarning_positionIdSnapshot_monthKey_idx`
  ON `PrivateSessionEarning`(`positionIdSnapshot`, `monthKey`);

CREATE INDEX `PrivateSessionEarning_positionPayrollPolicyIdSnapshot_idx`
  ON `PrivateSessionEarning`(`positionPayrollPolicyIdSnapshot`);
