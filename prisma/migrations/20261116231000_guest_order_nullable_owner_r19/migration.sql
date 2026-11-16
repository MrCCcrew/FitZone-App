-- AlterTable
ALTER TABLE `Order` MODIFY `userId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `PaymentTransaction` MODIFY `userId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `GuestCheckoutProof` ADD CONSTRAINT `GuestCheckoutProof_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
