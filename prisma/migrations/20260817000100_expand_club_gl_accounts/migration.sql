INSERT INTO `GLAccount` (`id`, `code`, `name`, `type`, `isActive`, `createdAt`, `updatedAt`)
SELECT CONCAT('gl_', UUID()), '2020', 'Wallet Liability', 'liability', 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM `GLAccount` WHERE `code` = '2020'
);

INSERT INTO `GLAccount` (`id`, `code`, `name`, `type`, `isActive`, `createdAt`, `updatedAt`)
SELECT CONCAT('gl_', UUID()), '2030', 'Reward Points Liability', 'liability', 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM `GLAccount` WHERE `code` = '2030'
);

INSERT INTO `GLAccount` (`id`, `code`, `name`, `type`, `isActive`, `createdAt`, `updatedAt`)
SELECT CONCAT('gl_', UUID()), '4020', 'Subscription Revenue', 'revenue', 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM `GLAccount` WHERE `code` = '4020'
);

INSERT INTO `GLAccount` (`id`, `code`, `name`, `type`, `isActive`, `createdAt`, `updatedAt`)
SELECT CONCAT('gl_', UUID()), '5020', 'Rewards & Promotion Expense', 'expense', 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM `GLAccount` WHERE `code` = '5020'
);
