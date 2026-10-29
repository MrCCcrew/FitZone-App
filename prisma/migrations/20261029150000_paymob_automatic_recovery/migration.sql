-- CreateTable
CREATE TABLE `PaymobRecoveryJob` (
    `id` VARCHAR(191) NOT NULL,
    `paymentTransactionId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedUntil` DATETIME(3) NULL,
    `leaseToken` VARCHAR(191) NULL,
    `lastErrorCode` VARCHAR(191) NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymobRecoveryJob_paymentTransactionId_key`(`paymentTransactionId`),
    INDEX `PaymobRecoveryJob_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `PaymobRecoveryJob_lockedUntil_idx`(`lockedUntil`),
    INDEX `PaymobRecoveryJob_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymobRecoveryScanState` (
    `id` VARCHAR(191) NOT NULL,
    `cursorCreatedAt` DATETIME(3) NULL,
    `cursorPaymentId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

