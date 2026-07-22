-- CreateTable
CREATE TABLE `BlogPendingPost` (
    `id` VARCHAR(191) NOT NULL,
    `submittedBy` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `title` TEXT NOT NULL,
    `titleEn` TEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `categoryEn` VARCHAR(191) NULL,
    `author` VARCHAR(191) NOT NULL,
    `authorEn` VARCHAR(191) NULL,
    `date` VARCHAR(191) NOT NULL,
    `dateEn` VARCHAR(191) NULL,
    `readTime` VARCHAR(191) NOT NULL,
    `readTimeEn` VARCHAR(191) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `summary` TEXT NOT NULL,
    `summaryEn` TEXT NULL,
    `content` LONGTEXT NOT NULL,
    `contentEn` LONGTEXT NULL,
    `coverImage` TEXT NOT NULL,
    `videoUrl` TEXT NOT NULL,
    `existingPostId` VARCHAR(191) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BlogPendingPost_submittedBy_idx`(`submittedBy`),
    INDEX `BlogPendingPost_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BlogPendingPost` ADD CONSTRAINT `BlogPendingPost_submittedBy_fkey` FOREIGN KEY (`submittedBy`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlogPendingPost` ADD CONSTRAINT `BlogPendingPost_reviewedBy_fkey` FOREIGN KEY (`reviewedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
