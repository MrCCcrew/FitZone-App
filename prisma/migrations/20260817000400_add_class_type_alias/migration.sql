-- CreateTable
CREATE TABLE `ClassTypeAlias` (
    `id` VARCHAR(191) NOT NULL,
    `classTypeId` VARCHAR(191) NOT NULL,
    `alias` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClassTypeAlias_classTypeId_idx`(`classTypeId`),
    UNIQUE INDEX `ClassTypeAlias_alias_key`(`alias`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClassTypeAlias` ADD CONSTRAINT `ClassTypeAlias_classTypeId_fkey` FOREIGN KEY (`classTypeId`) REFERENCES `ClassType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
