-- AlterTable
ALTER TABLE `Wallet` ADD COLUMN `referralBalance` DOUBLE NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `WalletTransaction` ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'legacy';
