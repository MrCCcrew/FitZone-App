-- CreateTable
CREATE TABLE `RescheduleRequest` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `initiatedBy` VARCHAR(191) NOT NULL DEFAULT 'doctor_initiated',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending_client',
    `proposedNewSlot` VARCHAR(191) NULL,
    `doctorReason` TEXT NULL,
    `clientResponse` VARCHAR(191) NULL,
    `clientChosenSlot` VARCHAR(191) NULL,
    `clientReason` TEXT NULL,
    `refundAmount` DOUBLE NULL,
    `refundStatus` VARCHAR(191) NULL,
    `refundApprovedBy` VARCHAR(191) NULL,
    `refundApprovedAt` DATETIME(3) NULL,
    `refundCompletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RescheduleRequest_sessionId_idx`(`sessionId`),
    INDEX `RescheduleRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RescheduleRequest` ADD CONSTRAINT `RescheduleRequest_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `NutritionSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
