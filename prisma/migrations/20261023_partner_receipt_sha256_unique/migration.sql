ALTER TABLE `CommissionPayout`
  ADD COLUMN `receiptSha256` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `CommissionPayout_receiptSha256_key`
  ON `CommissionPayout`(`receiptSha256`);
