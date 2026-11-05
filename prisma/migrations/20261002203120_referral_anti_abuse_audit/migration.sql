-- AlterTable
ALTER TABLE `ReferralUsage`
  ADD COLUMN `antiAbuseRewardEligible` BOOLEAN NULL,
  ADD COLUMN `antiAbuseRiskReasons` TEXT NULL,
  ADD COLUMN `antiAbuseEvaluatedAt` DATETIME(3) NULL;
