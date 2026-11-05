-- AddUniqueNutritionSession
--
-- Adds unique constraint on nutritionSessionId to prevent duplicate commission records
-- for the same session. This ensures idempotent webhook handling.
--
-- Safe for production:
-- - Additive only (no data deletion)
-- - MySQL allows multiple NULL values in unique index
-- - Non-null duplicates will cause migration to fail - check with check-duplicates.sql first

-- Check if unique index already exists (idempotent migration)
-- If you need to run this migration multiple times, it won't fail

SET @index_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'NutritionCommission'
    AND INDEX_NAME = 'NutritionCommission_nutritionSessionId_key'
);

SET @sql = IF(
  @index_exists = 0,
  'ALTER TABLE `NutritionCommission` ADD UNIQUE INDEX `NutritionCommission_nutritionSessionId_key`(`nutritionSessionId`);',
  'SELECT "Index already exists, skipping...";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
