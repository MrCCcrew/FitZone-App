-- CreateTable
CREATE TABLE `PopupSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'main',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `ribbonText` VARCHAR(191) NOT NULL DEFAULT '💗 PINK FRIDAY — لفترة محدودة',
    `endDate` DATETIME(3) NULL,
    `showDelaySeconds` DOUBLE NOT NULL DEFAULT 2.5,
    `hideHours` INTEGER NOT NULL DEFAULT 24,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PopupOffer` (
    `id` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NOT NULL,
    `imageUrl` TEXT NULL,
    `badge` VARCHAR(100) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `PopupOffer_offerId_key`(`offerId`),
    INDEX `PopupOffer_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PopupOffer` ADD CONSTRAINT `PopupOffer_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
