-- CreateTable
CREATE TABLE `OfferAllowedClass` (
    `id` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OfferAllowedClass_offerId_idx`(`offerId`),
    INDEX `OfferAllowedClass_classId_idx`(`classId`),
    UNIQUE INDEX `OfferAllowedClass_offerId_classId_key`(`offerId`, `classId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OfferAllowedClass` ADD CONSTRAINT `OfferAllowedClass_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OfferAllowedClass` ADD CONSTRAINT `OfferAllowedClass_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
