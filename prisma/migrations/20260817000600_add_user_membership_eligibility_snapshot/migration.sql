ALTER TABLE `UserMembership`
  ADD COLUMN `eligibilitySnapshot` LONGTEXT NULL;

-- Migrate existing SPECIAL offer configuration from legacy type selection to
-- exact class links. This changes offer configuration only; it does not rewrite
-- any historical UserMembership snapshot or Booking.
--
-- INSERT IGNORE makes the migration idempotent against the existing
-- @@unique([offerId, classId]) constraint and de-duplicates aliases that map to
-- the same canonical ClassType.
INSERT IGNORE INTO `OfferAllowedClass` (`id`, `offerId`, `classId`, `createdAt`)
SELECT
  UUID(),
  oact.`offerId`,
  c.`id`,
  CURRENT_TIMESTAMP(3)
FROM `OfferAllowedClassType` oact
INNER JOIN `Offer` o
  ON o.`id` = oact.`offerId`
INNER JOIN `Class` c
  ON (
    (oact.`classTypeId` IS NOT NULL AND c.`classTypeId` = oact.`classTypeId`)
    OR
    (
      oact.`classTypeId` IS NULL
      AND LOWER(TRIM(c.`type`)) = LOWER(TRIM(oact.`classType`))
    )
  )
WHERE o.`type` = 'special';
