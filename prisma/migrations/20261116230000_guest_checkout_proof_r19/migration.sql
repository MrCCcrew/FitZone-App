-- CreateTable
CREATE TABLE `GuestCheckoutProof` (
    `id` VARCHAR(191) NOT NULL,
    `nonceHash` VARCHAR(64) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `orderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GuestCheckoutProof_nonceHash_key`(`nonceHash`),
    UNIQUE INDEX `GuestCheckoutProof_orderId_key`(`orderId`),
    INDEX `GuestCheckoutProof_expiresAt_consumedAt_idx`(`expiresAt`, `consumedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
