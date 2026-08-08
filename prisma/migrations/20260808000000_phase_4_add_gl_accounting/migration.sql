-- Phase 4: Add General Ledger / Accounting Infrastructure
-- Currency: EGP (Egyptian Pound) with 2 decimal precision (piastres)

CREATE TABLE `GLAccount` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GLAccount_code_key`(`code`),
    INDEX `GLAccount_type_isActive_idx`(`type`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Journal` (
    `id` VARCHAR(191) NOT NULL,
    `referenceType` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    `reversalJournalId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Journal_referenceType_referenceId_key`(`referenceType`, `referenceId`),
    INDEX `Journal_status_date_idx`(`status`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `JournalEntry` (
    `id` VARCHAR(191) NOT NULL,
    `journalId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `debit` DOUBLE NOT NULL DEFAULT 0,
    `credit` DOUBLE NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `JournalEntry_journalId_idx`(`journalId`),
    INDEX `JournalEntry_accountId_idx`(`accountId`),
    INDEX `JournalEntry_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Journal` ADD CONSTRAINT `Journal_reversalJournalId_fkey` FOREIGN KEY (`reversalJournalId`) REFERENCES `Journal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `JournalEntry` ADD CONSTRAINT `JournalEntry_journalId_fkey` FOREIGN KEY (`journalId`) REFERENCES `Journal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `JournalEntry` ADD CONSTRAINT `JournalEntry_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `GLAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed initial Chart of Accounts
INSERT INTO `GLAccount` (`id`, `code`, `name`, `type`, `isActive`, `createdAt`, `updatedAt`) VALUES
('gl-1010', '1010', 'Inventory Asset', 'asset', 1, NOW(), NOW()),
('gl-1020', '1020', 'Cash', 'asset', 1, NOW(), NOW()),
('gl-1030', '1030', 'Paymob Clearing', 'asset', 1, NOW(), NOW()),
('gl-2010', '2010', 'Accounts Payable', 'liability', 1, NOW(), NOW()),
('gl-3010', '3010', 'Opening Balance Equity', 'equity', 1, NOW(), NOW()),
('gl-4010', '4010', 'Sales Revenue', 'revenue', 1, NOW(), NOW()),
('gl-5010', '5010', 'Cost of Goods Sold', 'expense', 1, NOW(), NOW());
