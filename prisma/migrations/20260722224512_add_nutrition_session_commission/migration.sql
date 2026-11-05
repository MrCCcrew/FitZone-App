-- AlterTable
ALTER TABLE `NutritionCommission` ADD COLUMN `nutritionSessionId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `NutritionCommission` ADD CONSTRAINT `NutritionCommission_nutritionSessionId_fkey` FOREIGN KEY (`nutritionSessionId`) REFERENCES `NutritionSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
