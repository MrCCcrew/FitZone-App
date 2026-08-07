-- Phase 2C: Add Reserved Stock for Inventory Reservation Model
-- This field tracks pending order reservations that haven't been converted to sales yet
-- Invariant: 0 <= reservedStock <= stock
-- Available stock = stock - reservedStock

ALTER TABLE `Product` ADD COLUMN `reservedStock` INTEGER NOT NULL DEFAULT 0;
