ALTER TABLE `PayrollRun`
  ADD COLUMN `blockedEmployeeCount` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `PayrollRunEmployee`
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'blocked',
  ADD COLUMN `blockReason` TEXT NULL;

CREATE INDEX `PRE_status_idx`
  ON `PayrollRunEmployee`(`payrollRunId`, `status`);
