CREATE TABLE `CommissionPayout` (
  `id` VARCHAR(191) NOT NULL,
  `beneficiaryType` VARCHAR(191) NOT NULL,
  `beneficiaryId` VARCHAR(191) NOT NULL,
  `totalAmount` DECIMAL(18,2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
  `status` VARCHAR(191) NOT NULL DEFAULT 'paid',
  `paymentMethod` VARCHAR(191) NULL,
  `paymentReference` VARCHAR(191) NULL,
  `receiptUrl` TEXT NULL,
  `notes` TEXT NULL,
  `sourceType` VARCHAR(191) NULL,
  `sourceId` VARCHAR(191) NULL,
  `requestedAt` DATETIME(3) NULL,
  `approvedAt` DATETIME(3) NULL,
  `paidAt` DATETIME(3) NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),

  UNIQUE INDEX `CommissionPayout_sourceType_sourceId_key`
    (`sourceType`, `sourceId`),

  INDEX `CommissionPayout_beneficiaryType_beneficiaryId_idx`
    (`beneficiaryType`, `beneficiaryId`),

  INDEX `CommissionPayout_status_paidAt_idx`
    (`status`, `paidAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


CREATE TABLE `CommissionPayoutItem` (
  `id` VARCHAR(191) NOT NULL,
  `payoutId` VARCHAR(191) NOT NULL,
  `commissionType` VARCHAR(191) NOT NULL,
  `commissionId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(18,2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE INDEX `CommissionPayoutItem_commissionType_commissionId_key`
    (`commissionType`, `commissionId`),

  INDEX `CommissionPayoutItem_payoutId_idx`
    (`payoutId`),

  CONSTRAINT `CommissionPayoutItem_payoutId_fkey`
    FOREIGN KEY (`payoutId`)
    REFERENCES `CommissionPayout`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
