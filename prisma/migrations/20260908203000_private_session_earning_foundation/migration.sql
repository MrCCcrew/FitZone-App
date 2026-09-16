CREATE TABLE `PrivateSessionEarning` (
    `id` VARCHAR(191) NOT NULL,

    `privateSessionApplicationId` VARCHAR(191) NOT NULL,

    `monthKey` VARCHAR(191) NOT NULL,

    `privateSessionType` VARCHAR(191) NOT NULL,
    `customerIdSnapshot` VARCHAR(191) NOT NULL,
    `customerNameSnapshot` VARCHAR(191) NULL,
    `sessionsCountSnapshot` INTEGER NULL,

    `paymentTransactionIdSnapshot` VARCHAR(191) NOT NULL,
    `paymentAmountMinor` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',

    `trainerIdSnapshot` VARCHAR(191) NOT NULL,
    `trainerNameSnapshot` VARCHAR(191) NOT NULL,

    `employeeIdSnapshot` VARCHAR(191) NULL,
    `employeeCodeSnapshot` VARCHAR(191) NULL,
    `employeeNameSnapshot` VARCHAR(191) NULL,

    `coachCompensationTermIdSnapshot` VARCHAR(191) NULL,
    `commissionRateBps` INTEGER NULL,
    `commissionAmountMinor` INTEGER NOT NULL DEFAULT 0,

    `status` VARCHAR(191) NOT NULL DEFAULT 'blocked',
    `blockReason` TEXT NULL,

    `calculatedAt` DATETIME(3) NULL,
    `calculatedById` VARCHAR(191) NULL,

    `finalizedAt` DATETIME(3) NULL,
    `finalizedById` VARCHAR(191) NULL,

    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PrivateSessionEarning_privateSessionApplicationId_key`
      (`privateSessionApplicationId`),

    INDEX `PrivateSessionEarning_monthKey_status_idx`
      (`monthKey`, `status`),

    INDEX `PrivateSessionEarning_employeeIdSnapshot_monthKey_idx`
      (`employeeIdSnapshot`, `monthKey`),

    INDEX `PrivateSessionEarning_trainerIdSnapshot_monthKey_idx`
      (`trainerIdSnapshot`, `monthKey`),

    INDEX `PrivateSessionEarning_paymentTransactionIdSnapshot_idx`
      (`paymentTransactionIdSnapshot`),

    INDEX `PrivateSessionEarning_calculatedById_idx`
      (`calculatedById`),

    INDEX `PrivateSessionEarning_finalizedById_idx`
      (`finalizedById`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
