-- Safe additive opt-in: existing offers and any unmigrated business choice
-- retain the membership's current price, without a second discount.
ALTER TABLE `Offer`
  ADD COLUMN `offerBoxApplyDiscount` BOOLEAN NOT NULL DEFAULT false;
