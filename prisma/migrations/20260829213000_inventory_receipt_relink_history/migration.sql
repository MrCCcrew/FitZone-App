CREATE TABLE `InventoryReceiptInvoiceLinkHistory` (
  `id` VARCHAR(191) NOT NULL,
  `receiptId` VARCHAR(191) NOT NULL,
  `fromPurchaseInvoiceId` VARCHAR(191) NULL,
  `toPurchaseInvoiceId` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NULL,
  `reason` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `InventoryReceiptInvoiceLinkHistory_receiptId_createdAt_idx`
    (`receiptId`, `createdAt`),

  INDEX `InventoryReceiptInvoiceLinkHistory_fromPurchaseInvoiceId_idx`
    (`fromPurchaseInvoiceId`),

  INDEX `InventoryReceiptInvoiceLinkHistory_toPurchaseInvoiceId_idx`
    (`toPurchaseInvoiceId`),

  PRIMARY KEY (`id`),

  CONSTRAINT `InventoryReceiptInvoiceLinkHistory_receiptId_fkey`
    FOREIGN KEY (`receiptId`)
    REFERENCES `InventoryReceipt`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
