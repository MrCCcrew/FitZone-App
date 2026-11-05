-- Additive migration only: existing knowledge records remain published, active and paraphrasable.
ALTER TABLE `ChatKnowledgeEntry`
  ADD COLUMN `isMandatory` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `allowParaphrasing` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `validFrom` DATETIME(3) NULL,
  ADD COLUMN `validUntil` DATETIME(3) NULL,
  ADD COLUMN `lastReviewedAt` DATETIME(3) NULL,
  ADD COLUMN `sourceType` VARCHAR(191) NOT NULL DEFAULT 'admin',
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'published';

ALTER TABLE `CoachEventLog`
  ADD COLUMN `sourceType` VARCHAR(191) NULL,
  ADD COLUMN `toolNames` TEXT NULL,
  ADD COLUMN `durationMs` INTEGER NULL,
  ADD COLUMN `fallbackUsed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `errorCode` VARCHAR(191) NULL;
