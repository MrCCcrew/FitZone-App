ALTER TABLE `WalletTransaction` ADD INDEX `idx_wallet_tx_audit_v1` (`walletId`, `type`, `source`, `createdAt`), ALGORITHM=INPLACE, LOCK=NONE;
