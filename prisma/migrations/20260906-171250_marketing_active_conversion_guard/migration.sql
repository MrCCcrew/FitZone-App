-- AlterTable
ALTER TABLE `MarketingConversion` ADD COLUMN `activeKey` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `MarketingConversion_activeKey_key` ON `MarketingConversion`(`activeKey`);

