-- AlterTable
ALTER TABLE `ConsignmentLot`
ADD COLUMN `quantityReserved` INTEGER NOT NULL DEFAULT 0 AFTER `quantityAvailable`;

-- CreateTable
CREATE TABLE `OrderInventoryAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `consignmentLotId` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `unitCost` DECIMAL(18, 2) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'reserved',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrderInventoryAllocation_orderId_status_idx`(`orderId`, `status`),
    INDEX `OrderInventoryAllocation_orderItemId_status_idx`(`orderItemId`, `status`),
    INDEX `OrderInventoryAllocation_consignmentLotId_status_idx`(`consignmentLotId`, `status`),
    INDEX `OrderInventoryAllocation_source_status_idx`(`source`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrderInventoryAllocation`
ADD CONSTRAINT `OrderInventoryAllocation_orderId_fkey`
FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderInventoryAllocation`
ADD CONSTRAINT `OrderInventoryAllocation_orderItemId_fkey`
FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderInventoryAllocation`
ADD CONSTRAINT `OrderInventoryAllocation_consignmentLotId_fkey`
FOREIGN KEY (`consignmentLotId`) REFERENCES `ConsignmentLot`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;
