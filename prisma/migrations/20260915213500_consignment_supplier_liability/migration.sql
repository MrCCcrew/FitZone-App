CREATE TABLE `ConsignmentSupplierLiability` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `orderInventoryAllocationId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitCost` DECIMAL(18,2) NOT NULL,
    `grossAmount` DECIMAL(18,2) NOT NULL,
    `paidAmount` DECIMAL(18,2) NOT NULL DEFAULT 0,
    `reversedAmount` DECIMAL(18,2) NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `source` VARCHAR(191) NOT NULL DEFAULT 'sale',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `reversedAt` DATETIME(3) NULL,

    UNIQUE INDEX `uq_cons_liability_allocation`
      (`orderInventoryAllocationId`),

    INDEX `idx_cons_liability_supplier_status`
      (`supplierId`, `status`, `createdAt`),

    INDEX `idx_cons_liability_order`
      (`orderId`),

    INDEX `idx_cons_liability_order_item`
      (`orderItemId`),

    INDEX `idx_cons_liability_source`
      (`source`, `createdAt`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ConsignmentSupplierPaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `supplierPaymentId` VARCHAR(191) NOT NULL,
    `liabilityId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18,2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_cons_payalloc_payment_liability`
      (`supplierPaymentId`, `liabilityId`),

    INDEX `idx_cons_payalloc_liability`
      (`liabilityId`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ConsignmentSupplierLiability`
  ADD CONSTRAINT `fk_cons_liability_supplier`
  FOREIGN KEY (`supplierId`)
  REFERENCES `Supplier`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE `ConsignmentSupplierLiability`
  ADD CONSTRAINT `fk_cons_liability_allocation`
  FOREIGN KEY (`orderInventoryAllocationId`)
  REFERENCES `OrderInventoryAllocation`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE `ConsignmentSupplierPaymentAllocation`
  ADD CONSTRAINT `fk_cons_payalloc_payment`
  FOREIGN KEY (`supplierPaymentId`)
  REFERENCES `SupplierPayment`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `ConsignmentSupplierPaymentAllocation`
  ADD CONSTRAINT `fk_cons_payalloc_liability`
  FOREIGN KEY (`liabilityId`)
  REFERENCES `ConsignmentSupplierLiability`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
