-- DropForeignKey
ALTER TABLE `GoalClassRule` DROP FOREIGN KEY `GoalClassRule_classTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `HealthQuestionRestriction` DROP FOREIGN KEY `HealthQuestionRestriction_classTypeId_fkey`;

-- DropIndex
DROP INDEX `GoalClassRule_classTypeId_idx` ON `GoalClassRule`;

-- DropIndex
DROP INDEX `HealthQuestionRestriction_classTypeId_idx` ON `HealthQuestionRestriction`;

-- AlterTable
ALTER TABLE `GoalClassRule` DROP COLUMN `classTypeId`;

-- AlterTable
ALTER TABLE `HealthQuestionRestriction` DROP COLUMN `classTypeId`;
