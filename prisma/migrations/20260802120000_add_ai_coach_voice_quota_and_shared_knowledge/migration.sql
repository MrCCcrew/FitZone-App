-- Additive only.  Do not execute automatically in production.
-- Existing ChatKnowledgeEntry rows remain unapproved and unclassified, so they
-- cannot enter the new shared cache until an administrator reviews them.

ALTER TABLE `ChatSession`
  ADD COLUMN `userId` VARCHAR(191) NULL;

ALTER TABLE `ChatKnowledgeEntry`
  ADD COLUMN `canonicalQuestion` TEXT NULL,
  ADD COLUMN `language` VARCHAR(12) NOT NULL DEFAULT 'ar',
  ADD COLUMN `privacyClass` ENUM('STATIC', 'DYNAMIC', 'PERSONAL') NULL,
  ADD COLUMN `answerSource` ENUM('ADMIN', 'TOOL_TEMPLATE', 'OPENAI_SUGGESTION') NULL,
  ADD COLUMN `sourceReference` VARCHAR(500) NULL,
  ADD COLUMN `sourceVersion` VARCHAR(191) NULL,
  ADD COLUMN `confidence` DOUBLE NULL,
  ADD COLUMN `approved` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `expiresAt` DATETIME(3) NULL,
  ADD COLUMN `lastUsedAt` DATETIME(3) NULL,
  ADD COLUMN `usageCount` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `ChatKnowledgeAlias` (
  `id` VARCHAR(191) NOT NULL,
  `knowledgeEntryId` VARCHAR(191) NOT NULL,
  `normalizedQuestion` VARCHAR(500) NOT NULL,
  `normalizedQuestionHash` CHAR(64) NOT NULL,
  `language` VARCHAR(12) NOT NULL DEFAULT 'ar',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ChatKnowledgeAlias_normalizedQuestionHash_language_key` (`normalizedQuestionHash`, `language`),
  INDEX `ChatKnowledgeAlias_knowledgeEntryId_idx` (`knowledgeEntryId`),
  INDEX `ChatKnowledgeAlias_normalizedQuestionHash_language_idx` (`normalizedQuestionHash`, `language`),
  CONSTRAINT `ChatKnowledgeAlias_knowledgeEntryId_fkey` FOREIGN KEY (`knowledgeEntryId`) REFERENCES `ChatKnowledgeEntry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CoachKnowledgeSourceVersion` (
  `id` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(191) NOT NULL,
  `sourceReference` VARCHAR(500) NOT NULL,
  `sourceVersion` VARCHAR(191) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CoachKnowledgeSourceVersion_sourceType_sourceReference_key` (`sourceType`, `sourceReference`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VoiceMonthlyQuota` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `periodKey` CHAR(7) NOT NULL,
  `entitlementSeconds` INTEGER NOT NULL,
  `usedSeconds` INTEGER NOT NULL DEFAULT 0,
  `reservedSeconds` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `VoiceMonthlyQuota_userId_periodKey_key` (`userId`, `periodKey`),
  INDEX `VoiceMonthlyQuota_periodKey_updatedAt_idx` (`periodKey`, `updatedAt`),
  CONSTRAINT `VoiceMonthlyQuota_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VoiceRealtimeSession` (
  `id` VARCHAR(191) NOT NULL,
  `voiceSessionId` CHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `chatSessionId` VARCHAR(191) NULL,
  `quotaId` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `connectedAt` DATETIME(3) NULL,
  `lastHeartbeatAt` DATETIME(3) NULL,
  `lastActivityAt` DATETIME(3) NULL,
  `billingCursorAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `finalizedAt` DATETIME(3) NULL,
  `billableSeconds` INTEGER NOT NULL DEFAULT 0,
  `reservedSeconds` INTEGER NOT NULL,
  `status` ENUM('active', 'finalized') NOT NULL DEFAULT 'active',
  `terminationReason` ENUM('user_ended', 'quota_exhausted', 'max_duration', 'expired', 'heartbeat_timeout', 'connection_failed', 'cleanup', 'authorization_failed') NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `VoiceRealtimeSession_voiceSessionId_key` (`voiceSessionId`),
  INDEX `VoiceRealtimeSession_userId_status_idx` (`userId`, `status`),
  INDEX `VoiceRealtimeSession_status_expiresAt_idx` (`status`, `expiresAt`),
  INDEX `VoiceRealtimeSession_status_lastHeartbeatAt_idx` (`status`, `lastHeartbeatAt`),
  INDEX `VoiceRealtimeSession_quotaId_status_idx` (`quotaId`, `status`),
  INDEX `VoiceRealtimeSession_chatSessionId_status_idx` (`chatSessionId`, `status`),
  CONSTRAINT `VoiceRealtimeSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `VoiceRealtimeSession_chatSessionId_fkey` FOREIGN KEY (`chatSessionId`) REFERENCES `ChatSession` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `VoiceRealtimeSession_quotaId_fkey` FOREIGN KEY (`quotaId`) REFERENCES `VoiceMonthlyQuota` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ChatSession_userId_createdAt_idx` ON `ChatSession` (`userId`, `createdAt`);
CREATE INDEX `ChatKnowledgeEntry_approved_privacyClass_language_expiresAt_idx` ON `ChatKnowledgeEntry` (`approved`, `privacyClass`, `language`, `expiresAt`);
ALTER TABLE `ChatSession` ADD CONSTRAINT `ChatSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
