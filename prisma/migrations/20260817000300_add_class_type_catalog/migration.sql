-- AlterTable
ALTER TABLE `Class` ADD COLUMN `classTypeId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `GoalClassRule` ADD COLUMN `classTypeId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `HealthQuestionRestriction` ADD COLUMN `classTypeId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `OfferAllowedClassType` ADD COLUMN `classTypeId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ClassType` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClassType_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Class_classTypeId_idx` ON `Class`(`classTypeId`);

-- CreateIndex
CREATE INDEX `GoalClassRule_classTypeId_idx` ON `GoalClassRule`(`classTypeId`);

-- CreateIndex
CREATE INDEX `HealthQuestionRestriction_classTypeId_idx` ON `HealthQuestionRestriction`(`classTypeId`);

-- CreateIndex
CREATE INDEX `OfferAllowedClassType_classTypeId_idx` ON `OfferAllowedClassType`(`classTypeId`);

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_classTypeId_fkey` FOREIGN KEY (`classTypeId`) REFERENCES `ClassType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OfferAllowedClassType` ADD CONSTRAINT `OfferAllowedClassType_classTypeId_fkey` FOREIGN KEY (`classTypeId`) REFERENCES `ClassType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthQuestionRestriction` ADD CONSTRAINT `HealthQuestionRestriction_classTypeId_fkey` FOREIGN KEY (`classTypeId`) REFERENCES `ClassType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoalClassRule` ADD CONSTRAINT `GoalClassRule_classTypeId_fkey` FOREIGN KEY (`classTypeId`) REFERENCES `ClassType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

