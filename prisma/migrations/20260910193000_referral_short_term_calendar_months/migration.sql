-- Short-Term referral maximum is expressed in calendar months,
-- not as a fixed number of days.
--
-- No ReferralCommissionPolicy business rows existed before this
-- contract change. No business-data backfill is performed.

ALTER TABLE `ReferralCommissionPolicy`
  CHANGE COLUMN `shortTermMaxGapDays`
                `shortTermMaxMonths`
                INTEGER NOT NULL;
