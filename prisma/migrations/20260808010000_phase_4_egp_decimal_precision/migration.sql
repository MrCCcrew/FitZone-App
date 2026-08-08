-- Phase 4: EGP Decimal Precision
-- Change JournalEntry debit/credit from DOUBLE to DECIMAL(18,2) for exact EGP (Egyptian Pound) precision
-- Currency: EGP (Egyptian Pound) with 2 decimal precision (piastres)
-- 1 EGP = 100 piastres

ALTER TABLE `JournalEntry`
    MODIFY `debit` DECIMAL(18,2) NOT NULL DEFAULT 0,
    MODIFY `credit` DECIMAL(18,2) NOT NULL DEFAULT 0;
