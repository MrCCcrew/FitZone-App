-- AlterTable
ALTER TABLE `PurchaseInvoice` ADD COLUMN `supplyType` VARCHAR(191) NOT NULL DEFAULT 'purchase';

-- AlterTable
ALTER TABLE `PurchaseInvoiceItem` ADD COLUMN `productId` VARCHAR(191) NULL,
    ADD COLUMN `sku` VARCHAR(191) NULL,
    ADD COLUMN `variantId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `PurchaseInvoiceItem_productId_idx` ON `PurchaseInvoiceItem`(`productId`);

-- CreateIndex
CREATE INDEX `PurchaseInvoiceItem_variantId_idx` ON `PurchaseInvoiceItem`(`variantId`);

-- AddForeignKey
ALTER TABLE `PurchaseInvoiceItem` ADD CONSTRAINT `PurchaseInvoiceItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseInvoiceItem` ADD CONSTRAINT `PurchaseInvoiceItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
