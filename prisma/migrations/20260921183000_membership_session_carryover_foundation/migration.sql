-- Membership renewal session carryover foundation.
--
-- No historical data is rewritten here:
-- - legacy rows keep baseSessions = NULL
-- - carryoverSessions defaults to 0
-- - carryover is not considered applied unless carryoverAppliedAt is written
-- - one source membership may fund at most one later renewal

ALTER TABLE `UserMembership`
  ADD COLUMN `baseSessions` INTEGER NULL,
  ADD COLUMN `carryoverSessions` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `carryoverFromMembershipId` VARCHAR(191) NULL,
  ADD COLUMN `carryoverAppliedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `UserMembership_carryoverFromMembershipId_key`
  ON `UserMembership`(`carryoverFromMembershipId`);
