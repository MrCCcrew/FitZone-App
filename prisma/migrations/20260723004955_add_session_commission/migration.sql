-- AlterTable: Add session commission fields to NutritionistProfile
-- Safe additive migration - adds new columns with default values
-- Does not modify existing data or columns

ALTER TABLE `NutritionistProfile`
  ADD COLUMN `sessionCommissionRate` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `sessionCommissionType` VARCHAR(191) NOT NULL DEFAULT 'percentage';
