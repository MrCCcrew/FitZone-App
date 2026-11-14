-- Additive, nullable purchase identity for independently earned
-- Offer Box staff commissions. Existing membership commissions are untouched.

ALTER TABLE `StaffCommission`
  ADD COLUMN `offerBoxPurchaseId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `StaffCommission_offerBoxPurchaseId_key`
  ON `StaffCommission`(`offerBoxPurchaseId`);

ALTER TABLE `StaffCommission`
  ADD CONSTRAINT `StaffCommission_offerBoxPurchaseId_fkey`
  FOREIGN KEY (`offerBoxPurchaseId`)
  REFERENCES `OfferBoxPurchase`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
