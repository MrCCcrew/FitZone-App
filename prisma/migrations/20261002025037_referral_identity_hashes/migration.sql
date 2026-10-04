-- AlterTable
ALTER TABLE `User`
  ADD COLUMN `referralDeviceHash` VARCHAR(43) NULL,
  ADD COLUMN `referralIpHash` VARCHAR(43) NULL,
  ADD COLUMN `referralUserAgentHash` VARCHAR(43) NULL;
