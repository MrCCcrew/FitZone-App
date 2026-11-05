ALTER TABLE `AnalyticsEvent`
  MODIFY `sessionId` VARCHAR(191) NULL,
  MODIFY `visitorId` VARCHAR(191) NULL,
  ADD COLUMN `paymentTransactionId` VARCHAR(191) NULL;

CREATE INDEX `AnalyticsEvent_paymentTransactionId_idx` ON `AnalyticsEvent`(`paymentTransactionId`);
CREATE UNIQUE INDEX `AnalyticsEvent_paymentTransactionId_eventName_key` ON `AnalyticsEvent`(`paymentTransactionId`, `eventName`);
ALTER TABLE `AnalyticsEvent`
  ADD CONSTRAINT `AnalyticsEvent_paymentTransactionId_fkey`
  FOREIGN KEY (`paymentTransactionId`) REFERENCES `PaymentTransaction`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
