-- AddColumn: displayPriority to Product table
ALTER TABLE `Product` ADD COLUMN `displayPriority` INT NOT NULL DEFAULT 0;

-- CreateIndex: Index on displayPriority for faster sorting
CREATE INDEX `Product_displayPriority_idx` ON `Product`(`displayPriority`);
