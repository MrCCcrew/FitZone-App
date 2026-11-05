import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AdminWalletAdjustmentError,
  resolveAdminWalletAdjustment,
} from "@/lib/admin-wallet-adjustment";

describe(
  "admin wallet source-aware adjustment",
  () => {
    it(
      "treats admin credit as general balance and preserves referral balance",
      () => {
        const result =
          resolveAdminWalletAdjustment({
            balance: 120,
            referralBalance: 100,
            delta: 50,
          });

        expect(result).toEqual({
          nextBalance: 170,
          nextReferralBalance: 100,
          generalAdjustment: 50,
          referralAdjustment: 0,
        });
      },
    );

    it(
      "deducts general balance before referral balance",
      () => {
        const result =
          resolveAdminWalletAdjustment({
            balance: 120,
            referralBalance: 100,
            delta: -15,
          });

        expect(result).toEqual({
          nextBalance: 105,
          nextReferralBalance: 100,
          generalAdjustment: -15,
          referralAdjustment: 0,
        });
      },
    );

    it(
      "deducts referral balance only after general balance is exhausted",
      () => {
        const result =
          resolveAdminWalletAdjustment({
            balance: 120,
            referralBalance: 100,
            delta: -50,
          });

        expect(result).toEqual({
          nextBalance: 70,
          nextReferralBalance: 70,
          generalAdjustment: -20,
          referralAdjustment: -30,
        });

        expect(
          result.nextReferralBalance,
        ).toBeLessThanOrEqual(
          result.nextBalance,
        );
      },
    );

    it(
      "can deduct the entire wallet without leaving stale referral balance",
      () => {
        const result =
          resolveAdminWalletAdjustment({
            balance: 120,
            referralBalance: 100,
            delta: -120,
          });

        expect(result).toEqual({
          nextBalance: 0,
          nextReferralBalance: 0,
          generalAdjustment: -20,
          referralAdjustment: -100,
        });
      },
    );

    it(
      "rejects deductions larger than the total wallet balance",
      () => {
        expect(() =>
          resolveAdminWalletAdjustment({
            balance: 120,
            referralBalance: 100,
            delta: -121,
          }),
        ).toThrow(
          AdminWalletAdjustmentError,
        );
      },
    );

    it(
      "fails closed when existing source buckets are already inconsistent",
      () => {
        expect(() =>
          resolveAdminWalletAdjustment({
            balance: 70,
            referralBalance: 100,
            delta: 10,
          }),
        ).toThrow(
          AdminWalletAdjustmentError,
        );
      },
    );
  },
);
