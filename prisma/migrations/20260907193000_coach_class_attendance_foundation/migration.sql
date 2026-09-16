-- AlterTable
ALTER TABLE `Trainer` ADD COLUMN `employeeId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `CoachClassAttendance` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NULL,
    `classId` VARCHAR(191) NULL,
    `sourceClassIdSnapshot` VARCHAR(191) NOT NULL,
    `occurrenceKey` VARCHAR(191) NOT NULL,
    `scheduleDate` DATE NOT NULL,
    `scheduleTime` VARCHAR(191) NOT NULL,
    `classNameSnapshot` VARCHAR(191) NOT NULL,
    `classTypeKeySnapshot` VARCHAR(191) NULL,
    `classTypeNameSnapshot` VARCHAR(191) NULL,
    `durationMinutesSnapshot` INTEGER NOT NULL,
    `scheduledTrainerId` VARCHAR(191) NULL,
    `scheduledTrainerNameSnapshot` VARCHAR(191) NOT NULL,
    `scheduledEmployeeId` VARCHAR(191) NULL,
    `scheduledEmployeeCodeSnapshot` VARCHAR(191) NULL,
    `scheduledEmployeeNameSnapshot` VARCHAR(191) NULL,
    `actualTrainerId` VARCHAR(191) NULL,
    `actualTrainerNameSnapshot` VARCHAR(191) NULL,
    `actualEmployeeId` VARCHAR(191) NULL,
    `actualEmployeeCodeSnapshot` VARCHAR(191) NULL,
    `actualEmployeeNameSnapshot` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `recordedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CoachClassAttendance_scheduleId_key`(`scheduleId`),
    UNIQUE INDEX `CoachClassAttendance_occurrenceKey_key`(`occurrenceKey`),
    INDEX `CoachClassAttendance_scheduleDate_status_idx`(`scheduleDate`, `status`),
    INDEX `CoachClassAttendance_classId_scheduleDate_idx`(`classId`, `scheduleDate`),
    INDEX `CoachClassAttendance_scheduledTrainerId_scheduleDate_idx`(`scheduledTrainerId`, `scheduleDate`),
    INDEX `CoachClassAttendance_actualTrainerId_scheduleDate_idx`(`actualTrainerId`, `scheduleDate`),
    INDEX `CoachClassAttendance_scheduledEmployeeId_scheduleDate_idx`(`scheduledEmployeeId`, `scheduleDate`),
    INDEX `CoachClassAttendance_actualEmployeeId_scheduleDate_idx`(`actualEmployeeId`, `scheduleDate`),
    INDEX `CoachClassAttendance_recordedById_scheduleDate_idx`(`recordedById`, `scheduleDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Trainer_employeeId_key` ON `Trainer`(`employeeId`);

-- AddForeignKey
ALTER TABLE `Trainer` ADD CONSTRAINT `Trainer_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachClassAttendance` ADD CONSTRAINT `CoachClassAttendance_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `Schedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachClassAttendance` ADD CONSTRAINT `CoachClassAttendance_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachClassAttendance` ADD CONSTRAINT `CoachClassAttendance_scheduledTrainerId_fkey` FOREIGN KEY (`scheduledTrainerId`) REFERENCES `Trainer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachClassAttendance` ADD CONSTRAINT `CoachClassAttendance_actualTrainerId_fkey` FOREIGN KEY (`actualTrainerId`) REFERENCES `Trainer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachClassAttendance` ADD CONSTRAINT `CoachClassAttendance_scheduledEmployeeId_fkey` FOREIGN KEY (`scheduledEmployeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachClassAttendance` ADD CONSTRAINT `CoachClassAttendance_actualEmployeeId_fkey` FOREIGN KEY (`actualEmployeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachClassAttendance` ADD CONSTRAINT `CoachClassAttendance_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
