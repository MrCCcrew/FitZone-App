-- AlterTable
-- Add pendingExpiresAt column to UserMembership (nullable, no default)
-- This field tracks when a pending_payment membership expires (60 min from creation)
ALTER TABLE `UserMembership` ADD COLUMN `pendingExpiresAt` DATETIME(3) NULL;
