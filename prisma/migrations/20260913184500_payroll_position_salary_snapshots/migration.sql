ALTER TABLE `PayrollRunEmployee`
  ADD COLUMN `salarySourceSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionPayrollPolicyIdSnapshot` VARCHAR(191) NULL;
