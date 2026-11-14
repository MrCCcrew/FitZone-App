import { describe, expect, it, vi } from "vitest";
import { accruePreparedOfferBoxStaffCommissionTx } from
  "@/lib/offer-box/paid-staff-commission-tx";

function prepared(amount = 50, status = "earned") {
  return {
    offerBoxPurchaseId: "purchase-1",
    staffUserId: "staff-1",
    staffReferralLinkId: "link-1",
    userMembershipId: null,
    amount,
    status,
    earnedAt: new Date("2026-11-07T17:00:00.000Z"),
  };
}

function mockTx(existing: unknown = null) {
  const findUnique = vi.fn().mockResolvedValue(existing);
  const create = vi.fn().mockResolvedValue({ id: "commission-1" });
  const update = vi.fn().mockResolvedValue({ id: "link-1" });
  return {
    tx: {
      staffCommission: { findUnique, create },
      staffReferralLink: { update },
    },
    findUnique,
    create,
    update,
  };
}

describe("Paid Offer Box staff commission exact-once transaction", () => {
  it("creates one commission for a new paid purchase", async () => {
    const f = mockTx();
    const result = await accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never, prepared(),
    );

    expect(result).toEqual({
      created: true,
      commissionId: "commission-1",
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledWith({
      data: prepared(),
      select: { id: true },
    });
    expect(f.update).toHaveBeenCalledTimes(1);
  });

  it("does not repeat commission or click count", async () => {
    const data = prepared();
    const f = mockTx({ id: "commission-1", ...data });

    const result = await accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never, data,
    );

    expect(result.created).toBe(false);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("preserves an already settled commission on payment retry", async () => {
    const data = prepared();
    const f = mockTx({
      id: "commission-1",
      ...data,
      status: "settled",
    });

    const result = await accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never,
      data,
    );

    expect(result).toEqual({
      created: false,
      commissionId: "commission-1",
    });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("rejects a changed eligibility status on retry", async () => {
    const f = mockTx({
      id: "commission-1",
      ...prepared(50, "ineligible"),
    });

    await expect(accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never,
      prepared(50, "earned"),
    )).rejects.toThrow(
      "OFFER_BOX_COMMISSION_EXISTING_ROW_MISMATCH",
    );

    expect(f.create).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("rejects existing commission for another employee", async () => {
    const f = mockTx({
      id: "commission-1",
      ...prepared(),
      staffUserId: "another-staff",
    });

    await expect(accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never, prepared(),
    )).rejects.toThrow(
      "OFFER_BOX_COMMISSION_EXISTING_ROW_MISMATCH",
    );

    expect(f.create).not.toHaveBeenCalled();
  });

  it("records zero-value policy decisions without clicks", async () => {
    const f = mockTx();
    await accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never, prepared(0, "ineligible"),
    );

    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).not.toHaveBeenCalled();
  });

  it("does nothing without frozen staff attribution", async () => {
    const f = mockTx();
    expect(await accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never, null,
    )).toEqual({ created: false, commissionId: null });

    expect(f.findUnique).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });

  it("rejects conflicting financial amounts on retry", async () => {
    const f = mockTx({
      id: "commission-1",
      ...prepared(75),
    });

    await expect(accruePreparedOfferBoxStaffCommissionTx(
      f.tx as never, prepared(50),
    )).rejects.toThrow(
      "OFFER_BOX_COMMISSION_EXISTING_ROW_MISMATCH",
    );
  });
});
