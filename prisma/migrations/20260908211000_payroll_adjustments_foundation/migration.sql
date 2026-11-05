CREATE TABLE `EmployeeLoan` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `principalMinor` INTEGER NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
  `startMonthKey` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `reason` TEXT NOT NULL,
  `notes` TEXT NULL,
  `approvedAt` DATETIME(3) NULL,
  `approvedById` VARCHAR(191) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancelledById` VARCHAR(191) NULL,
  `cancellationReason` TEXT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `EmployeeLoan_employeeId_status_idx` (`employeeId`, `status`),
  INDEX `EmployeeLoan_startMonthKey_status_idx` (`startMonthKey`, `status`),
  INDEX `EmployeeLoan_approvedById_approvedAt_idx` (`approvedById`, `approvedAt`),
  INDEX `EmployeeLoan_createdById_createdAt_idx` (`createdById`, `createdAt`),

  CONSTRAINT `EmployeeLoan_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `EmployeeLoan_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `EmployeeLoan_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `EmployeeLoan_cancelledById_fkey`
    FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeeLoanInstallment` (
  `id` VARCHAR(191) NOT NULL,
  `loanId` VARCHAR(191) NOT NULL,
  `monthKey` VARCHAR(191) NOT NULL,
  `amountMinor` INTEGER NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
  `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
  `approvedAt` DATETIME(3) NULL,
  `approvedById` VARCHAR(191) NULL,
  `appliedAt` DATETIME(3) NULL,
  `payrollRunId` VARCHAR(191) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancelledById` VARCHAR(191) NULL,
  `cancellationReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `EmployeeLoanInstallment_loanId_monthKey_key` (`loanId`, `monthKey`),
  INDEX `EmployeeLoanInstallment_monthKey_status_idx` (`monthKey`, `status`),
  INDEX `EmployeeLoanInstallment_approvedById_approvedAt_idx` (`approvedById`, `approvedAt`),
  INDEX `EmployeeLoanInstallment_payrollRunId_idx` (`payrollRunId`),

  CONSTRAINT `EmployeeLoanInstallment_loanId_fkey`
    FOREIGN KEY (`loanId`) REFERENCES `EmployeeLoan`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `EmployeeLoanInstallment_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `EmployeeLoanInstallment_cancelledById_fkey`
    FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollAdjustment` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `monthKey` VARCHAR(191) NOT NULL,
  `direction` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `sourceRefId` VARCHAR(191) NULL,
  `amountMinor` INTEGER NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
  `reason` TEXT NOT NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `approvedAt` DATETIME(3) NULL,
  `approvedById` VARCHAR(191) NULL,
  `appliedAt` DATETIME(3) NULL,
  `payrollRunId` VARCHAR(191) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancelledById` VARCHAR(191) NULL,
  `cancellationReason` TEXT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `PayrollAdjustment_monthKey_status_idx` (`monthKey`, `status`),
  INDEX `PayrollAdjustment_employeeId_monthKey_idx` (`employeeId`, `monthKey`),
  INDEX `PayrollAdjustment_direction_monthKey_idx` (`direction`, `monthKey`),
  INDEX `PayrollAdjustment_sourceType_sourceRefId_idx` (`sourceType`, `sourceRefId`),
  INDEX `PayrollAdjustment_approvedById_approvedAt_idx` (`approvedById`, `approvedAt`),
  INDEX `PayrollAdjustment_payrollRunId_idx` (`payrollRunId`),
  INDEX `PayrollAdjustment_createdById_createdAt_idx` (`createdById`, `createdAt`),

  CONSTRAINT `PayrollAdjustment_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `PayrollAdjustment_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `PayrollAdjustment_approvedById_fkey`
    FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `PayrollAdjustment_cancelledById_fkey`
    FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
