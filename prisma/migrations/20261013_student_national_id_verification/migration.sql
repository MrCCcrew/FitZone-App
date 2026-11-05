-- Only admin-designated student offers use national-ID age proof.
-- Defaults preserve legacy birth-date validation on all existing offers.
ALTER TABLE `Offer`
  ADD COLUMN `requiresEgyptianNationalId` BOOLEAN NOT NULL DEFAULT FALSE;
