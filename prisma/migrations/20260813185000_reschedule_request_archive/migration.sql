ALTER TABLE `BookingRescheduleRequest`
ADD COLUMN `archivedAt` DATETIME(3) NULL,
ADD COLUMN `archivedByUserId` VARCHAR(191) NULL;
