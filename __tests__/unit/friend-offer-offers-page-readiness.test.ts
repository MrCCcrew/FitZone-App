import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/app/FitzoneApp.tsx"),
  "utf8",
);

describe("Friends Offer main page readiness", () => {
  it("checks readiness before payment request", () => {
    const start = source.indexOf(
      "const startFriendCheckout",
    );

    const guard = source.indexOf(
      'friendGroup.status !== "ready"',
      start,
    );

    const paymentRequest = source.indexOf(
      'fetch("/api/friend-offers/checkout"',
      start,
    );

    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(start);
    expect(paymentRequest).toBeGreaterThan(guard);
  });

  it("disables payment for an incomplete group", () => {
    expect(source).toContain(
      "friendGroup.remainingPlaces > 0 ||",
    );

    expect(source).toContain(
      "كمّلي عدد الصديقات أولًا",
    );

    expect(source).toContain(
      "المجموعة غير جاهزة للدفع",
    );
  });

  it("shows the missing friend count", () => {
    expect(source).toContain(
      "المجموعة ناقصها صديقة واحدة",
    );

    expect(source).toContain(
      "المجموعة ناقصها صديقتين",
    );
  });

  it("does not advertise payment before matching", () => {
    expect(source).not.toContain(
      "يمكنك دفع حصتك، ولن يتفعّل الاشتراك",
    );

    expect(source).toContain(
      "انتظري اكتمال عدد الصديقات قبل الدفع",
    );
  });

  it("preserves paid confirmation and joining", () => {
    expect(source).toContain(
      "تم دفع حصتك — في انتظار اكتمال المجموعة",
    );

    expect(source).toContain(
      "friendInviteUrl(friendGroup.token)",
    );

    expect(source).toContain(
      'action: "join"',
    );
  });
});
