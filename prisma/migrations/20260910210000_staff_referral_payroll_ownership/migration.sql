-- C16/C17 Employee Referral Commission -> Payroll foundation.
--
-- No historical StaffCommission ownership is backfilled.
-- Existing settled commission rows intentionally remain with NULL ownership.
-- Existing PayrollRunEmployee rows receive 0 referral commission because
-- referral commission was not part of those historical payroll snapshots.

ALTER TABLE `PayrollRunEmployee`
  ADD COLUMN `referralCommissionEarningMinor`
             INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `StaffCommission`
  ADD COLUMN `settlementOwnerType` VARCHAR(191) NULL,
  ADD COLUMN `settlementOwnerId` VARCHAR(191) NULL,
  ADD COLUMN `earnedAt` DATETIME(3) NULL;

CREATE INDEX `StaffCommission_staffUserId_status_createdAt_idx`
  ON `StaffCommission`(`staffUserId`, `status`, `createdAt`);

CREATE INDEX `StaffCommission_staffUserId_status_earnedAt_idx`
  ON `StaffCommission`(`staffUserId`, `status`, `earnedAt`);

CREATE INDEX `StaffCommission_settlementOwnerType_settlementOwnerId_idx`
  ON `StaffCommission`(`settlementOwnerType`, `settlementOwnerId`);
