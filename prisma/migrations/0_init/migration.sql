-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` VARCHAR(191) NULL,
    `access_token` VARCHAR(191) NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` VARCHAR(191) NULL,
    `session_state` VARCHAR(191) NULL,

    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider` ASC, `providerAccountId` ASC),
    INDEX `Account_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountingExpense` (
    `id` VARCHAR(191) NOT NULL,
    `businessUnit` VARCHAR(191) NOT NULL DEFAULT 'store',
    `category` VARCHAR(191) NOT NULL DEFAULT 'general',
    `label` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `amount` DOUBLE NOT NULL,
    `vendor` VARCHAR(191) NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `expenseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AccountingExpense_businessUnit_expenseDate_idx`(`businessUnit` ASC, `expenseDate` ASC),
    INDEX `AccountingExpense_category_expenseDate_idx`(`category` ASC, `expenseDate` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountingFeeRule` (
    `id` VARCHAR(191) NOT NULL,
    `businessUnit` VARCHAR(191) NOT NULL DEFAULT 'both',
    `category` VARCHAR(191) NOT NULL DEFAULT 'platform',
    `label` VARCHAR(191) NOT NULL,
    `appliesToPurpose` VARCHAR(191) NOT NULL DEFAULT 'all',
    `provider` VARCHAR(191) NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `rateType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `rateValue` DOUBLE NOT NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AccountingFeeRule_businessUnit_isActive_idx`(`businessUnit` ASC, `isActive` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentCommission` (
    `id` VARCHAR(191) NOT NULL,
    `agentUserId` VARCHAR(191) NOT NULL,
    `userMembershipId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentCommission_agentUserId_status_idx`(`agentUserId` ASC, `status` ASC),
    INDEX `AgentCommission_createdAt_idx`(`createdAt` ASC),
    UNIQUE INDEX `AgentCommission_userMembershipId_key`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceCheckIn` (
    `id` VARCHAR(191) NOT NULL,
    `passId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userMembershipId` VARCHAR(191) NULL,
    `privateSessionApplicationId` VARCHAR(191) NULL,
    `bookingId` VARCHAR(191) NULL,
    `scheduleId` VARCHAR(191) NULL,
    `scannedByUserId` VARCHAR(191) NULL,
    `checkInType` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AttendanceCheckIn_bookingId_key`(`bookingId` ASC),
    INDEX `AttendanceCheckIn_passId_fkey`(`passId` ASC),
    INDEX `AttendanceCheckIn_privateSessionApplicationId_fkey`(`privateSessionApplicationId` ASC),
    INDEX `AttendanceCheckIn_scannedByUserId_createdAt_idx`(`scannedByUserId` ASC, `createdAt` ASC),
    INDEX `AttendanceCheckIn_scheduleId_createdAt_idx`(`scheduleId` ASC, `createdAt` ASC),
    INDEX `AttendanceCheckIn_userId_createdAt_idx`(`userId` ASC, `createdAt` ASC),
    INDEX `AttendanceCheckIn_userMembershipId_fkey`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendancePass` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userMembershipId` VARCHAR(191) NULL,
    `privateSessionApplicationId` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `label` VARCHAR(191) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AttendancePass_code_key`(`code` ASC),
    UNIQUE INDEX `AttendancePass_privateSessionApplicationId_key`(`privateSessionApplicationId` ASC),
    INDEX `AttendancePass_userId_status_idx`(`userId` ASC, `status` ASC),
    UNIQUE INDEX `AttendancePass_userMembershipId_key`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NULL,
    `actorEmail` VARCHAR(191) NULL,
    `actorRole` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `details` LONGTEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId` ASC, `createdAt` ASC),
    INDEX `AuditLog_targetType_createdAt_idx`(`targetType` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'confirmed',
    `paidAmount` DOUBLE NOT NULL DEFAULT 0,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'wallet',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userMembershipId` VARCHAR(191) NULL,
    `reminderSentAt` DATETIME(3) NULL,

    INDEX `Booking_scheduleId_fkey`(`scheduleId` ASC),
    INDEX `Booking_userId_fkey`(`userId` ASC),
    INDEX `Booking_userMembershipId_idx`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatKnowledgeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'general',
    `keywords` VARCHAR(191) NOT NULL,
    `answer` VARCHAR(191) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `senderType` VARCHAR(191) NOT NULL,
    `senderName` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `metadata` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_sessionId_fkey`(`sessionId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatSession` (
    `id` VARCHAR(191) NOT NULL,
    `visitorName` VARCHAR(191) NULL,
    `visitorPhone` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `mode` VARCHAR(191) NOT NULL DEFAULT 'bot',
    `context` LONGTEXT NULL,
    `assignedToId` VARCHAR(191) NULL,
    `recommendedMembershipId` VARCHAR(191) NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatSession_assignedToId_fkey`(`assignedToId` ASC),
    INDEX `ChatSession_recommendedMembershipId_fkey`(`recommendedMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Class` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `trainerId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `duration` INTEGER NOT NULL,
    `intensity` VARCHAR(191) NOT NULL,
    `maxSpots` INTEGER NOT NULL DEFAULT 15,
    `price` DOUBLE NOT NULL DEFAULT 0,
    `image` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `category` VARCHAR(191) NULL,
    `subType` VARCHAR(191) NULL,
    `showTrainerName` BOOLEAN NOT NULL DEFAULT true,
    `categoryEn` VARCHAR(191) NULL,
    `descriptionEn` TEXT NULL,
    `nameEn` VARCHAR(191) NULL,
    `subTypeEn` VARCHAR(191) NULL,
    `typeEn` VARCHAR(191) NULL,

    INDEX `Class_trainerId_fkey`(`trainerId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClubGoal` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `image` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'standard',
    `parentId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `descriptionEn` TEXT NULL,
    `nameEn` VARCHAR(191) NULL,

    INDEX `ClubGoal_parentId_fkey`(`parentId` ASC),
    UNIQUE INDEX `ClubGoal_slug_key`(`slug` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoachCheckIn` (
    `id` VARCHAR(191) NOT NULL,
    `coachProfileId` VARCHAR(191) NOT NULL,
    `weight` DOUBLE NULL,
    `waist` DOUBLE NULL,
    `energyLevel` INTEGER NULL,
    `adherenceScore` INTEGER NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CoachCheckIn_coachProfileId_fkey`(`coachProfileId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoachEventLog` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `intent` VARCHAR(191) NOT NULL,
    `usedAI` BOOLEAN NOT NULL DEFAULT false,
    `handoff` BOOLEAN NOT NULL DEFAULT false,
    `outcome` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoachProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `guestSessionId` VARCHAR(191) NULL,
    `primaryGoal` VARCHAR(191) NULL,
    `trainingLevel` VARCHAR(191) NULL,
    `preferredDays` INTEGER NULL,
    `preferredClassTypes` TEXT NULL,
    `injuries` TEXT NULL,
    `nutritionStyle` VARCHAR(191) NULL,
    `targetWeight` DOUBLE NULL,
    `currentWeight` DOUBLE NULL,
    `height` DOUBLE NULL,
    `age` INTEGER NULL,
    `notes` TEXT NULL,
    `lastAssessmentAt` DATETIME(3) NULL,
    `lastCheckInAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CoachProfile_guestSessionId_key`(`guestSessionId` ASC),
    UNIQUE INDEX `CoachProfile_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Complaint` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `adminNote` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Complaint_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractsManager` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `commissionType` VARCHAR(191) NOT NULL DEFAULT 'percentage_of_agents',
    `commissionRate` DOUBLE NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContractsManager_userId_idx`(`userId` ASC),
    UNIQUE INDEX `ContractsManager_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryCompany` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'courier',
    `phone` VARCHAR(191) NULL,
    `contactPerson` VARCHAR(191) NULL,
    `defaultFee` DOUBLE NOT NULL DEFAULT 0,
    `estimatedDays` VARCHAR(191) NULL,
    `supportsCOD` BOOLEAN NOT NULL DEFAULT true,
    `codFeeType` VARCHAR(191) NULL,
    `codFeeValue` DOUBLE NULL,
    `collectsPayment` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeliveryCompany_isActive_idx`(`isActive` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryOption` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'courier',
    `description` TEXT NULL,
    `fee` DOUBLE NOT NULL DEFAULT 0,
    `estimatedDaysMin` INTEGER NULL,
    `estimatedDaysMax` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `showCashOnDelivery` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `descriptionEn` TEXT NULL,
    `nameEn` VARCHAR(191) NULL,

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryZone` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `governorate` VARCHAR(191) NOT NULL,
    `fee` DOUBLE NOT NULL,
    `estimatedDays` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DeliveryZone_companyId_governorate_key`(`companyId` ASC, `governorate` ASC),
    INDEX `DeliveryZone_companyId_isActive_idx`(`companyId` ASC, `isActive` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscountCode` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `descriptionEn` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `value` DOUBLE NOT NULL,
    `minAmount` DOUBLE NULL,
    `maxUses` INTEGER NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'all',

    UNIQUE INDEX `DiscountCode_code_key`(`code` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscountCodeUsage` (
    `id` VARCHAR(191) NOT NULL,
    `discountCodeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `membershipId` VARCHAR(191) NULL,
    `discountAmount` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DiscountCodeUsage_discountCodeId_fkey`(`discountCodeId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoalClassRule` (
    `id` VARCHAR(191) NOT NULL,
    `goalId` VARCHAR(191) NOT NULL,
    `classType` VARCHAR(191) NOT NULL,
    `rule` VARCHAR(191) NOT NULL DEFAULT 'recommended',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GoalClassRule_goalId_classType_rule_key`(`goalId` ASC, `classType` ASC, `rule` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HealthQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `prompt` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `promptEn` TEXT NULL,
    `titleEn` VARCHAR(191) NULL,
    `allowReason` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `HealthQuestion_slug_key`(`slug` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HealthQuestionRestriction` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `classType` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `HealthQuestionRestriction_questionId_classType_key`(`questionId` ASC, `classType` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HealthResponse` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `answer` BOOLEAN NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HealthResponse_questionId_fkey`(`questionId` ASC),
    INDEX `HealthResponse_userId_idx`(`userId` ASC),
    UNIQUE INDEX `HealthResponse_userId_questionId_key`(`userId` ASC, `questionId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryMovement` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `quantityChange` INTEGER NOT NULL,
    `quantityBefore` INTEGER NOT NULL,
    `quantityAfter` INTEGER NOT NULL,
    `unitCost` DOUBLE NULL,
    `averageCostBefore` DOUBLE NULL,
    `averageCostAfter` DOUBLE NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `performedByUserId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `variantId` VARCHAR(191) NULL,

    INDEX `InventoryMovement_performedByUserId_fkey`(`performedByUserId` ASC),
    INDEX `InventoryMovement_productId_createdAt_idx`(`productId` ASC, `createdAt` ASC),
    INDEX `InventoryMovement_type_createdAt_idx`(`type` ASC, `createdAt` ASC),
    INDEX `InventoryMovement_variantId_createdAt_idx`(`variantId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `supplierName` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    `totalCost` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `invoiceDate` DATETIME(3) NULL,
    `invoiceNumber` VARCHAR(191) NULL,
    `performedByUserId` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NULL,

    INDEX `InventoryReceipt_performedByUserId_fkey`(`performedByUserId` ASC),
    UNIQUE INDEX `InventoryReceipt_referenceNumber_key`(`referenceNumber` ASC),
    INDEX `InventoryReceipt_status_createdAt_idx`(`status` ASC, `createdAt` ASC),
    INDEX `InventoryReceipt_supplierId_idx`(`supplierId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryReceiptItem` (
    `id` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `totalCost` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,
    `sellingPrice` DOUBLE NULL,
    `sku` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NULL,

    INDEX `InventoryReceiptItem_productId_idx`(`productId` ASC),
    INDEX `InventoryReceiptItem_receiptId_idx`(`receiptId` ASC),
    INDEX `InventoryReceiptItem_variantId_fkey`(`variantId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ManagerCommission` (
    `id` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `agentCommissionId` VARCHAR(191) NULL,
    `userMembershipId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ManagerCommission_agentCommissionId_key`(`agentCommissionId` ASC),
    INDEX `ManagerCommission_createdAt_idx`(`createdAt` ASC),
    INDEX `ManagerCommission_managerId_status_idx`(`managerId` ASC, `status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ManagerPartnerCommission` (
    `id` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `partnerCommissionId` VARCHAR(191) NULL,
    `userMembershipId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ManagerPartnerCommission_createdAt_idx`(`createdAt` ASC),
    INDEX `ManagerPartnerCommission_managerId_status_idx`(`managerId` ASC, `status` ASC),
    UNIQUE INDEX `ManagerPartnerCommission_partnerCommissionId_key`(`partnerCommissionId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Membership` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DOUBLE NOT NULL,
    `duration` INTEGER NOT NULL,
    `features` TEXT NOT NULL,
    `maxClasses` INTEGER NOT NULL DEFAULT -1,
    `walletBonus` DOUBLE NOT NULL DEFAULT 0,
    `gift` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'subscription',
    `cycle` VARCHAR(191) NULL,
    `sessionsCount` INTEGER NULL,
    `classSessions` LONGTEXT NULL,
    `priceAfter` DOUBLE NULL,
    `priceBefore` DOUBLE NULL,
    `productRewards` LONGTEXT NULL,
    `image` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `featuresEn` TEXT NULL,
    `giftEn` VARCHAR(191) NULL,
    `nameEn` VARCHAR(191) NULL,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `subtitle` TEXT NULL,
    `discountPct` DOUBLE NULL,
    `maxMonths` INTEGER NULL,
    `minMonths` INTEGER NULL,

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MembershipGoal` (
    `id` VARCHAR(191) NOT NULL,
    `membershipId` VARCHAR(191) NOT NULL,
    `goalId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MembershipGoal_goalId_idx`(`goalId` ASC),
    UNIQUE INDEX `MembershipGoal_membershipId_goalId_key`(`membershipId` ASC, `goalId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'info',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NutritionCommission` (
    `id` VARCHAR(191) NOT NULL,
    `nutritionistUserId` VARCHAR(191) NOT NULL,
    `nutritionReferralLinkId` VARCHAR(191) NULL,
    `userMembershipId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NutritionCommission_createdAt_idx`(`createdAt` ASC),
    INDEX `NutritionCommission_nutritionReferralLinkId_fkey`(`nutritionReferralLinkId` ASC),
    INDEX `NutritionCommission_nutritionistUserId_status_idx`(`nutritionistUserId` ASC, `status` ASC),
    UNIQUE INDEX `NutritionCommission_userMembershipId_key`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NutritionReferralLink` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NutritionReferralLink_token_key`(`token` ASC),
    INDEX `NutritionReferralLink_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NutritionSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `nutritionistId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'consultation',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `isGymMember` BOOLEAN NOT NULL DEFAULT false,
    `price` DOUBLE NOT NULL,
    `formJson` LONGTEXT NULL,
    `selectedSlot` VARCHAR(191) NULL,
    `proposedSlots` TEXT NULL,
    `doctorNote` TEXT NULL,
    `paymentTransactionId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `NutritionSession_nutritionistId_idx`(`nutritionistId` ASC),
    INDEX `NutritionSession_status_idx`(`status` ASC),
    INDEX `NutritionSession_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NutritionistProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `bio` TEXT NULL,
    `image` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `showOnHome` BOOLEAN NOT NULL DEFAULT true,
    `slotsJson` TEXT NULL,
    `consultationFee` DOUBLE NOT NULL DEFAULT 400,
    `consultationFeeMember` DOUBLE NOT NULL DEFAULT 300,
    `followupFee` DOUBLE NOT NULL DEFAULT 100,
    `followupFeeMember` DOUBLE NOT NULL DEFAULT 50,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `commissionRate` DOUBLE NOT NULL DEFAULT 0,
    `commissionType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `questionsJson` TEXT NULL,

    INDEX `NutritionistProfile_isActive_idx`(`isActive` ASC),
    UNIQUE INDEX `NutritionistProfile_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `discount` DOUBLE NOT NULL,
    `description` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `appliesTo` TEXT NULL,
    `currentSubscribers` INTEGER NOT NULL DEFAULT 0,
    `image` VARCHAR(191) NULL,
    `maxSubscribers` INTEGER NULL,
    `membershipId` VARCHAR(191) NULL,
    `showOnHome` BOOLEAN NOT NULL DEFAULT false,
    `specialPrice` DOUBLE NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `showMaxSubscribers` BOOLEAN NOT NULL DEFAULT true,
    `appliesToEn` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `titleEn` VARCHAR(191) NULL,
    `showCurrentSubscribers` BOOLEAN NOT NULL DEFAULT true,
    `durationDays` INTEGER NULL,
    `sessionsCount` INTEGER NULL,
    `priceBefore` DOUBLE NULL,
    `features` TEXT NULL,
    `featuresEn` TEXT NULL,

    INDEX `Offer_membershipId_fkey`(`membershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `total` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `address` VARCHAR(191) NULL,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'card',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `businessUnit` VARCHAR(191) NOT NULL DEFAULT 'store',
    `deliveryLabel` VARCHAR(191) NULL,
    `deliveryOptionId` VARCHAR(191) NULL,
    `discountTotal` DOUBLE NOT NULL DEFAULT 0,
    `estimatedDeliveryDays` INTEGER NULL,
    `isClubPickup` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `recipientName` VARCHAR(191) NULL,
    `recipientPhone` VARCHAR(191) NULL,
    `shippingFee` DOUBLE NOT NULL DEFAULT 0,
    `subtotal` DOUBLE NOT NULL DEFAULT 0,
    `adminNotes` TEXT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `city` VARCHAR(191) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `deliveryCompanyId` VARCHAR(191) NULL,
    `governorate` VARCHAR(191) NULL,
    `inventoryDeducted` BOOLEAN NOT NULL DEFAULT false,
    `trackingNumber` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Order_deliveryCompanyId_idx`(`deliveryCompanyId` ASC),
    INDEX `Order_deliveryOptionId_fkey`(`deliveryOptionId` ASC),
    INDEX `Order_status_createdAt_idx`(`status` ASC, `createdAt` ASC),
    INDEX `Order_userId_createdAt_idx`(`userId` ASC, `createdAt` ASC),
    INDEX `Order_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL,
    `size` VARCHAR(191) NULL,
    `vatAmount` DOUBLE NOT NULL DEFAULT 0,
    `color` VARCHAR(191) NULL,
    `costPrice` DOUBLE NULL,
    `variantId` VARCHAR(191) NULL,

    INDEX `OrderItem_orderId_idx`(`orderId` ASC),
    INDEX `OrderItem_productId_idx`(`productId` ASC),
    INDEX `OrderItem_variantId_fkey`(`variantId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `performedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderStatusHistory_orderId_createdAt_idx`(`orderId` ASC, `createdAt` ASC),
    INDEX `OrderStatusHistory_performedByUserId_fkey`(`performedByUserId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Partner` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `websiteUrl` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `commissionRate` DOUBLE NOT NULL DEFAULT 10,
    `commissionType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `showOnPublicPage` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `contractEndDate` DATETIME(3) NULL,
    `contractStartDate` DATETIME(3) NULL,
    `memberBenefitCode` VARCHAR(191) NULL,
    `memberBenefitRate` DOUBLE NULL,
    `referralDiscountRate` DOUBLE NULL,
    `managerCommissionRate` DOUBLE NULL,
    `managerCommissionType` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NULL,

    INDEX `Partner_isActive_idx`(`isActive` ASC),
    INDEX `Partner_managerId_idx`(`managerId` ASC),
    UNIQUE INDEX `Partner_memberBenefitCode_key`(`memberBenefitCode` ASC),
    UNIQUE INDEX `Partner_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerAffiliateLink` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerAffiliateLink_partnerId_idx`(`partnerId` ASC),
    INDEX `PartnerAffiliateLink_token_idx`(`token` ASC),
    UNIQUE INDEX `PartnerAffiliateLink_token_key`(`token` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerCode` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `discountType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `discountValue` DOUBLE NOT NULL,
    `maxUsage` INTEGER NULL,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerCode_code_idx`(`code` ASC),
    UNIQUE INDEX `PartnerCode_code_key`(`code` ASC),
    INDEX `PartnerCode_partnerId_idx`(`partnerId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerCommission` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `userMembershipId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `withdrawnAt` DATETIME(3) NULL,

    INDEX `PartnerCommission_createdAt_idx`(`createdAt` ASC),
    INDEX `PartnerCommission_partnerId_status_idx`(`partnerId` ASC, `status` ASC),
    UNIQUE INDEX `PartnerCommission_userMembershipId_key`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerWithdrawalRequest` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `adminNotes` VARCHAR(191) NULL,
    `receiptUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `PartnerWithdrawalRequest_createdAt_idx`(`createdAt` ASC),
    INDEX `PartnerWithdrawalRequest_partnerId_idx`(`partnerId` ASC),
    INDEX `PartnerWithdrawalRequest_status_idx`(`status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PasswordResetToken_identifier_token_key`(`identifier` ASC, `token` ASC),
    UNIQUE INDEX `PasswordResetToken_token_key`(`token` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentReferenceCounter` (
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `membershipId` VARCHAR(191) NULL,
    `offerId` VARCHAR(191) NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerReference` VARCHAR(191) NULL,
    `externalReference` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'card',
    `checkoutUrl` TEXT NULL,
    `iframeUrl` TEXT NULL,
    `returnUrl` TEXT NULL,
    `cancelUrl` TEXT NULL,
    `providerPayload` LONGTEXT NULL,
    `metadata` LONGTEXT NULL,
    `expiresAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `businessUnit` VARCHAR(191) NOT NULL DEFAULT 'store',
    `referenceCode` VARCHAR(191) NULL,

    UNIQUE INDEX `PaymentTransaction_externalReference_key`(`externalReference` ASC),
    INDEX `PaymentTransaction_orderId_idx`(`orderId` ASC),
    UNIQUE INDEX `PaymentTransaction_providerReference_key`(`providerReference` ASC),
    INDEX `PaymentTransaction_provider_status_idx`(`provider` ASC, `status` ASC),
    UNIQUE INDEX `PaymentTransaction_referenceCode_key`(`referenceCode` ASC),
    INDEX `PaymentTransaction_userId_status_idx`(`userId` ASC, `status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrivateSessionApplication` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `trainerId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'private',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `goalsJson` TEXT NULL,
    `injuries` TEXT NULL,
    `availability` TEXT NULL,
    `notes` TEXT NULL,
    `trainerNote` TEXT NULL,
    `trainerPrice` DOUBLE NULL,
    `paymentTransactionId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `applicationFormJson` LONGTEXT NULL,
    `durationDays` INTEGER NULL,
    `expiresAt` DATETIME(3) NULL,
    `sessionsCount` INTEGER NULL,
    `selectedSlot` VARCHAR(191) NULL,
    `trainerSlots` TEXT NULL,

    INDEX `PrivateSessionApplication_trainerId_idx`(`trainerId` ASC),
    INDEX `PrivateSessionApplication_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `price` DOUBLE NOT NULL,
    `oldPrice` DOUBLE NULL,
    `category` VARCHAR(191) NOT NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `images` TEXT NULL,
    `sizes` TEXT NULL,
    `colors` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `averageCost` DOUBLE NOT NULL DEFAULT 0,
    `lastPurchaseCost` DOUBLE NOT NULL DEFAULT 0,
    `reorderLevel` INTEGER NOT NULL DEFAULT 0,
    `sku` VARCHAR(191) NULL,
    `trackInventory` BOOLEAN NOT NULL DEFAULT true,
    `unitLabel` VARCHAR(191) NULL,
    `descriptionEn` TEXT NULL,
    `nameEn` VARCHAR(191) NULL,
    `disclaimer` TEXT NULL,
    `editorialReview` TEXT NULL,
    `faqs` TEXT NULL,
    `importantInfo` TEXT NULL,
    `whoShouldBuy` TEXT NULL,
    `vatEnabled` BOOLEAN NOT NULL DEFAULT false,
    `barcode` VARCHAR(191) NULL,
    `costPrice` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `isBestSeller` BOOLEAN NOT NULL DEFAULT false,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isNew` BOOLEAN NOT NULL DEFAULT false,
    `isSpecialOffer` BOOLEAN NOT NULL DEFAULT false,
    `supplierId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Product_category_isActive_idx`(`category` ASC, `isActive` ASC),
    INDEX `Product_deletedAt_idx`(`deletedAt` ASC),
    UNIQUE INDEX `Product_sku_key`(`sku` ASC),
    INDEX `Product_supplierId_idx`(`supplierId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductCategory` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sizeType` VARCHAR(191) NOT NULL DEFAULT 'none',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `labelEn` VARCHAR(191) NULL,
    `icon` VARCHAR(191) NULL,

    UNIQUE INDEX `ProductCategory_key_key`(`key` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductReview` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductReview_productId_userId_key`(`productId` ASC, `userId` ASC),
    INDEX `ProductReview_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `size` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `sku` VARCHAR(191) NULL,
    `barcode` VARCHAR(191) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `price` DOUBLE NULL,
    `costPrice` DOUBLE NULL,
    `image` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductVariant_productId_isActive_idx`(`productId` ASC, `isActive` ASC),
    INDEX `ProductVariant_sku_idx`(`sku` ASC),
    UNIQUE INDEX `ProductVariant_sku_key`(`sku` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `url` VARCHAR(191) NULL,
    `audience` VARCHAR(191) NOT NULL DEFAULT 'all',
    `selectedUsers` LONGTEXT NULL,
    `sentCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'done',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(191) NULL,

    INDEX `PushCampaign_createdAt_idx`(`createdAt` ASC),
    INDEX `PushCampaign_createdBy_fkey`(`createdBy` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `endpoint` VARCHAR(512) NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint` ASC),
    INDEX `PushSubscription_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuickReply` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Referral` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `totalEarned` DOUBLE NOT NULL DEFAULT 0,
    `referredCount` INTEGER NOT NULL DEFAULT 0,
    `subscriptionActivatedCount` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Referral_code_key`(`code` ASC),
    UNIQUE INDEX `Referral_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralUsage` (
    `id` VARCHAR(191) NOT NULL,
    `referralId` VARCHAR(191) NOT NULL,
    `referredUserId` VARCHAR(191) NOT NULL,
    `rewardGiven` BOOLEAN NOT NULL DEFAULT false,
    `rewardType` VARCHAR(191) NULL,
    `rewardValue` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `subscriptionActivated` BOOLEAN NOT NULL DEFAULT false,
    `subscriptionActivatedAt` DATETIME(3) NULL,

    INDEX `ReferralUsage_referralId_fkey`(`referralId` ASC),
    UNIQUE INDEX `ReferralUsage_referredUserId_key`(`referredUserId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardHistory` (
    `id` VARCHAR(191) NOT NULL,
    `rewardId` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RewardHistory_rewardId_fkey`(`rewardId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardPoints` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `tier` VARCHAR(191) NOT NULL DEFAULT 'bronze',

    UNIQUE INDEX `RewardPoints_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesAgent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `referralCode` VARCHAR(191) NOT NULL,
    `commissionRate` DOUBLE NOT NULL DEFAULT 0,
    `commissionType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `clientDiscountType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `clientDiscountValue` DOUBLE NOT NULL DEFAULT 0,
    `maxClientDiscount` DOUBLE NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `managerId` VARCHAR(191) NULL,

    INDEX `SalesAgent_managerId_idx`(`managerId` ASC),
    INDEX `SalesAgent_referralCode_idx`(`referralCode` ASC),
    UNIQUE INDEX `SalesAgent_referralCode_key`(`referralCode` ASC),
    INDEX `SalesAgent_userId_idx`(`userId` ASC),
    UNIQUE INDEX `SalesAgent_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesAgentCommission` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `userMembershipId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalesAgentCommission_agentId_status_idx`(`agentId` ASC, `status` ASC),
    INDEX `SalesAgentCommission_createdAt_idx`(`createdAt` ASC),
    UNIQUE INDEX `SalesAgentCommission_userMembershipId_key`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesAgentReferral` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `convertedAt` DATETIME(3) NULL,
    `totalSpent` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalesAgentReferral_agentId_idx`(`agentId` ASC),
    UNIQUE INDEX `SalesAgentReferral_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Schedule` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `time` VARCHAR(191) NOT NULL,
    `availableSpots` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `Schedule_classId_fkey`(`classId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken` ASC),
    INDEX `Session_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteContent` (
    `id` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SiteContent_section_key`(`section` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffCommission` (
    `id` VARCHAR(191) NOT NULL,
    `staffUserId` VARCHAR(191) NOT NULL,
    `staffReferralLinkId` VARCHAR(191) NULL,
    `userMembershipId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StaffCommission_createdAt_idx`(`createdAt` ASC),
    INDEX `StaffCommission_staffReferralLinkId_fkey`(`staffReferralLinkId` ASC),
    INDEX `StaffCommission_staffUserId_status_idx`(`staffUserId` ASC, `status` ASC),
    UNIQUE INDEX `StaffCommission_userMembershipId_key`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffDiscountCode` (
    `id` VARCHAR(191) NOT NULL,
    `staffUserId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `targetUserId` VARCHAR(191) NOT NULL,
    `discountType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `discountValue` DOUBLE NOT NULL,
    `maxDiscount` DOUBLE NULL,
    `note` VARCHAR(191) NULL,
    `isUsed` BOOLEAN NOT NULL DEFAULT false,
    `usedAt` DATETIME(3) NULL,
    `monthYear` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StaffDiscountCode_code_idx`(`code` ASC),
    UNIQUE INDEX `StaffDiscountCode_code_key`(`code` ASC),
    INDEX `StaffDiscountCode_staffUserId_monthYear_idx`(`staffUserId` ASC, `monthYear` ASC),
    INDEX `StaffDiscountCode_targetUserId_fkey`(`targetUserId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffReferralLink` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffReferralLink_token_key`(`token` ASC),
    INDEX `StaffReferralLink_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreFreeGiftsSession` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `step` INTEGER NOT NULL DEFAULT 1,
    `spinsDone` INTEGER NOT NULL DEFAULT 0,
    `spinRewardType` VARCHAR(191) NULL,
    `spinRewardValue` DOUBLE NULL,
    `spinSlotIndex` INTEGER NULL,
    `spinLabelAr` VARCHAR(191) NULL,
    `cardsDone` INTEGER NOT NULL DEFAULT 0,
    `cardsData` TEXT NOT NULL,
    `selectedProductIds` TEXT NOT NULL,
    `giftSlotsCount` INTEGER NOT NULL DEFAULT 3,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `expiresAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `storeOrderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StoreFreeGiftsSession_storeOrderId_key`(`storeOrderId` ASC),
    INDEX `StoreFreeGiftsSession_token_idx`(`token` ASC),
    UNIQUE INDEX `StoreFreeGiftsSession_token_key`(`token` ASC),
    INDEX `StoreFreeGiftsSession_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreGiftCampaignClaim` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `storeOrderId` VARCHAR(191) NULL,
    `campaignKey` VARCHAR(191) NOT NULL DEFAULT 'default',
    `rewardType` VARCHAR(191) NOT NULL,
    `rewardValue` DOUBLE NULL,
    `rewardProductId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `source` VARCHAR(191) NOT NULL DEFAULT 'store_cart_threshold',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimedAt` DATETIME(3) NULL,

    INDEX `StoreGiftCampaignClaim_storeOrderId_idx`(`storeOrderId` ASC),
    INDEX `StoreGiftCampaignClaim_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `commissionRate` DOUBLE NULL,
    `commissionType` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Supplier_deletedAt_idx`(`deletedAt` ASC),
    INDEX `Supplier_isActive_idx`(`isActive` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupportPresence` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SupportPresence_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Testimonial` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `content` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL DEFAULT 5,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `adminNote` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `contentEn` TEXT NULL,
    `displayNameEn` VARCHAR(191) NULL,

    INDEX `Testimonial_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Trainer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `specialty` VARCHAR(191) NOT NULL,
    `bio` VARCHAR(191) NULL,
    `certifications` TEXT NULL,
    `rating` DOUBLE NOT NULL DEFAULT 5,
    `sessionsCount` INTEGER NOT NULL DEFAULT 0,
    `image` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `showOnHome` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `bioEn` TEXT NULL,
    `certificationsEn` TEXT NULL,
    `nameEn` VARCHAR(191) NULL,
    `specialtyEn` VARCHAR(191) NULL,
    `certificateFiles` LONGTEXT NULL,
    `userId` VARCHAR(191) NULL,
    `canSendGifts` BOOLEAN NOT NULL DEFAULT false,
    `giftMonthlyLimit` INTEGER NOT NULL DEFAULT 4,
    `canAddBookings` BOOLEAN NOT NULL DEFAULT false,
    `canAddClasses` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Trainer_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainerAttendanceLog` (
    `id` VARCHAR(191) NOT NULL,
    `trainerId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `recordedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TrainerAttendanceLog_date_idx`(`date` ASC),
    INDEX `TrainerAttendanceLog_recordedById_fkey`(`recordedById` ASC),
    INDEX `TrainerAttendanceLog_trainerId_date_idx`(`trainerId` ASC, `date` ASC),
    UNIQUE INDEX `TrainerAttendanceLog_trainerId_date_key`(`trainerId` ASC, `date` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainerCommission` (
    `id` VARCHAR(191) NOT NULL,
    `trainerUserId` VARCHAR(191) NOT NULL,
    `trainerReferralLinkId` VARCHAR(191) NULL,
    `userMembershipId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'earned',
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrainerCommission_createdAt_idx`(`createdAt` ASC),
    INDEX `TrainerCommission_trainerReferralLinkId_fkey`(`trainerReferralLinkId` ASC),
    INDEX `TrainerCommission_trainerUserId_status_idx`(`trainerUserId` ASC, `status` ASC),
    UNIQUE INDEX `TrainerCommission_userMembershipId_key`(`userMembershipId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainerDiscountCode` (
    `id` VARCHAR(191) NOT NULL,
    `trainerId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `targetUserId` VARCHAR(191) NOT NULL,
    `discountType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `discountValue` DOUBLE NOT NULL,
    `maxDiscount` DOUBLE NULL,
    `note` VARCHAR(191) NULL,
    `isUsed` BOOLEAN NOT NULL DEFAULT false,
    `usedAt` DATETIME(3) NULL,
    `monthYear` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrainerDiscountCode_code_idx`(`code` ASC),
    UNIQUE INDEX `TrainerDiscountCode_code_key`(`code` ASC),
    INDEX `TrainerDiscountCode_targetUserId_fkey`(`targetUserId` ASC),
    INDEX `TrainerDiscountCode_trainerId_monthYear_idx`(`trainerId` ASC, `monthYear` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainerReferralLink` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TrainerReferralLink_token_key`(`token` ASC),
    INDEX `TrainerReferralLink_userId_idx`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `emailVerified` DATETIME(3) NULL,
    `phone` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'member',
    `avatar` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `adminAccess` BOOLEAN NOT NULL DEFAULT false,
    `adminPermissions` LONGTEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `jobTitle` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `birthDate` DATETIME(3) NULL,
    `gender` VARCHAR(191) NULL,
    `governorate` VARCHAR(191) NULL,
    `commissionRate` DOUBLE NOT NULL DEFAULT 0,
    `commissionType` VARCHAR(191) NOT NULL DEFAULT 'percentage',
    `discountType` VARCHAR(191) NOT NULL DEFAULT 'fixed',
    `discountValue` DOUBLE NOT NULL DEFAULT 0,
    `maxDiscount` DOUBLE NULL,
    `pendingPartnerRef` VARCHAR(191) NULL,
    `pendingAgentRef` VARCHAR(191) NULL,
    `pendingStaffRef` VARCHAR(191) NULL,
    `pendingApproval` BOOLEAN NOT NULL DEFAULT false,
    `pendingTrainerRef` VARCHAR(191) NULL,
    `pendingNutritionRef` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserMembership` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `membershipId` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `offerId` VARCHAR(191) NULL,
    `offerTitle` VARCHAR(191) NULL,
    `paymentAmount` DOUBLE NOT NULL DEFAULT 0,
    `paymentMethod` VARCHAR(191) NULL,
    `productRewardsUsed` LONGTEXT NULL,
    `totalSessions` INTEGER NULL,
    `affiliateLinkId` VARCHAR(191) NULL,
    `partnerCodeId` VARCHAR(191) NULL,
    `partnerId` VARCHAR(191) NULL,
    `salesAgentUserId` VARCHAR(191) NULL,
    `salesCodeType` VARCHAR(191) NULL,
    `salesAgentId` VARCHAR(191) NULL,
    `staffReferralLinkId` VARCHAR(191) NULL,
    `trainerReferralLinkId` VARCHAR(191) NULL,
    `nutritionReferralLinkId` VARCHAR(191) NULL,

    INDEX `UserMembership_affiliateLinkId_fkey`(`affiliateLinkId` ASC),
    INDEX `UserMembership_membershipId_fkey`(`membershipId` ASC),
    INDEX `UserMembership_nutritionReferralLinkId_fkey`(`nutritionReferralLinkId` ASC),
    INDEX `UserMembership_offerId_fkey`(`offerId` ASC),
    INDEX `UserMembership_partnerCodeId_fkey`(`partnerCodeId` ASC),
    INDEX `UserMembership_partnerId_idx`(`partnerId` ASC),
    INDEX `UserMembership_salesAgentId_idx`(`salesAgentId` ASC),
    INDEX `UserMembership_salesAgentUserId_idx`(`salesAgentUserId` ASC),
    INDEX `UserMembership_staffReferralLinkId_fkey`(`staffReferralLinkId` ASC),
    INDEX `UserMembership_trainerReferralLinkId_fkey`(`trainerReferralLinkId` ASC),
    INDEX `UserMembership_userId_fkey`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_identifier_token_key`(`identifier` ASC, `token` ASC),
    UNIQUE INDEX `VerificationToken_token_key`(`token` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wallet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `balance` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `Wallet_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `walletId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WalletTransaction_walletId_fkey`(`walletId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentCommission` ADD CONSTRAINT `AgentCommission_agentUserId_fkey` FOREIGN KEY (`agentUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentCommission` ADD CONSTRAINT `AgentCommission_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceCheckIn` ADD CONSTRAINT `AttendanceCheckIn_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceCheckIn` ADD CONSTRAINT `AttendanceCheckIn_passId_fkey` FOREIGN KEY (`passId`) REFERENCES `AttendancePass`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceCheckIn` ADD CONSTRAINT `AttendanceCheckIn_privateSessionApplicationId_fkey` FOREIGN KEY (`privateSessionApplicationId`) REFERENCES `PrivateSessionApplication`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceCheckIn` ADD CONSTRAINT `AttendanceCheckIn_scannedByUserId_fkey` FOREIGN KEY (`scannedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceCheckIn` ADD CONSTRAINT `AttendanceCheckIn_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceCheckIn` ADD CONSTRAINT `AttendanceCheckIn_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendancePass` ADD CONSTRAINT `AttendancePass_privateSessionApplicationId_fkey` FOREIGN KEY (`privateSessionApplicationId`) REFERENCES `PrivateSessionApplication`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendancePass` ADD CONSTRAINT `AttendancePass_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendancePass` ADD CONSTRAINT `AttendancePass_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `Schedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ChatSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatSession` ADD CONSTRAINT `ChatSession_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatSession` ADD CONSTRAINT `ChatSession_recommendedMembershipId_fkey` FOREIGN KEY (`recommendedMembershipId`) REFERENCES `Membership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `Trainer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClubGoal` ADD CONSTRAINT `ClubGoal_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ClubGoal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachCheckIn` ADD CONSTRAINT `CoachCheckIn_coachProfileId_fkey` FOREIGN KEY (`coachProfileId`) REFERENCES `CoachProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachProfile` ADD CONSTRAINT `CoachProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractsManager` ADD CONSTRAINT `ContractsManager_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryZone` ADD CONSTRAINT `DeliveryZone_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `DeliveryCompany`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscountCodeUsage` ADD CONSTRAINT `DiscountCodeUsage_discountCodeId_fkey` FOREIGN KEY (`discountCodeId`) REFERENCES `DiscountCode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoalClassRule` ADD CONSTRAINT `GoalClassRule_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `ClubGoal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthQuestionRestriction` ADD CONSTRAINT `HealthQuestionRestriction_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `HealthQuestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthResponse` ADD CONSTRAINT `HealthResponse_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `HealthQuestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthResponse` ADD CONSTRAINT `HealthResponse_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_performedByUserId_fkey` FOREIGN KEY (`performedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReceipt` ADD CONSTRAINT `InventoryReceipt_performedByUserId_fkey` FOREIGN KEY (`performedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReceipt` ADD CONSTRAINT `InventoryReceipt_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReceiptItem` ADD CONSTRAINT `InventoryReceiptItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReceiptItem` ADD CONSTRAINT `InventoryReceiptItem_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `InventoryReceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReceiptItem` ADD CONSTRAINT `InventoryReceiptItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManagerCommission` ADD CONSTRAINT `ManagerCommission_agentCommissionId_fkey` FOREIGN KEY (`agentCommissionId`) REFERENCES `SalesAgentCommission`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManagerCommission` ADD CONSTRAINT `ManagerCommission_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `ContractsManager`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManagerPartnerCommission` ADD CONSTRAINT `ManagerPartnerCommission_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `ContractsManager`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManagerPartnerCommission` ADD CONSTRAINT `ManagerPartnerCommission_partnerCommissionId_fkey` FOREIGN KEY (`partnerCommissionId`) REFERENCES `PartnerCommission`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipGoal` ADD CONSTRAINT `MembershipGoal_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `ClubGoal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipGoal` ADD CONSTRAINT `MembershipGoal_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `Membership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NutritionCommission` ADD CONSTRAINT `NutritionCommission_nutritionReferralLinkId_fkey` FOREIGN KEY (`nutritionReferralLinkId`) REFERENCES `NutritionReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NutritionCommission` ADD CONSTRAINT `NutritionCommission_nutritionistUserId_fkey` FOREIGN KEY (`nutritionistUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NutritionCommission` ADD CONSTRAINT `NutritionCommission_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NutritionReferralLink` ADD CONSTRAINT `NutritionReferralLink_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NutritionSession` ADD CONSTRAINT `NutritionSession_nutritionistId_fkey` FOREIGN KEY (`nutritionistId`) REFERENCES `NutritionistProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NutritionSession` ADD CONSTRAINT `NutritionSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NutritionistProfile` ADD CONSTRAINT `NutritionistProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Offer` ADD CONSTRAINT `Offer_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `Membership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_deliveryCompanyId_fkey` FOREIGN KEY (`deliveryCompanyId`) REFERENCES `DeliveryCompany`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_deliveryOptionId_fkey` FOREIGN KEY (`deliveryOptionId`) REFERENCES `DeliveryOption`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_performedByUserId_fkey` FOREIGN KEY (`performedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Partner` ADD CONSTRAINT `Partner_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `ContractsManager`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Partner` ADD CONSTRAINT `Partner_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerAffiliateLink` ADD CONSTRAINT `PartnerAffiliateLink_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerCode` ADD CONSTRAINT `PartnerCode_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerCommission` ADD CONSTRAINT `PartnerCommission_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerCommission` ADD CONSTRAINT `PartnerCommission_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerWithdrawalRequest` ADD CONSTRAINT `PartnerWithdrawalRequest_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrivateSessionApplication` ADD CONSTRAINT `PrivateSessionApplication_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `Trainer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrivateSessionApplication` ADD CONSTRAINT `PrivateSessionApplication_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductReview` ADD CONSTRAINT `ProductReview_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductReview` ADD CONSTRAINT `ProductReview_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushCampaign` ADD CONSTRAINT `PushCampaign_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Referral` ADD CONSTRAINT `Referral_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralUsage` ADD CONSTRAINT `ReferralUsage_referralId_fkey` FOREIGN KEY (`referralId`) REFERENCES `Referral`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardHistory` ADD CONSTRAINT `RewardHistory_rewardId_fkey` FOREIGN KEY (`rewardId`) REFERENCES `RewardPoints`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardPoints` ADD CONSTRAINT `RewardPoints_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesAgent` ADD CONSTRAINT `SalesAgent_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `ContractsManager`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesAgent` ADD CONSTRAINT `SalesAgent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesAgentCommission` ADD CONSTRAINT `SalesAgentCommission_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `SalesAgent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesAgentCommission` ADD CONSTRAINT `SalesAgentCommission_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesAgentReferral` ADD CONSTRAINT `SalesAgentReferral_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `SalesAgent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesAgentReferral` ADD CONSTRAINT `SalesAgentReferral_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Schedule` ADD CONSTRAINT `Schedule_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCommission` ADD CONSTRAINT `StaffCommission_staffReferralLinkId_fkey` FOREIGN KEY (`staffReferralLinkId`) REFERENCES `StaffReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCommission` ADD CONSTRAINT `StaffCommission_staffUserId_fkey` FOREIGN KEY (`staffUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCommission` ADD CONSTRAINT `StaffCommission_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDiscountCode` ADD CONSTRAINT `StaffDiscountCode_staffUserId_fkey` FOREIGN KEY (`staffUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDiscountCode` ADD CONSTRAINT `StaffDiscountCode_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffReferralLink` ADD CONSTRAINT `StaffReferralLink_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreFreeGiftsSession` ADD CONSTRAINT `StoreFreeGiftsSession_storeOrderId_fkey` FOREIGN KEY (`storeOrderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreFreeGiftsSession` ADD CONSTRAINT `StoreFreeGiftsSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreGiftCampaignClaim` ADD CONSTRAINT `StoreGiftCampaignClaim_storeOrderId_fkey` FOREIGN KEY (`storeOrderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreGiftCampaignClaim` ADD CONSTRAINT `StoreGiftCampaignClaim_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportPresence` ADD CONSTRAINT `SupportPresence_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Testimonial` ADD CONSTRAINT `Testimonial_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trainer` ADD CONSTRAINT `Trainer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerAttendanceLog` ADD CONSTRAINT `TrainerAttendanceLog_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerAttendanceLog` ADD CONSTRAINT `TrainerAttendanceLog_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `Trainer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerCommission` ADD CONSTRAINT `TrainerCommission_trainerReferralLinkId_fkey` FOREIGN KEY (`trainerReferralLinkId`) REFERENCES `TrainerReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerCommission` ADD CONSTRAINT `TrainerCommission_trainerUserId_fkey` FOREIGN KEY (`trainerUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerCommission` ADD CONSTRAINT `TrainerCommission_userMembershipId_fkey` FOREIGN KEY (`userMembershipId`) REFERENCES `UserMembership`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerDiscountCode` ADD CONSTRAINT `TrainerDiscountCode_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerDiscountCode` ADD CONSTRAINT `TrainerDiscountCode_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `Trainer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainerReferralLink` ADD CONSTRAINT `TrainerReferralLink_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_affiliateLinkId_fkey` FOREIGN KEY (`affiliateLinkId`) REFERENCES `PartnerAffiliateLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_nutritionReferralLinkId_fkey` FOREIGN KEY (`nutritionReferralLinkId`) REFERENCES `NutritionReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_partnerCodeId_fkey` FOREIGN KEY (`partnerCodeId`) REFERENCES `PartnerCode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_salesAgentId_fkey` FOREIGN KEY (`salesAgentId`) REFERENCES `SalesAgent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_salesAgentUserId_fkey` FOREIGN KEY (`salesAgentUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_staffReferralLinkId_fkey` FOREIGN KEY (`staffReferralLinkId`) REFERENCES `StaffReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_trainerReferralLinkId_fkey` FOREIGN KEY (`trainerReferralLinkId`) REFERENCES `TrainerReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wallet` ADD CONSTRAINT `Wallet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
