import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("WalletTransaction source taxonomy contract", () => {
  it("keeps the legacy schema fallback for historical rows", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toMatch(
      /model\s+WalletTransaction[\s\S]*?\bsource\s+String\s+@default\("legacy"\)/,
    );
  });

  it("tags admin balance operations as admin_adjustment", () => {
    const source = read("src/app/api/admin/balance/route.ts");

    expect(source).toMatch(
      /walletTransaction\.create\([\s\S]*?amount:\s*Number\(amount\),[\s\S]*?type:\s*type\s*===\s*"topup"\s*\?\s*"credit"\s*:\s*"debit",\s*source:\s*"admin_adjustment",/,
    );
  });

  it("tags admin customer balance edits as admin_adjustment", () => {
    const source = read("src/app/api/admin/customers/route.ts");

    expect(source).toMatch(
      /walletTransaction\.create\([\s\S]*?amount:\s*Math\.abs\(delta\),[\s\S]*?type:\s*delta\s*>\s*0\s*\?\s*"credit"\s*:\s*"debit",\s*source:\s*"admin_adjustment",/,
    );
  });

  it("tags nutrition wallet refunds as payment_restore", () => {
    const source = read(
      "src/app/api/admin/nutrition/reschedule/route.ts",
    );

    expect(source).toMatch(
      /walletTransaction\.create\([\s\S]*?amount:\s*request\.refundAmount\s*\?\?\s*request\.session\.price,[\s\S]*?type:\s*"refund",\s*source:\s*"payment_restore",/,
    );
  });

  it("tags immediate membership wallet bonus as membership_bonus", () => {
    const source = read("src/app/api/subscribe/route.ts");

    expect(source).toMatch(
      /walletBonusTransaction\s*=\s*await\s+tx\.walletTransaction\.create\([\s\S]*?amount:\s*walletBonus,\s*type:\s*"credit",\s*source:\s*"membership_bonus",/,
    );
  });

  it("tags free gift wallet rewards as free_gift_game", () => {
    const source = read("src/lib/free-gift-reward-service.ts");

    expect(source).toMatch(
      /walletTransaction\s*=\s*await\s+tx\.walletTransaction\.create\([\s\S]*?amount:\s*rewardValue,[\s\S]*?type:\s*"credit",[\s\S]*?source:\s*"free_gift_game",/,
    );
  });

  it("tags store gift wallet rewards as store_gift", () => {
    const source = read("src/lib/store-gift-reward-service.ts");

    expect(source).toMatch(
      /walletTransaction\s*=\s*await\s+tx\.walletTransaction\.create\([\s\S]*?amount:\s*rewardValue,[\s\S]*?type:\s*"credit",[\s\S]*?source:\s*"store_gift",/,
    );
  });

  it("tags reconciled membership wallet bonus as membership_bonus", () => {
    const source = read(
      "src/lib/payments/reconciliation-helper.ts",
    );

    expect(source).toMatch(
      /walletTransaction\s*=\s*await\s+tx\.walletTransaction\.create\([\s\S]*?amount:\s*walletBonus,\s*type:\s*"credit",\s*source:\s*"membership_bonus",/,
    );
  });

  it("tags legacy unsplit payment restorations as payment_restore", () => {
    const source = read("src/lib/payments/service.ts");

    expect(source).toMatch(
      /amount:\s*walletAmount,\s*type:\s*"credit",\s*source:\s*"payment_restore",\s*description:\s*`استرجاع رصيد محفظة لعملية غير مكتملة/,
    );

    expect(source).toMatch(
      /amount:\s*adjustments\.walletAmount,\s*type:\s*"credit",\s*source:\s*"payment_restore",\s*description:\s*`استرجاع رصيد محفظة للمعاملة/,
    );
  });
  it("tags paid wallet topup principal as topup", () => {
    const source = read("src/lib/payments/service.ts");

    expect(source).toMatch(
      /walletTransaction\.create\([\s\S]*?amount:\s*payment\.amount,\s*type:\s*"credit",\s*source:\s*"topup",/,
    );
  });

  it("tags wallet topup promotional bonus as topup_bonus", () => {
    const source = read("src/lib/payments/service.ts");

    expect(source).toMatch(
      /bonusTransaction\s*=\s*await\s+tx\.walletTransaction\.create\([\s\S]*?amount:\s*bonusAmount,\s*type:\s*"credit",\s*source:\s*"topup_bonus",/,
    );
  });
});
