-- FITZONE V5: independent friend-offer invitation / entitlements / commissions / booking / attendance.
-- ADDITIVE migration. Apply ONLY to a fresh, backed-up, explicitly isolated MySQL sandbox.
-- Historical FriendOfferParticipant/UserMembership and bookings are never rewritten.
-- Do not apply to production until preflight proves no prior manual/partial DDL.

ALTER TABLE `FriendOfferGroup`
  ADD COLUMN `individualInvitesEnabled` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `FriendOfferParticipant`
  ADD COLUMN `independentCommissionSnapshot` LONGTEXT NULL;

CREATE TABLE `FriendOfferInviteLink` (
  `id` VARCHAR(191) NOT NULL,
  `groupId` VARCHAR(191) NOT NULL,
  `token` VARCHAR(128) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `acceptedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `acceptedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `FriendOfferInviteLink_token_key` ON `FriendOfferInviteLink`(`token`);
CREATE INDEX `FriendOfferInviteLink_groupId_status_idx` ON `FriendOfferInviteLink`(`groupId`, `status`);
CREATE INDEX `FriendOfferInviteLink_expiresAt_status_idx` ON `FriendOfferInviteLink`(`expiresAt`, `status`);
ALTER TABLE `FriendOfferInviteLink`
  ADD CONSTRAINT `FriendOfferInviteLink_groupId_fkey`
  FOREIGN KEY (`groupId`) REFERENCES `FriendOfferGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `FriendOfferEntitlement` (
  `id` VARCHAR(191) NOT NULL,
  `participantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `paymentTransactionId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending_settlement',
  `startDate` DATETIME(3) NOT NULL,
  `endDate` DATETIME(3) NOT NULL,
  `totalSessions` INTEGER NULL,
  `eligibilitySnapshot` LONGTEXT NOT NULL,
  `frozenTermsSnapshot` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `FriendOfferEntitlement_participantId_key` ON `FriendOfferEntitlement`(`participantId`);
CREATE UNIQUE INDEX `FriendOfferEntitlement_paymentTransactionId_key` ON `FriendOfferEntitlement`(`paymentTransactionId`);
CREATE INDEX `FriendOfferEntitlement_userId_status_idx` ON `FriendOfferEntitlement`(`userId`, `status`);
ALTER TABLE `FriendOfferEntitlement`
  ADD CONSTRAINT `FriendOfferEntitlement_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `FriendOfferParticipant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FriendOfferEntitlement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FriendOfferEntitlement_paymentTransactionId_fkey` FOREIGN KEY (`paymentTransactionId`) REFERENCES `PaymentTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `FriendOfferCommission` (
  `id` VARCHAR(191) NOT NULL,
  `participantId` VARCHAR(191) NOT NULL,
  `beneficiaryType` VARCHAR(191) NOT NULL,
  `beneficiaryId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(18,2) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
  `settledAt` DATETIME(3) NULL,
  `snapshot` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `FriendOfferCommission_participant_beneficiary_uq`
  ON `FriendOfferCommission`(`participantId`, `beneficiaryType`, `beneficiaryId`);
CREATE INDEX `FriendOfferCommission_beneficiaryId_status_idx`
  ON `FriendOfferCommission`(`beneficiaryId`, `status`);
ALTER TABLE `FriendOfferCommission`
  ADD CONSTRAINT `FriendOfferCommission_participantId_fkey`
  FOREIGN KEY (`participantId`) REFERENCES `FriendOfferParticipant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Booking` ADD COLUMN `friendOfferEntitlementId` VARCHAR(191) NULL;
CREATE INDEX `Booking_friendOfferEntitlementId_idx` ON `Booking`(`friendOfferEntitlementId`);
ALTER TABLE `Booking`
  ADD CONSTRAINT `Booking_friendOfferEntitlementId_fkey`
  FOREIGN KEY (`friendOfferEntitlementId`) REFERENCES `FriendOfferEntitlement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AttendancePass` ADD COLUMN `friendOfferEntitlementId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `AttendancePass_friendOfferEntitlementId_key` ON `AttendancePass`(`friendOfferEntitlementId`);
ALTER TABLE `AttendancePass`
  ADD CONSTRAINT `AttendancePass_friendOfferEntitlementId_fkey`
  FOREIGN KEY (`friendOfferEntitlementId`) REFERENCES `FriendOfferEntitlement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
