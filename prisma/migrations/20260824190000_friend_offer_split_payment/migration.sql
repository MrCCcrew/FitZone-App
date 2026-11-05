-- AlterTable
ALTER TABLE `FriendOfferGroup` ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `finalizingAt` DATETIME(3) NULL,
    ADD COLUMN `matchingEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `priceSnapshotMinor` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `FriendOfferParticipant` ADD COLUMN `paidAt` DATETIME(3) NULL,
    ADD COLUMN `paymentTransactionId` VARCHAR(191) NULL,
    ADD COLUMN `shareAmountMinor` INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX `FriendOfferGroup_matchingEnabled_status_idx` ON `FriendOfferGroup`(`matchingEnabled`, `status`);

-- CreateIndex
CREATE UNIQUE INDEX `FriendOfferParticipant_paymentTransactionId_key` ON `FriendOfferParticipant`(`paymentTransactionId`);

-- AddForeignKey
ALTER TABLE `FriendOfferParticipant` ADD CONSTRAINT `FriendOfferParticipant_paymentTransactionId_fkey` FOREIGN KEY (`paymentTransactionId`) REFERENCES `PaymentTransaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

