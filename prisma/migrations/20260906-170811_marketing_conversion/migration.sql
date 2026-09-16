-- AlterTable
ALTER TABLE `User` ADD COLUMN `marketingCommissionRate` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `marketingCommissionType` VARCHAR(191) NOT NULL DEFAULT 'percentage';

-- CreateTable
CREATE TABLE `MarketingConversion` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `assignedStaffUserId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `userMembershipId` VARCHAR(191) NULL,
    `commissionTypeSnapshot` VARCHAR(191) NULL,
    `commissionRateSnapshot` DOUBLE NULL,
    `commissionBaseSnapshot` DOUBLE NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkoutLockedAt` DATETIME(3) NULL,
    `convertedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MarketingConversion_userMembershipId_key`(`userMembershipId`),
    INDEX `MarketingConversion_customerId_status_idx`(`customerId`, `status`),
    INDEX `MarketingConversion_assignedStaffUserId_status_idx`(`assignedStaffUserId`, `status`),
    INDEX `MarketingConversion_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MarketingCommission` (
    `id` VARCHAR(191) NOT NULL,
    `marketingConversionId` VARCHAR(191) NOT NULL,
    `staffUserId` VARCHAR(191) NOT NULL,
    `userMembershipId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `commissionTypeSnapshot` VARCHAR(191) NOT NULL,
    `commissionRateSnapshot` DOUBLE NOT NULL,
    `commissionBaseSnapshot` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MarketingCommission_marketingConversionId_key`(`marketingConversionId`),
    UNIQUE INDEX `MarketingCommission_userMembershipId_key`(`userMembershipId`),
    INDEX `MarketingCommission_staffUserId_status_idx`(`staffUserId`, `status`),
    INDEX `MarketingCommission_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MarketingConversion` ADD CONSTRAINT `MarketingConversion_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MarketingConversion` ADD CONSTRAINT `MarketingConversion_assignedStaffUserId_fkey` FOREIGN KEY (`assignedStaffUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MarketingConversion` ADD CONSTRAINT `MarketingConversion_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MarketingCommission` ADD CONSTRAINT `MarketingCommission_marketingConversionId_fkey` FOREIGN KEY (`marketingConversionId`) REFERENCES `MarketingConversion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MarketingCommission` ADD CONSTRAINT `MarketingCommission_staffUserId_fkey` FOREIGN KEY (`staffUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MarketingCommission` ADD CONSTRAINT `MarketingCommission_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

