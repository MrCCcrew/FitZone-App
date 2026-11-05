-- CreateTable
CREATE TABLE `ConsignmentReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `purchaseInvoiceId` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    `totalDeclaredCost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `performedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ConsignmentReceipt_referenceNumber_key`(`referenceNumber`),
    INDEX `ConsignmentReceipt_supplierId_status_receivedAt_idx`(`supplierId`, `status`, `receivedAt`),
    INDEX `ConsignmentReceipt_purchaseInvoiceId_idx`(`purchaseInvoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsignmentLot` (
    `id` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `sku` VARCHAR(191) NULL,
    `quantityReceived` INTEGER NOT NULL,
    `quantityAvailable` INTEGER NOT NULL,
    `quantitySold` INTEGER NOT NULL DEFAULT 0,
    `quantityReturned` INTEGER NOT NULL DEFAULT 0,
    `unitCost` DECIMAL(18, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConsignmentLot_receiptId_idx`(`receiptId`),
    INDEX `ConsignmentLot_supplierId_status_idx`(`supplierId`, `status`),
    INDEX `ConsignmentLot_productId_status_idx`(`productId`, `status`),
    INDEX `ConsignmentLot_variantId_status_idx`(`variantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsignmentMovement` (
    `id` VARCHAR(191) NOT NULL,
    `lotId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `quantityChange` INTEGER NOT NULL,
    `quantityBefore` INTEGER NOT NULL,
    `quantityAfter` INTEGER NOT NULL,
    `unitCost` DECIMAL(18, 2) NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `notes` TEXT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConsignmentMovement_lotId_createdAt_idx`(`lotId`, `createdAt`),
    INDEX `ConsignmentMovement_supplierId_createdAt_idx`(`supplierId`, `createdAt`),
    INDEX `ConsignmentMovement_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `ConsignmentMovement_variantId_createdAt_idx`(`variantId`, `createdAt`),
    INDEX `ConsignmentMovement_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `ConsignmentMovement_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ConsignmentReceipt` ADD CONSTRAINT `ConsignmentReceipt_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentReceipt` ADD CONSTRAINT `ConsignmentReceipt_purchaseInvoiceId_fkey` FOREIGN KEY (`purchaseInvoiceId`) REFERENCES `PurchaseInvoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentLot` ADD CONSTRAINT `ConsignmentLot_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `ConsignmentReceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentLot` ADD CONSTRAINT `ConsignmentLot_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentLot` ADD CONSTRAINT `ConsignmentLot_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentLot` ADD CONSTRAINT `ConsignmentLot_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentMovement` ADD CONSTRAINT `ConsignmentMovement_lotId_fkey` FOREIGN KEY (`lotId`) REFERENCES `ConsignmentLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentMovement` ADD CONSTRAINT `ConsignmentMovement_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentMovement` ADD CONSTRAINT `ConsignmentMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsignmentMovement` ADD CONSTRAINT `ConsignmentMovement_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

