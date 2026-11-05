CREATE TABLE `BookingRescheduleRequest` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `targetScheduleId` VARCHAR(191) NOT NULL,
    `requestType` VARCHAR(191) NOT NULL DEFAULT 'upcoming_change',
    `absenceReason` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `pendingKey` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `reviewedByUserId` VARCHAR(191) NULL,
    `rejectionReason` TEXT NULL,

    UNIQUE INDEX `BookingRescheduleRequest_pendingKey_key`(`pendingKey`),
    INDEX `BookingRescheduleRequest_bookingId_idx`(`bookingId`),
    INDEX `BookingRescheduleRequest_targetScheduleId_idx`(`targetScheduleId`),
    INDEX `BookingRescheduleRequest_status_idx`(`status`),
    INDEX `BookingRescheduleRequest_requestedAt_idx`(`requestedAt`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BookingRescheduleRequest`
ADD CONSTRAINT `BookingRescheduleRequest_bookingId_fkey`
FOREIGN KEY (`bookingId`)
REFERENCES `Booking`(`id`)
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE `BookingRescheduleRequest`
ADD CONSTRAINT `BookingRescheduleRequest_targetScheduleId_fkey`
FOREIGN KEY (`targetScheduleId`)
REFERENCES `Schedule`(`id`)
ON DELETE CASCADE
ON UPDATE CASCADE;
