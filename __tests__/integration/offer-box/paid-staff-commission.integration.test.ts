import { afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getPaymentProvider } from "@/lib/payments/registry";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("TEST_DATABASE_URL_REQUIRED");

const url = new URL(rawUrl);

const r13Requested =
  process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1";

const allowedDatabase =
  process.env.APP_ENV === "test" &&
  process.env.NODE_ENV === "test" &&
  url.protocol === "mysql:" &&
  url.hostname === "127.0.0.1" &&
  (
    r13Requested
      ? (
          url.port === "3306" &&
          url.pathname === "/fitzone_final_release_r13_test" &&
          decodeURIComponent(url.username) === "fitzone_r13_user"
        )
      : (
          url.port === "13307" &&
          url.pathname === "/fitzone_test" &&
          decodeURIComponent(url.username) === "fitzone_test_user"
        )
  );

if (!allowedDatabase) {
  throw new Error("REFUSING_NON_ISOLATED_DATABASE");
}

const db = new PrismaClient();

const marker = `R13C-${Date.now()}-${Math.random()
  .toString(36).slice(2, 8)}`;

async function scenario(options: {
  rate: number;
  expectedAmount: number;
  expectedStatus: "earned" | "ineligible";
  settleThenRetry?: boolean;
  initialPaymentPending?: boolean;
}) {
  let customerId = "";
  let staffId = "";
  let offerId = "";
  let linkId = "";
  let paymentId = "";
  let purchaseId = "";

  const paidAt = new Date("2026-11-08T12:00:00.000Z");

  try {
    const customer = await db.user.create({
      data: {
        name: `${marker} CUSTOMER`,
        email: `${marker.toLowerCase()}-c-${options.rate}@test.local`,
        role: "customer",
        isActive: true,
      },
    });
    customerId = customer.id;

    const staff = await db.user.create({
      data: {
        name: `${marker} STAFF`,
        email: `${marker.toLowerCase()}-s-${options.rate}@test.local`,
        role: "staff",
        isActive: true,
      },
    });
    staffId = staff.id;

    const link = await db.staffReferralLink.create({
      data: {
        userId: staffId,
        token: `${marker}-LINK-${options.rate}`,
        isActive: true,
        clickCount: 0,
      },
    });
    linkId = link.id;

    const offer = await db.offer.create({
      data: {
        title: `${marker} OFFER ${options.rate}`,
        discount: 0,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        isActive: true,
        offerBoxEnabled: true,
        offerBoxReservedCount: 1,
        currentSubscribers: 0,
        maxSubscribers: 2,
      },
    });
    offerId = offer.id;

    const frozenCommission = JSON.stringify({
      version: 1,
      capturedAt: "2026-11-08T10:00:00.000Z",
      staff: {
        staffUserId: staffId,
        referralLinkId: linkId,
        referralToken: link.token,
        terms: {
          type: "percentage",
          rate: options.rate,
          baseAmount: 500,
        },
        policy: {
          classification: "new_customer",
          previousMembershipId: null,
          previousMembershipEndDate: null,
          gapDays: null,
          policyId: "R13C-ISOLATED-POLICY",
          positionId: "R13C-ISOLATED-POSITION",
          positionCode: "STAFF",
          rateBps: options.rate * 100,
        },
      },
    });

    const payment = await db.paymentTransaction.create({
      data: {
        userId: customerId,
        purpose: "offer_box",
        provider: "paymob",
        amount: 500,
        currency: "EGP",
        status: options.initialPaymentPending ? "pending" : "paid",
        paymentMethod: "paymob",
        offerId,
        paidAt: options.initialPaymentPending ? null : paidAt,
        metadata: JSON.stringify({ testMarker: marker }),
      },
    });
    paymentId = payment.id;

    const purchase = await db.offerBoxPurchase.create({
      data: {
        userId: customerId,
        offerId,
        status: "pending_payment",
        offerSnapshot: JSON.stringify({
          version: 1,
          testMarker: marker,
          commercial: {
            currency: "EGP",
            finalPrice: 500,
          },
          economics: {
            commissionSnapshot: frozenCommission,
          },
        }),
        snapshotVersion: 1,
        priceSnapshot: 500,
        currency: "EGP",
        paymentMethod: "paymob",
        holdExpiresAt: new Date(Date.now() + 3600000),
        paymentTransactionId: null,
      },
    });
    purchaseId = purchase.id;

    await db.paymentTransaction.update({
      where: { id: paymentId },
      data: {
        metadata: JSON.stringify({
          testMarker: marker,
          offerBoxPurchaseId: purchaseId,
          offerBoxSnapshotVersion: 1,
        }),
      },
    });

    const provider = getPaymentProvider("paymob");
    if (!provider) throw new Error("TEST_PAYMOB_PROVIDER_MISSING");

    const proof = vi.spyOn(provider, "verifyTransaction")
      .mockResolvedValue({
        status: "paid",
        message: "R13C isolated verified Paymob Order fixture",
      });

    if (options.initialPaymentPending) {
      const beforePayment =
        await db.paymentTransaction.findUniqueOrThrow({
          where: { id: paymentId },
        });

      expect(beforePayment.status).toBe("pending");
      expect(beforePayment.paidAt).toBeNull();
    }
    await updatePaymentTransactionStatus(paymentId, "paid");

    const first = await db.staffCommission.findMany({
      where: { offerBoxPurchaseId: purchaseId },
    });
    expect(first).toHaveLength(1);
    expect(first[0].staffUserId).toBe(staffId);
    expect(first[0].staffReferralLinkId).toBe(linkId);
    expect(first[0].userMembershipId).toBeNull();
    expect(first[0].amount).toBeCloseTo(options.expectedAmount, 5);
    expect(first[0].status).toBe(options.expectedStatus);
    const storedPayment =
      await db.paymentTransaction.findUniqueOrThrow({
        where: { id: paymentId },
      });

    expect(storedPayment.status).toBe("paid");

    if (options.initialPaymentPending) {
      expect(storedPayment.paidAt).toBeInstanceOf(Date);
      expect(first[0].earnedAt?.getTime()).toBe(
        storedPayment.paidAt?.getTime(),
      );
    } else {
      expect(first[0].earnedAt?.getTime()).toBe(paidAt.getTime());
    }
    expect(first[0].customerClassificationSnapshot).toBe("new_customer");
    expect(first[0].commissionAmountMinorSnapshot).toBe(
      Math.round(options.expectedAmount * 100),
    );

    const expectedClicks = options.expectedAmount > 0 ? 1 : 0;

    expect(
      (await db.staffReferralLink.findUniqueOrThrow({
        where: { id: linkId },
      })).clickCount,
    ).toBe(expectedClicks);

    await updatePaymentTransactionStatus(paymentId, "paid");

    const second = await db.staffCommission.findMany({
      where: { offerBoxPurchaseId: purchaseId },
    });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);

    expect(
      (await db.staffReferralLink.findUniqueOrThrow({
        where: { id: linkId },
      })).clickCount,
    ).toBe(expectedClicks);

    if (options.settleThenRetry) {
      await db.staffCommission.update({
        where: { id: first[0].id },
        data: {
          status: "settled",
          settledAt: new Date("2026-11-08T13:00:00.000Z"),
        },
      });

      await updatePaymentTransactionStatus(paymentId, "paid");

      const settled = await db.staffCommission.findMany({
        where: { offerBoxPurchaseId: purchaseId },
      });
      expect(settled).toHaveLength(1);
      expect(settled[0].id).toBe(first[0].id);
      expect(settled[0].status).toBe("settled");

      expect(
        (await db.staffReferralLink.findUniqueOrThrow({
          where: { id: linkId },
        })).clickCount,
      ).toBe(1);
    }

    const storedPurchase =
      await db.offerBoxPurchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });

    expect(storedPurchase.status).toBe("available");
    expect(storedPurchase.paymentTransactionId).toBe(paymentId);

    expect(await db.userMembership.count({
      where: { userId: customerId },
    })).toBe(0);

    expect(await db.booking.count({
      where: { userId: customerId },
    })).toBe(0);

    expect(proof).toHaveBeenCalledTimes(
      options.settleThenRetry ? 3 : 2,
    );

    console.log(
      `R13C_RATE_${options.rate}_COMMISSION=${options.expectedAmount}`,
    );
    console.log(
      `R13C_RATE_${options.rate}_STATUS=${options.expectedStatus}`,
    );
    console.log(
      `R13C_RATE_${options.rate}_EXACT_ONCE=PASS`,
    );
    console.log(
      `R13C_RATE_${options.rate}_CLICK_COUNT=${expectedClicks}`,
    );
    console.log(
      `R13C_RATE_${options.rate}_NO_MEMBERSHIP_OR_BOOKING=PASS`,
    );
    if (options.settleThenRetry) {
      console.log("R13C_SETTLED_RETRY_PRESERVED=PASS");
    }
  } finally {
    vi.restoreAllMocks();

    if (purchaseId) {
      await db.staffCommission.deleteMany({
        where: { offerBoxPurchaseId: purchaseId },
      });
      await db.offerBoxPurchase.deleteMany({
        where: { id: purchaseId },
      });
    }

    if (paymentId) {
      await db.paymentTransaction.deleteMany({
        where: { id: paymentId },
      });
    }
    if (offerId) {
      await db.offer.deleteMany({ where: { id: offerId } });
    }
    if (linkId) {
      await db.staffReferralLink.deleteMany({
        where: { id: linkId },
      });
    }
    if (customerId) {
      await db.user.deleteMany({
        where: { id: customerId },
      });
    }
    if (staffId) {
      await db.user.deleteMany({
        where: { id: staffId },
      });
    }
  }
}

afterAll(async () => {
  vi.restoreAllMocks();
  await db.$disconnect();
});

describe("Offer Box paid staff commission DB integration R13C", () => {
  it("earns once on verified payment and preserves settled on retry",
    async () => {
      await scenario({
        rate: 10,
        expectedAmount: 50,
        expectedStatus: "earned",
        settleThenRetry: true,
      });
    },
  );

  it("audits zero-rate referral without click increment",
    async () => {
      await scenario({
        rate: 0,
        expectedAmount: 0,
        expectedStatus: "ineligible",
      });
    },
  );
  it("accrues commission on first pending-to-paid transition exactly once",
    async () => {
      await scenario({
        rate: 10,
        expectedAmount: 50,
        expectedStatus: "earned",
        initialPaymentPending: true,
      });
    },
  );
});
