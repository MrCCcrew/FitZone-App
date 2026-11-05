CREATE TABLE `AttendanceDeductionPolicy` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `salaryDivisorDays` INTEGER NOT NULL,
  `workdayMinutes` INTEGER NOT NULL,
  `absenceMultiplierBps` INTEGER NOT NULL,
  `lateDeductionEnabled` BOOLEAN NOT NULL DEFAULT false,
  `lateGraceMinutes` INTEGER NOT NULL DEFAULT 0,
  `lateMultiplierBps` INTEGER NOT NULL DEFAULT 10000,
  `notes` TEXT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),

  UNIQUE INDEX `ADPolicy_employee_effective_key`
    (`employeeId`, `effectiveFrom`),

  INDEX `ADPolicy_employee_effective_idx`
    (`employeeId`, `effectiveFrom`, `effectiveTo`),

  INDEX `ADPolicy_creator_created_idx`
    (`createdById`, `createdAt`),

  CONSTRAINT `AttendanceDeductionPolicy_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `AttendanceDeductionPolicy_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AttendanceDeduction` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `monthKey` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'blocked',
  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',

  `employeeCodeSnapshot` VARCHAR(191) NOT NULL,
  `employeeNameSnapshot` VARCHAR(191) NOT NULL,

  `compensationTermIdSnapshot` VARCHAR(191) NULL,
  `policyIdSnapshot` VARCHAR(191) NULL,

  `fixedSalaryMinorSnapshot` INTEGER NOT NULL DEFAULT 0,

  `salaryDivisorDaysSnapshot` INTEGER NULL,
  `workdayMinutesSnapshot` INTEGER NULL,
  `absenceMultiplierBpsSnapshot` INTEGER NULL,

  `lateDeductionEnabledSnapshot` BOOLEAN NULL,
  `lateGraceMinutesSnapshot` INTEGER NULL,
  `lateMultiplierBpsSnapshot` INTEGER NULL,

  `absenceCount` INTEGER NOT NULL DEFAULT 0,
  `totalLateMinutes` INTEGER NOT NULL DEFAULT 0,
  `deductibleLateMinutes` INTEGER NOT NULL DEFAULT 0,

  `absenceDeductionMinor` INTEGER NOT NULL DEFAULT 0,
  `lateDeductionMinor` INTEGER NOT NULL DEFAULT 0,
  `totalDeductionMinor` INTEGER NOT NULL DEFAULT 0,

  `blockReason` TEXT NULL,

  `calculatedAt` DATETIME(3) NULL,
  `calculatedById` VARCHAR(191) NULL,

  `finalizedAt` DATETIME(3) NULL,
  `finalizedById` VARCHAR(191) NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),

  UNIQUE INDEX `ADDeduction_employee_month_key`
    (`employeeId`, `monthKey`),

  INDEX `AttendanceDeduction_monthKey_status_idx`
    (`monthKey`, `status`),

  INDEX `ADDeduction_employee_month_idx`
    (`employeeId`, `monthKey`),

  INDEX `AttendanceDeduction_policyIdSnapshot_idx`
    (`policyIdSnapshot`),

  INDEX `ADDeduction_calculator_time_idx`
    (`calculatedById`, `calculatedAt`),

  INDEX `ADDeduction_finalizer_time_idx`
    (`finalizedById`, `finalizedAt`),

  CONSTRAINT `AttendanceDeduction_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `AttendanceDeduction_policyIdSnapshot_fkey`
    FOREIGN KEY (`policyIdSnapshot`) REFERENCES `AttendanceDeductionPolicy`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `AttendanceDeduction_calculatedById_fkey`
    FOREIGN KEY (`calculatedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `AttendanceDeduction_finalizedById_fkey`
    FOREIGN KEY (`finalizedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AttendanceDeductionOccurrence` (
  `id` VARCHAR(191) NOT NULL,
  `deductionId` VARCHAR(191) NOT NULL,
  `attendanceId` VARCHAR(191) NOT NULL,
  `attendanceDate` DATE NOT NULL,
  `statusSnapshot` VARCHAR(191) NOT NULL,
  `lateMinutesSnapshot` INTEGER NOT NULL DEFAULT 0,
  `deductibleLateMinutes` INTEGER NOT NULL DEFAULT 0,
  `deductionMinor` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),

  UNIQUE INDEX `ADOccurrence_deduction_attendance_key`
    (`deductionId`, `attendanceId`),

  INDEX `ADOccurrence_attendance_idx`
    (`attendanceId`),

  INDEX `ADOccurrence_date_idx`
    (`attendanceDate`),

  CONSTRAINT `AttendanceDeductionOccurrence_deductionId_fkey`
    FOREIGN KEY (`deductionId`) REFERENCES `AttendanceDeduction`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
