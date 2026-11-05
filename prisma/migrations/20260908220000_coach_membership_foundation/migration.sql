ALTER TABLE `Membership`
  ADD COLUMN `coachMembershipEnabled` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `UserMembership`
  ADD COLUMN `coachMembershipTrainerIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipTrainerNameSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipEmployeeIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipEmployeeCodeSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipEmployeeNameSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipCompensationTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipCommissionBpsSnapshot` INTEGER NULL,
  ADD COLUMN `coachMembershipCurrencySnapshot` VARCHAR(191) NULL;

CREATE TABLE `CoachMembershipEarning` (
  `id` VARCHAR(191) NOT NULL,
  `userMembershipId` VARCHAR(191) NOT NULL,

  `monthKey` VARCHAR(191) NOT NULL,

  `trainerIdSnapshot` VARCHAR(191) NULL,
  `trainerNameSnapshot` VARCHAR(191) NULL,

  `employeeIdSnapshot` VARCHAR(191) NOT NULL,
  `employeeCodeSnapshot` VARCHAR(191) NOT NULL,
  `employeeNameSnapshot` VARCHAR(191) NOT NULL,

  `coachCompensationTermIdSnapshot` VARCHAR(191) NOT NULL,

  `paymentAmountMinor` INTEGER NOT NULL,
  `commissionRateBps` INTEGER NOT NULL,
  `commissionAmountMinor` INTEGER NOT NULL,

  `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',

  `status` VARCHAR(191) NOT NULL DEFAULT 'calculated',
  `blockReason` VARCHAR(191) NULL,

  `calculatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `calculatedById` VARCHAR(191) NULL,

  `finalizedAt` DATETIME(3) NULL,
  `finalizedById` VARCHAR(191) NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CoachMembershipEarning_userMembershipId_key`(`userMembershipId`),
  INDEX `CoachMembershipEarning_monthKey_status_idx`(`monthKey`, `status`),
  INDEX `CoachMembershipEarning_employeeIdSnapshot_monthKey_idx`(`employeeIdSnapshot`, `monthKey`),
  INDEX `CoachMembershipEarning_trainerIdSnapshot_monthKey_idx`(`trainerIdSnapshot`, `monthKey`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
