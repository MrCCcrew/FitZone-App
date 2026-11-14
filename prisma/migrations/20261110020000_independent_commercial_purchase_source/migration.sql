-- Independent commercial purchase source identity.
-- Existing purchases retain their offer_box classification.
-- Existing legacy redemption ownership is preserved.

ALTER TABLE `OfferBoxPurchase`
    ADD COLUMN `commercialKind` VARCHAR(191)
        NOT NULL DEFAULT 'offer_box',
    ADD COLUMN `catalogMembershipId` VARCHAR(191)
        NULL;

CREATE INDEX `OfferBoxPurchase_commercialKind_catalogMembershipId_idx`
    ON `OfferBoxPurchase`(
        `commercialKind`,
        `catalogMembershipId`
    );
