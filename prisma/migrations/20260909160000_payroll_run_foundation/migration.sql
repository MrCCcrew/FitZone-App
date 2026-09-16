CREATE TABLE `PayrollRun` (
  `id` VARCHAR(191) NOT NULL,
  `monthKey` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
  `employeeCount` INTEGER NOT NULL DEFAULT 0,
  `totalGrossEarningsMinor` INTEGER NOT NULL DEFAULT 0,
  `totalDeductionsMinor` INTEGER NOT NULL DEFAULT 0,
  `totalNetPayMinor` INTEGER NOT NULL DEFAULT 0,
  `calculatedAt` DATETIME(3) NULL,
  `calculatedById` VARCHAR(191) NULL,
  `finalizedAt` DATETIME(3) NULL,
  `finalizedById` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PayrollRun_monthKey_key`(`monthKey`),
  INDEX `PayrollRun_status_month_idx`(`status`, `monthKey`),
  INDEX `PayrollRun_created_idx`(`createdAt`),
  INDEX `PayrollRun_calculated_idx`(`calculatedById`, `calculatedAt`),
  INDEX `PayrollRun_finalized_idx`(`finalizedById`, `finalizedAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollRunEmployee` (
  `id` VARCHAR(191) NOT NULL,
  `payrollRunId` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,

  `employeeCodeSnapshot` VARCHAR(191) NOT NULL,
  `employeeNameSnapshot` VARCHAR(191) NOT NULL,

  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',

  `compensationTermIdSnapshot` VARCHAR(191) NULL,
  `fixedSalaryMinor` INTEGER NOT NULL DEFAULT 0,

  `fixedClassEarningMinor` INTEGER NOT NULL DEFAULT 0,
  `traineeClassEarningMinor` INTEGER NOT NULL DEFAULT 0,
  `coachMembershipEarningMinor` INTEGER NOT NULL DEFAULT 0,
  `privateSessionEarningMinor` INTEGER NOT NULL DEFAULT 0,
  `adjustmentEarningMinor` INTEGER NOT NULL DEFAULT 0,

  `grossEarningsMinor` INTEGER NOT NULL DEFAULT 0,

  `attendanceDeductionMinor` INTEGER NOT NULL DEFAULT 0,
  `loanDeductionMinor` INTEGER NOT NULL DEFAULT 0,
  `adjustmentDeductionMinor` INTEGER NOT NULL DEFAULT 0,

  `totalDeductionsMinor` INTEGER NOT NULL DEFAULT 0,
  `netPayMinor` INTEGER NOT NULL DEFAULT 0,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PRE_run_employee_key`(`payrollRunId`, `employeeId`),
  INDEX `PRE_employee_idx`(`employeeId`),
  INDEX `PRE_run_idx`(`payrollRunId`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollRunItem` (
  `id` VARCHAR(191) NOT NULL,
  `payrollRunEmployeeId` VARCHAR(191) NOT NULL,

  `sourceType` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `direction` VARCHAR(191) NOT NULL,

  `amountMinor` INTEGER NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',

  `sourceStatusSnapshot` VARCHAR(191) NULL,
  `labelSnapshot` TEXT NULL,
  `metadataSnapshot` LONGTEXT NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `PRI_employee_source_key`
    (`payrollRunEmployeeId`, `sourceType`, `sourceId`),

  INDEX `PRI_source_idx`
    (`sourceType`, `sourceId`),

  INDEX `PRI_employee_idx`
    (`payrollRunEmployeeId`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PayrollRunEmployee`
  ADD CONSTRAINT `PRE_run_fk`
  FOREIGN KEY (`payrollRunId`)
  REFERENCES `PayrollRun`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE `PayrollRunEmployee`
  ADD CONSTRAINT `PRE_employee_fk`
  FOREIGN KEY (`employeeId`)
  REFERENCES `EmployeeProfile`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE `PayrollRunItem`
  ADD CONSTRAINT `PRI_employee_fk`
  FOREIGN KEY (`payrollRunEmployeeId`)
  REFERENCES `PayrollRunEmployee`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
