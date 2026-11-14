import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { resolveOfferBoxStaffReferralLinkTx } from
  "@/lib/offer-box/staff-referral-attribution";

function fakeTx(pendingStaffRef: string | null, link?: {
  id: string;
  isActive: boolean;
} | null) {
  const findCustomer = vi.fn().mockResolvedValue({ pendingStaffRef });
  const findLink = vi.fn().mockResolvedValue(link ?? null);

  const tx = {
    user: { findUnique: findCustomer },
    staffReferralLink: { findUnique: findLink },
  } as unknown as Prisma.TransactionClient;

  return { tx, findCustomer, findLink };
}

describe("Offer Box staff attribution at checkout", () => {
  it("freezes the active staff referral link", async () => {
    const f = fakeTx("  staff123 ", {
      id: "link-1",
      isActive: true,
    });

    await expect(resolveOfferBoxStaffReferralLinkTx(
      f.tx, "customer-1",
    )).resolves.toBe("link-1");

    expect(f.findLink).toHaveBeenCalledWith({
      where: { token: "STAFF123" },
      select: { id: true, isActive: true },
    });
  });

  it("does not attribute a customer with no referral", async () => {
    const f = fakeTx(null);
    await expect(resolveOfferBoxStaffReferralLinkTx(
      f.tx, "customer-1",
    )).resolves.toBeNull();
    expect(f.findLink).not.toHaveBeenCalled();
  });

  it("does not attribute inactive staff links", async () => {
    const f = fakeTx("STAFF123", {
      id: "link-1",
      isActive: false,
    });

    await expect(resolveOfferBoxStaffReferralLinkTx(
      f.tx, "customer-1",
    )).resolves.toBeNull();
  });

  it("does not attribute a missing staff link", async () => {
    const f = fakeTx("STAFF123");
    await expect(resolveOfferBoxStaffReferralLinkTx(
      f.tx, "customer-1",
    )).resolves.toBeNull();
  });

  it("rejects missing customer identity", async () => {
    const f = fakeTx(null);
    await expect(resolveOfferBoxStaffReferralLinkTx(
      f.tx, " ",
    )).rejects.toThrow("OFFER_BOX_REFERRAL_CUSTOMER_REQUIRED");
  });

  it("rejects a customer missing from the database", async () => {
    const f = fakeTx(null);
    f.findCustomer.mockResolvedValueOnce(null);

    await expect(resolveOfferBoxStaffReferralLinkTx(
      f.tx, "customer-1",
    )).rejects.toThrow("OFFER_BOX_REFERRAL_CUSTOMER_NOT_FOUND");
  });
});
