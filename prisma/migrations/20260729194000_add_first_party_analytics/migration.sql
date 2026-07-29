CREATE TABLE `AnalyticsVisitor` (
  `id` VARCHAR(191) NOT NULL,
  `anonymousId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `countryCode` VARCHAR(191) NULL, `countryName` VARCHAR(191) NULL, `region` VARCHAR(191) NULL, `city` VARCHAR(191) NULL,
  `deviceType` VARCHAR(191) NULL, `browser` VARCHAR(191) NULL, `operatingSystem` VARCHAR(191) NULL,
  `isBot` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AnalyticsVisitor_anonymousId_key`(`anonymousId`),
  INDEX `AnalyticsVisitor_firstSeenAt_idx`(`firstSeenAt`), INDEX `AnalyticsVisitor_lastSeenAt_idx`(`lastSeenAt`),
  INDEX `AnalyticsVisitor_userId_idx`(`userId`), INDEX `AnalyticsVisitor_countryCode_idx`(`countryCode`),
  PRIMARY KEY (`id`), CONSTRAINT `AnalyticsVisitor_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `AnalyticsSession` (
  `id` VARCHAR(191) NOT NULL, `visitorId` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `endedAt` DATETIME(3) NULL,
  `durationSeconds` INTEGER NOT NULL DEFAULT 0, `landingPage` VARCHAR(191) NULL, `exitPage` VARCHAR(191) NULL, `referrer` VARCHAR(191) NULL,
  `utmSource` VARCHAR(191) NULL, `utmMedium` VARCHAR(191) NULL, `utmCampaign` VARCHAR(191) NULL, `deviceType` VARCHAR(191) NULL,
  `countryCode` VARCHAR(191) NULL, `city` VARCHAR(191) NULL, `pageViewCount` INTEGER NOT NULL DEFAULT 0, `isBounce` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AnalyticsSession_visitorId_idx`(`visitorId`), INDEX `AnalyticsSession_userId_idx`(`userId`), INDEX `AnalyticsSession_startedAt_idx`(`startedAt`), INDEX `AnalyticsSession_countryCode_idx`(`countryCode`),
  PRIMARY KEY (`id`), CONSTRAINT `AnalyticsSession_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `AnalyticsVisitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AnalyticsSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `AnalyticsPageView` (
  `id` VARCHAR(191) NOT NULL, `sessionId` VARCHAR(191) NOT NULL, `visitorId` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NULL,
  `path` VARCHAR(191) NOT NULL, `pageTitle` VARCHAR(191) NULL, `enteredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `exitedAt` DATETIME(3) NULL,
  `durationSeconds` INTEGER NOT NULL DEFAULT 0, `referrerPath` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AnalyticsPageView_sessionId_idx`(`sessionId`), INDEX `AnalyticsPageView_visitorId_idx`(`visitorId`), INDEX `AnalyticsPageView_userId_idx`(`userId`), INDEX `AnalyticsPageView_path_idx`(`path`), INDEX `AnalyticsPageView_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`), CONSTRAINT `AnalyticsPageView_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AnalyticsSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AnalyticsPageView_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `AnalyticsVisitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AnalyticsPageView_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `AnalyticsEvent` (
  `id` VARCHAR(191) NOT NULL, `sessionId` VARCHAR(191) NOT NULL, `visitorId` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NULL,
  `eventName` VARCHAR(191) NOT NULL, `eventCategory` VARCHAR(191) NOT NULL, `pagePath` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NULL, `entityId` VARCHAR(191) NULL, `entityName` VARCHAR(191) NULL, `metadata` JSON NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AnalyticsEvent_sessionId_idx`(`sessionId`), INDEX `AnalyticsEvent_visitorId_idx`(`visitorId`), INDEX `AnalyticsEvent_userId_idx`(`userId`), INDEX `AnalyticsEvent_eventName_idx`(`eventName`), INDEX `AnalyticsEvent_eventCategory_idx`(`eventCategory`), INDEX `AnalyticsEvent_pagePath_idx`(`pagePath`), INDEX `AnalyticsEvent_entityType_entityId_idx`(`entityType`, `entityId`), INDEX `AnalyticsEvent_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`), CONSTRAINT `AnalyticsEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AnalyticsSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AnalyticsEvent_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `AnalyticsVisitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AnalyticsEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);
