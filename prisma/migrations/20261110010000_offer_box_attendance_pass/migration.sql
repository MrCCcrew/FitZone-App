-- Independent Offer Box attendance.
-- Existing membership/private attendance passes remain unchanged.

ALTER TABLE `AttendancePass`
    ADD COLUMN `offerBoxEntitlementId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `AttendancePass_offerBoxEntitlementId_key`
    ON `AttendancePass`(`offerBoxEntitlementId`);

ALTER TABLE `AttendancePass`
    ADD CONSTRAINT `AttendancePass_offerBoxEntitlementId_fkey`
    FOREIGN KEY (`offerBoxEntitlementId`)
    REFERENCES `OfferBoxEntitlement`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;