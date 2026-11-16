-- CreateTable
CREATE TABLE `CustomerBodyMeasurement` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `measuredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `weightKg` DOUBLE NULL,
    `heightCm` DOUBLE NULL,
    `chestCm` DOUBLE NULL,
    `waistCm` DOUBLE NULL,
    `hipsCm` DOUBLE NULL,
    `armCm` DOUBLE NULL,
    `thighCm` DOUBLE NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerBodyMeasurement_userId_measuredAt_idx`(`userId`, `measuredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomerBodyMeasurement` ADD CONSTRAINT `CustomerBodyMeasurement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
