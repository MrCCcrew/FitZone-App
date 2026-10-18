import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const account = readFileSync(
  resolve(process.cwd(), "src/app/account/AccountClient.tsx"),
  "utf8",
);

describe("Friend offer account invitation wiring", () => {
  it("uses the existing Offers invitation route", () => {
    expect(account).toContain(
      'url.searchParams.set("page", "offers")',
    );
    expect(account).toContain(
      'url.searchParams.set("friendOffer", friendOffer.group.token)',
    );
    expect(account).toContain(
      'encodeURIComponent(friendOffer.group.token)',
    );
  });

  it("blocks client payment while the group is incomplete", () => {
    expect(account).toContain(
      "friendOffer.group.remainingPlaces > 0 ||",
    );
    expect(account).toContain(
      'friendOffer.group.status !== "ready"',
    );
    expect(account).toContain(
      "كمّلي المجموعة أولًا",
    );
  });

  it("shows an invitation even when the current member already paid", () => {
    expect(account).toContain(
      "مجموعتك ناقصها صديقتين",
    );
    expect(account).toContain(
      "لن يُطلب منك دفعها مرة ثانية",
    );
    expect(account).toContain(
      "copyFriendOfferInvite(friendOffer)",
    );
  });
});
