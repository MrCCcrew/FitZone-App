-- AlterTable
ALTER TABLE `Supplier` ADD COLUMN `code` VARCHAR(191) NULL,
    ADD COLUMN `creditDays` INTEGER NULL,
    ADD COLUMN `creditLimit` DECIMAL(18, 2) NULL,
    ADD COLUMN `defaultPaymentTerms` VARCHAR(191) NULL,
    ADD COLUMN `supportsConsignment` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `supportsPrivateLabel` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `PurchaseInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NULL,
    `invoiceDate` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `subtotal` DECIMAL(18, 2) NOT NULL,
    `totalAmount` DECIMAL(18, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `notes` TEXT NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `postedByUserId` VARCHAR(191) NULL,
    `cancelledByUserId` VARCHAR(191) NULL,
    `postedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseInvoice_supplierId_status_invoiceDate_idx`(`supplierId`, `status`, `invoiceDate`),
    INDEX `PurchaseInvoice_status_dueDate_idx`(`status`, `dueDate`),
    INDEX `PurchaseInvoice_createdByUserId_idx`(`createdByUserId`),
    INDEX `PurchaseInvoice_postedByUserId_idx`(`postedByUserId`),
    INDEX `PurchaseInvoice_cancelledByUserId_idx`(`cancelledByUserId`),
    UNIQUE INDEX `PurchaseInvoice_supplierId_invoiceNumber_key`(`supplierId`, `invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseInvoiceItem` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseInvoiceId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitCost` DECIMAL(18, 2) NOT NULL,
    `totalCost` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PurchaseInvoiceItem_purchaseInvoiceId_idx`(`purchaseInvoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierPayment` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `notes` TEXT NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `postedByUserId` VARCHAR(191) NULL,
    `cancelledByUserId` VARCHAR(191) NULL,
    `postedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupplierPayment_supplierId_status_paymentDate_idx`(`supplierId`, `status`, `paymentDate`),
    INDEX `SupplierPayment_referenceNumber_idx`(`referenceNumber`),
    INDEX `SupplierPayment_createdByUserId_idx`(`createdByUserId`),
    INDEX `SupplierPayment_postedByUserId_idx`(`postedByUserId`),
    INDEX `SupplierPayment_cancelledByUserId_idx`(`cancelledByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierPaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `supplierPaymentId` VARCHAR(191) NOT NULL,
    `purchaseInvoiceId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SupplierPaymentAllocation_purchaseInvoiceId_idx`(`purchaseInvoiceId`),
    UNIQUE INDEX `SupplierPaymentAllocation_supplierPaymentId_purchaseInvoiceI_key`(`supplierPaymentId`, `purchaseInvoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Supplier_code_key` ON `Supplier`(`code`);

-- AddForeignKey
ALTER TABLE `PurchaseInvoice` ADD CONSTRAINT `PurchaseInvoice_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseInvoice` ADD CONSTRAINT `PurchaseInvoice_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseInvoice` ADD CONSTRAINT `PurchaseInvoice_postedByUserId_fkey` FOREIGN KEY (`postedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseInvoice` ADD CONSTRAINT `PurchaseInvoice_cancelledByUserId_fkey` FOREIGN KEY (`cancelledByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseInvoiceItem` ADD CONSTRAINT `PurchaseInvoiceItem_purchaseInvoiceId_fkey` FOREIGN KEY (`purchaseInvoiceId`) REFERENCES `PurchaseInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_postedByUserId_fkey` FOREIGN KEY (`postedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_cancelledByUserId_fkey` FOREIGN KEY (`cancelledByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPaymentAllocation` ADD CONSTRAINT `SupplierPaymentAllocation_supplierPaymentId_fkey` FOREIGN KEY (`supplierPaymentId`) REFERENCES `SupplierPayment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPaymentAllocation` ADD CONSTRAINT `SupplierPaymentAllocation_purchaseInvoiceId_fkey` FOREIGN KEY (`purchaseInvoiceId`) REFERENCES `PurchaseInvoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
