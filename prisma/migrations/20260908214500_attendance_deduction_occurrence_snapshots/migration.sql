ALTER TABLE `AttendanceDeductionOccurrence`
  ADD COLUMN `compensationTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `policyIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `fixedSalaryMinorSnapshot` INTEGER NULL,
  ADD COLUMN `currencySnapshot` VARCHAR(191) NULL,
  ADD COLUMN `salaryDivisorDaysSnapshot` INTEGER NULL,
  ADD COLUMN `workdayMinutesSnapshot` INTEGER NULL,
  ADD COLUMN `absenceMultiplierBpsSnapshot` INTEGER NULL,
  ADD COLUMN `lateDeductionEnabledSnapshot` BOOLEAN NULL,
  ADD COLUMN `lateGraceMinutesSnapshot` INTEGER NULL,
  ADD COLUMN `lateMultiplierBpsSnapshot` INTEGER NULL;
