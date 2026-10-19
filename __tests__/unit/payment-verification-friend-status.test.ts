import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  getPaidPaymentMessage,
} from "@/lib/payment-verification-friend-status";

const base = {
  status: "paid",
  purpose: "membership",
  friendOfferStatus: null,
  membershipName: null,
} as const;

describe("Payment verification customer status parity", () => {
  it("does not claim group activation after paying only one share", () => {
    const message = getPaidPaymentMessage({
      ...base,
      friendOfferStatus: "waiting",
    });

    expect(message?.title).toContain("سداد حصتك");
    expect(message?.description).toContain("لم يتفعل");
    expect(message?.description).not.toContain("أصبح نشطًا");
  });

  it("reports completed friend group activation distinctly", () => {
    const message = getPaidPaymentMessage({
      ...base,
      friendOfferStatus: "completed",
    });

    expect(message?.title).toContain("تفعيل اشتراك");
  });

  it("does not confuse ordinary membership confirmation with friends", () => {
    const message = getPaidPaymentMessage({
      ...base,
      membershipName: "الباقة الشهرية",
    });

    expect(message?.title).toContain("الباقة الشهرية");
    expect(message?.title).not.toContain("الصحاب");
  });

  it("does not show a success message for pending or failed payments", () => {
    for (const status of ["pending", "failed", "expired", "cancelled"]) {
      expect(getPaidPaymentMessage({
        ...base,
        status,
        friendOfferStatus: "waiting",
      })).toBeNull();
    }
  });

  it("does not label ordinary payments as memberships", () => {
    const message = getPaidPaymentMessage({
      ...base,
      purpose: "order",
    });

    expect(message?.title).toBe("تم تأكيد الدفع بنجاح");
  });

  it("connects the verification page to the server friend status", () => {
    const source = readFileSync(
      "src/app/payment/verify/page.tsx",
      "utf8",
    );

    expect(source).toContain(
      "payload.friendOffer?.status",
    );
    expect(source).toContain(
      "getPaidPaymentMessage({",
    );
    expect(source).not.toContain(
      "اشتراكك أصبح نشطًا بعد تأكيد Paymob من السيرفر.",
    );
  });
});
