CREATE TABLE `PositionPayrollPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `positionId` VARCHAR(191) NOT NULL,

    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,

    `fixedSalaryMinor` INTEGER NULL,
    `defaultFixedClassMonthlyMinor` INTEGER NULL,

    `traineeClassCommissionBps` INTEGER NULL,
    `privateSessionCommissionBps` INTEGER NULL,
    `coachMembershipCommissionBps` INTEGER NULL,

    `headCoachMonthlyBaseMinutes` INTEGER NULL,
    `headCoachWeeklyMinMinutes` INTEGER NULL,
    `headCoachWeeklyCapMinutes` INTEGER NULL,

    `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',

    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,

    `createdById` VARCHAR(191) NULL,

    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PositionPayrollPolicy_positionId_effectiveFrom_key`
      (`positionId`, `effectiveFrom`),

    INDEX `PositionPayrollPolicy_position_dates_idx`
      (`positionId`, `effectiveFrom`, `effectiveTo`, `isActive`),

    INDEX `PositionPayrollPolicy_createdById_createdAt_idx`
      (`createdById`, `createdAt`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PositionPayrollPolicy`
  ADD CONSTRAINT `PositionPayrollPolicy_positionId_fkey`
  FOREIGN KEY (`positionId`)
  REFERENCES `Position`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
