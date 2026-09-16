-- AlterTable
ALTER TABLE `FriendOfferGroup` ADD COLUMN `eligibilitySnapshot` LONGTEXT NULL,
    ADD COLUMN `offerTermsSnapshot` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `FriendOfferParticipant` ADD COLUMN `attributionSnapshot` LONGTEXT NULL;

