import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  const file = path.join(
    process.cwd(),
    relativePath,
  );

  if (!fs.existsSync(file)) {
    return "";
  }

  return fs.readFileSync(
    file,
    "utf8",
  );
}

describe("referral credit source-aware wiring contract", () => {
  it("adds an explicit referral balance bucket to the wallet schema", () => {
    const schema = read(
      "prisma/schema.prisma",
    );

    expect(schema).toContain(
      "referralBalance",
    );
  });

  it("records an explicit wallet transaction source instead of relying on Arabic description text", () => {
    const schema = read(
      "prisma/schema.prisma",
    );

    expect(schema).toContain(
      "source",
    );
  });

  it("enforces source-aware wallet allocation in subscription checkout", () => {
    const source = read(
      "src/app/api/subscribe/route.ts",
    );

    expect(source).toContain(
      "allocateWalletDeductionBySource",
    );

    expect(source).toContain(
      "referralBalance",
    );
  });

  it("enforces source-aware wallet allocation in the main store order route", () => {
    const source = read(
      "src/app/api/orders/route.ts",
    );

    expect(source).toContain(
      "allocateWalletDeductionBySource",
    );

    expect(source).toContain(
      "referralBalance",
    );
  });

  it("enforces source-aware wallet allocation in the legacy/order-intent store path too", () => {
    const source = read(
      "src/app/api/payments/order-intent/route.ts",
    );

    expect(source).toContain(
      "allocateWalletDeductionBySource",
    );

    expect(source).toContain(
      "referralBalance",
    );
  });

  it("store purchases no longer unlock a member referral reward", () => {
    const source = read(
      "src/app/api/orders/route.ts",
    );

    expect(source).not.toContain(
      "unlockPendingReferralReward",
    );
  });

  it("new email registrations do not grant immediately-convertible referral signup points", () => {
    const source = read(
      "src/app/api/auth/register/route.ts",
    );

    expect(source).not.toContain(
      '"referral_signup"',
    );
  });

  it("email registration applies the referral anti-abuse gate", () => {
    const source = read(
      "src/app/api/auth/register/route.ts",
    );

    expect(source).toContain(
      "evaluateReferralAntiAbuse",
    );
  });

  it("OAuth registration applies the same referral anti-abuse gate", () => {
    const source = read(
      "src/app/api/auth/oauth/consent/route.ts",
    );

    expect(source).toContain(
      "evaluateReferralAntiAbuse",
    );
  });

  it("registration verifies a Turnstile challenge server-side", () => {
    const source = read(
      "src/app/api/auth/register/route.ts",
    );

    expect(source).toContain(
      "verifyTurnstileToken",
    );
  });

  it("checkout options expose source-aware balances and the referral allowance", () => {
    const source = read(
      "src/app/api/me/checkout-options/route.ts",
    );

    for (const field of [
      "referralBalance",
      "generalBalance",
      "maxUsableReferral",
    ]) {
      expect(source).toContain(field);
    }
  });

  it("payment restoration preserves the referral/general split instead of restoring an anonymous wallet amount", () => {
    const paymentService = read(
      "src/lib/payments/service.ts",
    );

    expect(paymentService).toContain(
      "referralWalletAmount",
    );

    expect(paymentService).toContain(
      "generalWalletAmount",
    );
  });

  it("Paymob payment metadata persists the source split needed for safe restoration", () => {
    const subscribe = read(
      "src/app/api/subscribe/route.ts",
    );

    const orders = read(
      "src/app/api/orders/route.ts",
    );

    for (const source of [
      subscribe,
      orders,
    ]) {
      expect(source).toContain(
        "referralWalletAmount",
      );

      expect(source).toContain(
        "generalWalletAmount",
      );
    }
  });

  it("historical/new referral-derived points cannot be converted into unrestricted wallet credit", () => {
    const source = read(
      "src/app/api/me/convert-points/route.ts",
    );

    expect(source).toContain(
      "referral_signup",
    );

    expect(source).toContain(
      "convertiblePoints",
    );
  });

  it("customer terms disclose the referral threshold, cap, subscription-only rule, and store restriction", () => {
    const policyPage = read(
      "src/app/policy/page.tsx",
    );

    const pagesContent = read(
      "src/app/admin/sections/PagesContent.tsx",
    );

    const combined =
      `${policyPage}\n${pagesContent}`;

    expect(combined).toContain(
      "100",
    );

    expect(combined).toContain(
      "150",
    );

    expect(combined).toContain(
      "رصيد الإحالة",
    );

    expect(combined).toContain(
      "الاشتراكات",
    );

    expect(combined).toContain(
      "المتجر",
    );
  });
});