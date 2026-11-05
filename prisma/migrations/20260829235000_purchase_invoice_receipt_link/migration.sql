ALTER TABLE `InventoryReceipt`
  ADD COLUMN `purchaseInvoiceId` VARCHAR(191) NULL;

CREATE INDEX `InventoryReceipt_purchaseInvoiceId_idx`
  ON `InventoryReceipt`(`purchaseInvoiceId`);

ALTER TABLE `InventoryReceipt`
  ADD CONSTRAINT `InventoryReceipt_purchaseInvoiceId_fkey`
  FOREIGN KEY (`purchaseInvoiceId`)
  REFERENCES `PurchaseInvoice`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
