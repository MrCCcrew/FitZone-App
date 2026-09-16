-- Rule 5 operational PositionPayrollPolicy ownership for:
-- C04 Fixed Class
-- C05 Trainee Class
-- C06 Coach Membership
--
-- IMPORTANT:
-- - No historical backfill.
-- - All new ownership snapshots are nullable.
-- - Existing historical legacy source identifiers remain unchanged.

ALTER TABLE `FixedClassEarningOccurrence`
  ADD COLUMN `positionTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionPayrollPolicyIdSnapshot` VARCHAR(191) NULL;

CREATE INDEX `FixedClassEarningOccurrence_positionIdSnapshot_idx`
  ON `FixedClassEarningOccurrence`(`positionIdSnapshot`);

CREATE INDEX `FixedClassEarningOccurrence_positionPayrollPolicyIdSnapshot_idx`
  ON `FixedClassEarningOccurrence`(`positionPayrollPolicyIdSnapshot`);


ALTER TABLE `TraineeClassEarning`
  ADD COLUMN `commissionSourceSnapshot` VARCHAR(64) NULL,
  ADD COLUMN `positionTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionPayrollPolicyIdSnapshot` VARCHAR(191) NULL;

CREATE INDEX `TraineeClassEarning_positionIdSnapshot_monthKey_idx`
  ON `TraineeClassEarning`(`positionIdSnapshot`, `monthKey`);

CREATE INDEX `TraineeClassEarning_positionPayrollPolicyIdSnapshot_idx`
  ON `TraineeClassEarning`(`positionPayrollPolicyIdSnapshot`);


ALTER TABLE `UserMembership`
  ADD COLUMN `coachMembershipCommissionSourceSnapshot` VARCHAR(64) NULL,
  ADD COLUMN `coachMembershipPositionTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipPositionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `coachMembershipPositionPayrollPolicyIdSnapshot` VARCHAR(191) NULL;


ALTER TABLE `CoachMembershipEarning`
  MODIFY COLUMN `coachCompensationTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `commissionSourceSnapshot` VARCHAR(64) NULL,
  ADD COLUMN `positionTermIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `positionPayrollPolicyIdSnapshot` VARCHAR(191) NULL;

CREATE INDEX `CoachMembershipEarning_positionIdSnapshot_monthKey_idx`
  ON `CoachMembershipEarning`(`positionIdSnapshot`, `monthKey`);

CREATE INDEX `CoachMembershipEarning_positionPayrollPolicyIdSnapshot_idx`
  ON `CoachMembershipEarning`(`positionPayrollPolicyIdSnapshot`);
