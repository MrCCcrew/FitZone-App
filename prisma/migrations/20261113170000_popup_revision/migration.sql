-- R18-R46: Add optimistic concurrency version for Pink Friday.
-- Additive migration: existing campaign records retain revision 0.
-- No offer, membership, payment, booking or payroll changes.

ALTER TABLE `PopupSettings`
ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;