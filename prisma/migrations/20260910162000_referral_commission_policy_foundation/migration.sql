ALTER TABLE `StaffCommission`
  ADD COLUMN `customerClassificationSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `previousMembershipIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `previousMembershipEndDateSnapshot` DATETIME(3) NULL,
  ADD COLUMN `gapDaysSnapshot` INTEGER NULL,
  ADD COLUMN `referralPolicyIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionCodeSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `commissionRateBpsSnapshot` INTEGER NULL,
  ADD COLUMN `commissionBaseMinorSnapshot` INTEGER NULL,
  ADD COLUMN `commissionAmountMinorSnapshot` INTEGER NULL;

CREATE INDEX
  `StaffCommission_customerClassificationSnapshot_createdAt_idx`
ON `StaffCommission`
  (`customerClassificationSnapshot`, `createdAt`);

CREATE TABLE `ReferralCommissionPolicy` (
  `id` VARCHAR(191) NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `minimumShortTermGapDays` INTEGER NOT NULL,
  `shortTermMaxGapDays` INTEGER NOT NULL,
  `underMinimumGapBps` INTEGER NOT NULL,
  `shortTermBps` INTEGER NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `notes` TEXT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ReferralCommissionPolicy_effectiveFrom_key`
    (`effectiveFrom`),

  INDEX `ReferralCommissionPolicy_effectiveFrom_effectiveTo_isActive_idx`
    (`effectiveFrom`, `effectiveTo`, `isActive`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReferralCommissionPolicyRate` (
  `id` VARCHAR(191) NOT NULL,
  `policyId` VARCHAR(191) NOT NULL,
  `positionId` VARCHAR(191) NOT NULL,
  `newCustomerBps` INTEGER NOT NULL,
  `longTermBps` INTEGER NOT NULL,

  INDEX `ReferralCommissionPolicyRate_positionId_idx`
    (`positionId`),

  UNIQUE INDEX `ReferralCommissionPolicyRate_policyId_positionId_key`
    (`policyId`, `positionId`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ReferralCommissionPolicyRate`
  ADD CONSTRAINT `ReferralCommissionPolicyRate_policyId_fkey`
  FOREIGN KEY (`policyId`)
  REFERENCES `ReferralCommissionPolicy`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `ReferralCommissionPolicyRate`
  ADD CONSTRAINT `ReferralCommissionPolicyRate_positionId_fkey`
  FOREIGN KEY (`positionId`)
  REFERENCES `Position`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
