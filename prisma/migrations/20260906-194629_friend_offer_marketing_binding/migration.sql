ALTER TABLE `MarketingConversion`
  ADD COLUMN `friendOfferParticipantId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `MarketingConversion_friendOfferParticipantId_key`
  ON `MarketingConversion`(`friendOfferParticipantId`);

ALTER TABLE `MarketingConversion`
  ADD CONSTRAINT `MarketingConversion_friendOfferParticipantId_fkey`
  FOREIGN KEY (`friendOfferParticipantId`)
  REFERENCES `FriendOfferParticipant`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
