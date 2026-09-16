-- CreateTable
CREATE TABLE `FixedClassEarning` (
    `id` VARCHAR(191) NOT NULL,
    `monthKey` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
    `scheduledSessions` INTEGER NOT NULL DEFAULT 0,
    `payableSessions` INTEGER NOT NULL DEFAULT 0,
    `presentSessions` INTEGER NOT NULL DEFAULT 0,
    `absentSessions` INTEGER NOT NULL DEFAULT 0,
    `excusedSessions` INTEGER NOT NULL DEFAULT 0,
    `cancelledSessions` INTEGER NOT NULL DEFAULT 0,
    `substituteSessions` INTEGER NOT NULL DEFAULT 0,
    `unrecordedSessions` INTEGER NOT NULL DEFAULT 0,
    `grossAmountMinor` INTEGER NOT NULL DEFAULT 0,
    `absenceDeductionMinor` INTEGER NOT NULL DEFAULT 0,
    `earnedAmountMinor` INTEGER NOT NULL DEFAULT 0,
    `blockReason` TEXT NULL,
    `calculatedAt` DATETIME(3) NULL,
    `calculatedById` VARCHAR(191) NULL,
    `finalizedAt` DATETIME(3) NULL,
    `finalizedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FixedClassEarning_monthKey_status_idx`(`monthKey`, `status`),
    INDEX `FixedClassEarning_employeeId_monthKey_idx`(`employeeId`, `monthKey`),
    INDEX `FixedClassEarning_classId_monthKey_idx`(`classId`, `monthKey`),
    INDEX `FixedClassEarning_calculatedById_calculatedAt_idx`(`calculatedById`, `calculatedAt`),
    INDEX `FixedClassEarning_finalizedById_finalizedAt_idx`(`finalizedById`, `finalizedAt`),
    UNIQUE INDEX `FixedClassEarning_monthKey_employeeId_classId_key`(`monthKey`, `employeeId`, `classId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FixedClassEarningOccurrence` (
    `id` VARCHAR(191) NOT NULL,
    `earningId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NULL,
    `attendanceId` VARCHAR(191) NULL,
    `occurrenceKey` VARCHAR(191) NOT NULL,
    `occurrenceDate` DATE NOT NULL,
    `occurrenceTime` VARCHAR(191) NOT NULL,
    `sourceClassIdSnapshot` VARCHAR(191) NOT NULL,
    `classNameSnapshot` VARCHAR(191) NOT NULL,
    `scheduledTrainerIdSnapshot` VARCHAR(191) NULL,
    `scheduledTrainerNameSnapshot` VARCHAR(191) NOT NULL,
    `scheduledEmployeeIdSnapshot` VARCHAR(191) NULL,
    `scheduledEmployeeCodeSnapshot` VARCHAR(191) NULL,
    `scheduledEmployeeNameSnapshot` VARCHAR(191) NULL,
    `actualTrainerIdSnapshot` VARCHAR(191) NULL,
    `actualTrainerNameSnapshot` VARCHAR(191) NULL,
    `actualEmployeeIdSnapshot` VARCHAR(191) NULL,
    `actualEmployeeCodeSnapshot` VARCHAR(191) NULL,
    `actualEmployeeNameSnapshot` VARCHAR(191) NULL,
    `attendanceStatus` VARCHAR(191) NOT NULL,
    `compensationSource` VARCHAR(191) NOT NULL,
    `coachCompensationTermId` VARCHAR(191) NULL,
    `classCompensationTermId` VARCHAR(191) NULL,
    `monthlyAmountMinor` INTEGER NOT NULL DEFAULT 0,
    `eligibleSessionCount` INTEGER NOT NULL DEFAULT 0,
    `sessionValueMinor` INTEGER NOT NULL DEFAULT 0,
    `deductionMinor` INTEGER NOT NULL DEFAULT 0,
    `earningMinor` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FixedClassEarningOccurrence_occurrenceDate_attendanceStatus_idx`(`occurrenceDate`, `attendanceStatus`),
    INDEX `FixedClassEarningOccurrence_scheduleId_idx`(`scheduleId`),
    INDEX `FixedClassEarningOccurrence_attendanceId_idx`(`attendanceId`),
    INDEX `FixedClassEarningOccurrence_coachCompensationTermId_idx`(`coachCompensationTermId`),
    INDEX `FixedClassEarningOccurrence_classCompensationTermId_idx`(`classCompensationTermId`),
    UNIQUE INDEX `FixedClassEarningOccurrence_earningId_occurrenceKey_key`(`earningId`, `occurrenceKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FixedClassEarning` ADD CONSTRAINT `FixedClassEarning_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarning` ADD CONSTRAINT `FixedClassEarning_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarning` ADD CONSTRAINT `FixedClassEarning_calculatedById_fkey` FOREIGN KEY (`calculatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarning` ADD CONSTRAINT `FixedClassEarning_finalizedById_fkey` FOREIGN KEY (`finalizedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarningOccurrence` ADD CONSTRAINT `FixedClassEarningOccurrence_earningId_fkey` FOREIGN KEY (`earningId`) REFERENCES `FixedClassEarning`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarningOccurrence` ADD CONSTRAINT `FixedClassEarningOccurrence_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `Schedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarningOccurrence` ADD CONSTRAINT `FixedClassEarningOccurrence_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `CoachClassAttendance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarningOccurrence` ADD CONSTRAINT `FixedClassEarningOccurrence_coachCompensationTermId_fkey` FOREIGN KEY (`coachCompensationTermId`) REFERENCES `CoachCompensationTerm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedClassEarningOccurrence` ADD CONSTRAINT `FixedClassEarningOccurrence_classCompensationTermId_fkey` FOREIGN KEY (`classCompensationTermId`) REFERENCES `CoachClassCompensationTerm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

