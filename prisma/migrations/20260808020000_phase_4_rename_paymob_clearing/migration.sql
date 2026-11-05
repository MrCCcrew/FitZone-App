-- Phase 4: Rename GL Account 1030 to Paymob Clearing
-- Safe rename for production account mapping finalization
-- No table changes, no destructive operations

UPDATE `GLAccount`
SET `name` = 'Paymob Clearing'
WHERE `code` = '1030';
