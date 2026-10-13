ALTER TABLE `Offer`
    ADD COLUMN `offerBoxEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `offerBoxReservedCount` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `OfferBoxPurchase` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NULL,

    `status` VARCHAR(191) NOT NULL DEFAULT 'pending_payment',

    `offerSnapshot` LONGTEXT NOT NULL,
    `snapshotVersion` INTEGER NOT NULL DEFAULT 1,
    `priceSnapshot` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
    `paymentMethod` VARCHAR(191) NULL,

    `holdExpiresAt` DATETIME(3) NULL,
    `paymentTransactionId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,

    `redeemedAt` DATETIME(3) NULL,
    `redeemedUserMembershipId` VARCHAR(191) NULL,

    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(191) NULL,

    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OfferBoxPurchase_paymentTransactionId_key`
        (`paymentTransactionId`),

    UNIQUE INDEX `OfferBoxPurchase_redeemedUserMembershipId_key`
        (`redeemedUserMembershipId`),

    INDEX `OfferBoxPurchase_userId_status_idx`
        (`userId`, `status`),

    INDEX `OfferBoxPurchase_offerId_status_idx`
        (`offerId`, `status`),

    INDEX `OfferBoxPurchase_status_holdExpiresAt_idx`
        (`status`, `holdExpiresAt`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OfferBoxPurchase`
    ADD CONSTRAINT `OfferBoxPurchase_userId_fkey`
    FOREIGN KEY (`userId`)
    REFERENCES `User`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE `OfferBoxPurchase`
    ADD CONSTRAINT `OfferBoxPurchase_offerId_fkey`
    FOREIGN KEY (`offerId`)
    REFERENCES `Offer`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
ALTER TABLE `OfferBoxPurchase`
    ADD CONSTRAINT `OfferBoxPurchase_paymentTransactionId_fkey`
    FOREIGN KEY (`paymentTransactionId`)
    REFERENCES `PaymentTransaction`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `OfferBoxPurchase`
    ADD CONSTRAINT `OfferBoxPurchase_redeemedUserMembershipId_fkey`
    FOREIGN KEY (`redeemedUserMembershipId`)
    REFERENCES `UserMembership`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
