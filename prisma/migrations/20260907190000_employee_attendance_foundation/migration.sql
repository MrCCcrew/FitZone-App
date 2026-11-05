-- CreateTable
CREATE TABLE `EmployeeAttendance` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `attendanceDate` DATE NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `scheduledStartTime` VARCHAR(191) NULL,
    `scheduledEndTime` VARCHAR(191) NULL,
    `checkInAt` DATETIME(3) NULL,
    `checkOutAt` DATETIME(3) NULL,
    `lateMinutes` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `recordedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeAttendance_attendanceDate_status_idx`(`attendanceDate`, `status`),
    INDEX `EmployeeAttendance_employeeId_attendanceDate_idx`(`employeeId`, `attendanceDate`),
    INDEX `EmployeeAttendance_recordedById_attendanceDate_idx`(`recordedById`, `attendanceDate`),
    UNIQUE INDEX `EmployeeAttendance_employeeId_attendanceDate_key`(`employeeId`, `attendanceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendancePeriod` (
    `id` VARCHAR(191) NOT NULL,
    `monthKey` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `lockedAt` DATETIME(3) NULL,
    `lockedById` VARCHAR(191) NULL,
    `unlockedAt` DATETIME(3) NULL,
    `unlockedById` VARCHAR(191) NULL,
    `unlockReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AttendancePeriod_monthKey_key`(`monthKey`),
    INDEX `AttendancePeriod_status_monthKey_idx`(`status`, `monthKey`),
    INDEX `AttendancePeriod_lockedById_lockedAt_idx`(`lockedById`, `lockedAt`),
    INDEX `AttendancePeriod_unlockedById_unlockedAt_idx`(`unlockedById`, `unlockedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmployeeAttendance` ADD CONSTRAINT `EmployeeAttendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAttendance` ADD CONSTRAINT `EmployeeAttendance_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendancePeriod` ADD CONSTRAINT `AttendancePeriod_lockedById_fkey` FOREIGN KEY (`lockedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendancePeriod` ADD CONSTRAINT `AttendancePeriod_unlockedById_fkey` FOREIGN KEY (`unlockedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
