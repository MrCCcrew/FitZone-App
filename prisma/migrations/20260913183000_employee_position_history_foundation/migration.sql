CREATE TABLE `EmployeePositionTerm` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `positionId` VARCHAR(191) NOT NULL,

    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,

    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,

    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmployeePositionTerm_employee_from_key`
      (`employeeId`, `effectiveFrom`),

    INDEX `EmployeePositionTerm_employee_dates_idx`
      (`employeeId`, `effectiveFrom`, `effectiveTo`),

    INDEX `EmployeePositionTerm_position_dates_idx`
      (`positionId`, `effectiveFrom`, `effectiveTo`),

    INDEX `EmployeePositionTerm_creator_idx`
      (`createdById`, `createdAt`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmployeePositionTerm`
  ADD CONSTRAINT `EmployeePositionTerm_employee_fkey`
  FOREIGN KEY (`employeeId`)
  REFERENCES `EmployeeProfile`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE `EmployeePositionTerm`
  ADD CONSTRAINT `EmployeePositionTerm_position_fkey`
  FOREIGN KEY (`positionId`)
  REFERENCES `Position`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
