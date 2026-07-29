import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { findUnique, findPaymentTransaction, recordBusinessAnalyticsEvent } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findPaymentTransaction: vi.fn(),
  recordBusinessAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { userMembership: { findUnique }, paymentTransaction: { findUnique: findPaymentTransaction } },
}));
vi.mock("@/lib/analytics/business-events", () => ({ recordBusinessAnalyticsEvent }));

import { recordMembershipActivatedEvent } from "@/lib/analytics/membership-events";

const activeMembership = (overrides: Record<string, unknown> = {}) => ({
  id: "user-membership-1",
  userId: "user-1",
  status: "active",
  membership: { id: "membership-1", name: "Gold", kind: "subscription" },
  offer: null,
  ...overrides,
});

describe("membership activated analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordBusinessAnalyticsEvent.mockResolvedValue({ recorded: true, ignored: false });
    findPaymentTransaction.mockResolvedValue({ amount: 250, currency: "EGP" });
  });

  it.each([
    ["subscription", activeMembership(), "subscription", "membership-1"],
    ["package", activeMembership({ membership: { id: "package-1", name: "PT Package", kind: "package" } }), "package", "package-1"],
    ["offer", activeMembership({ offer: { id: "offer-1", title: "Summer Offer" } }), "offer", "offer-1"],
  ])("records an active %s with its source entity ID", async (_kind, membership, entityType, entityId) => {
    findUnique.mockResolvedValue(membership);

    await recordMembershipActivatedEvent("user-membership-1", "transaction-1");

    expect(recordBusinessAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "membership_activated",
      userId: "user-1",
      entityType,
      entityId,
      success: true,
      paymentTransactionId: "transaction-1",
      value: 250,
      currency: "EGP",
    }));
  });

  it("does not record an activation unless the membership is active", async () => {
    findUnique.mockResolvedValue(activeMembership({ status: "pending_payment" }));

    await recordMembershipActivatedEvent("user-membership-1");

    expect(recordBusinessAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("uses the membership user context without a payment transaction", async () => {
    findUnique.mockResolvedValue(activeMembership());

    await recordMembershipActivatedEvent("user-membership-1");

    const event = recordBusinessAnalyticsEvent.mock.calls[0]![0];
    expect(event).toMatchObject({ userId: "user-1", entityId: "membership-1" });
    expect(event).not.toHaveProperty("paymentTransactionId");
    expect(event).not.toHaveProperty("metadata");
  });

  it("absorbs analytics failures without changing membership data", async () => {
    findUnique.mockResolvedValue(activeMembership());
    recordBusinessAnalyticsEvent.mockRejectedValue(new Error("analytics unavailable"));

    await expect(recordMembershipActivatedEvent("user-membership-1")).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
