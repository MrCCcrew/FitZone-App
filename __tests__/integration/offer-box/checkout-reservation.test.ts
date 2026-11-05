import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  Prisma,
  PrismaClient,
} from "@prisma/client";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error(
    "REFUSING: DATABASE_URL missing",
  );
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !==
    "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: Offer Box integration requires fitzone_test as fitzone_test_user",
  );
}

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  createPaymentTransaction: vi.fn(),
  updatePaymentTransactionStatus: vi.fn(),
}));

// Checkout readiness is tested independently. This suite mocks only the
// provider preflight so that no Paymob credentials or network are used.
vi.mock("@/lib/payments/offer-box-checkout-readiness", () => ({
  isOfferBoxPaymobCheckoutReady: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser:
    mocks.getCurrentAppUser,
}));

vi.mock("@/lib/payments/service", () => ({
  createPaymentTransaction:
    mocks.createPaymentTransaction,
  updatePaymentTransactionStatus:
    mocks.updatePaymentTransactionStatus,
}));

import {
  POST as offerBoxCheckout,
} from "@/app/api/offer-box/checkout/route";

const db = new PrismaClient();

const stamp =
  `TEST-OFFER-BOX-CHECKOUT-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

let userId = "";
let membershipId = "";
let offerId = "";
let paymentId = "";
let purchaseId = "";

function getOfferMembershipIdField() {
  const offerModel =
    (
      Prisma.dmmf.datamodel.models as any[]
    ).find(
      (model) => model.name === "Offer",
    );

  if (!offerModel) {
    throw new Error(
      "TEST_OFFER_MODEL_MISSING",
    );
  }

  const relation =
    offerModel.fields.find(
      (field: any) =>
        field.kind === "object" &&
        field.type === "Membership" &&
        Array.isArray(
          field.relationFromFields,
        ) &&
        field.relationFromFields.length > 0,
    );

  const field =
    relation?.relationFromFields?.[0];

  if (
    typeof field !== "string" ||
    !field
  ) {
    throw new Error(
      "TEST_OFFER_MEMBERSHIP_RELATION_NOT_FOUND",
    );
  }

  return field;
}

async function cleanup() {
  if (purchaseId) {
    await db.offerBoxPurchase.deleteMany({
      where: {
        id: purchaseId,
      },
    });
  }

  if (paymentId) {
    await db.paymentTransaction.deleteMany({
      where: {
        id: paymentId,
      },
    });
  }

  if (userId) {
    await db.booking.deleteMany({
      where: {
        userId,
      },
    });

    await db.userMembership.deleteMany({
      where: {
        userId,
      },
    });
  }

  if (offerId) {
    await db.offer.deleteMany({
      where: {
        id: offerId,
      },
    });
  }

  if (membershipId) {
    await db.membership.deleteMany({
      where: {
        id: membershipId,
      },
    });
  }

  if (userId) {
    await db.user.deleteMany({
      where: {
        id: userId,
      },
    });
  }
}

beforeAll(async () => {
  const user =
    await db.user.create({
      data: {
        name:
          `${stamp} USER`,
        email:
          `${stamp.toLowerCase()}@test.local`,
        role: "customer",
        isActive: true,
      },
    });

  userId = user.id;

  const membership =
    await db.membership.create({
      data: {
        name:
          `${stamp} MEMBERSHIP`,
        price: 100,
        duration: 30,
        features: "[]",
        isActive: true,
        coachMembershipEnabled: false,
      },
    });

  membershipId = membership.id;

  const membershipField =
    getOfferMembershipIdField();

  const offerData: Record<
    string,
    unknown
  > = {
    title:
      `${stamp} OFFER`,
    discount: 0,
    expiresAt:
      new Date(
        Date.now() +
          7 * 24 * 60 * 60 * 1000,
      ),
    isActive: true,

    offerBoxEnabled: true,
    offerBoxReservedCount: 0,

    currentSubscribers: 0,
    maxSubscribers: 2,

    requiresBirthDate: false,
    minAgeYears: null,
    maxAgeYears: null,

    [membershipField]:
      membership.id,
  };

  const offer =
    await db.offer.create({
      data: offerData as any,
    });

  offerId = offer.id;
});

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getCurrentAppUser
    .mockResolvedValue({
      id: userId,
      name:
        `${stamp} CUSTOMER`,
      email:
        `${stamp.toLowerCase()}@test.local`,
    });

  mocks.updatePaymentTransactionStatus
    .mockResolvedValue(undefined);

  mocks.createPaymentTransaction
    .mockImplementation(
      async (input: any) => {
        /*
         * IMPORTANT:
         * This is deliberately a LOCAL fitzone_test
         * PaymentTransaction only.
         *
         * The real payment service and Paymob provider
         * are replaced by the module mock above.
         */
        const transaction =
          await db.paymentTransaction.create({
            data: {
              userId:
                input.userId,
              provider:
                input.provider,
              purpose:
                input.purpose,
              amount:
                Number(input.amount),

              currency:
                input.currency ?? "EGP",

              status: "pending",

              paymentMethod:
                input.paymentMethod ?? null,

              offerId:
                input.offerId ?? null,

              metadata:
                JSON.stringify(
                  input.metadata ?? {},
                ),

              expiresAt:
                input.provisionalExpiresAt ??
                new Date(
                  Date.now() +
                    60 * 60 * 1000,
                ),
            },
          });

        paymentId =
          transaction.id;

        return transaction;
      },
    );
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe(
  "Offer Box checkout reservation",
  () => {
    it(
      "reserves capacity without activating membership or booking schedules before payment",
      async () => {
        const response =
          await offerBoxCheckout(
            new Request(
              "http://localhost/api/offer-box/checkout",
              {
                method: "POST",
                headers: {
                  "content-type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    offerId,
                  }),
              },
            ),
          );

        const body =
          await response.json();

        expect(
          response.status,
          JSON.stringify(body),
        ).toBe(200);

        expect(body.success)
          .toBe(true);

        expect(
          typeof body.purchaseId,
        ).toBe("string");

        purchaseId =
          body.purchaseId;

        expect(
          mocks.createPaymentTransaction,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.createPaymentTransaction,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            provider: "paymob",
            purpose: "offer_box",
            businessUnit: "club",
            amount: 100,
            currency: "EGP",
            paymentMethod: "paymob",
            offerId,
          }),
        );

        expect(
          mocks.updatePaymentTransactionStatus,
        ).not.toHaveBeenCalled();

        const purchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        expect(
          purchase.userId,
        ).toBe(userId);

        expect(
          purchase.offerId,
        ).toBe(offerId);

        expect(
          purchase.status,
        ).toBe("pending_payment");

        expect(
          purchase.paymentTransactionId,
        ).toBe(paymentId);

        expect(
          Number(
            purchase.priceSnapshot,
          ),
        ).toBe(100);

        expect(
          purchase.holdExpiresAt,
        ).toBeInstanceOf(Date);

        expect(
          purchase.offerSnapshot,
        ).toContain(
          `"version":1`,
        );

        const payment =
          await db.paymentTransaction
            .findUniqueOrThrow({
              where: {
                id: paymentId,
              },
            });

        expect(
          payment.userId,
        ).toBe(userId);

        expect(
          payment.offerId,
        ).toBe(offerId);

        expect(
          payment.purpose,
        ).toBe("offer_box");

        expect(
          payment.provider,
        ).toBe("paymob");

        expect(
          payment.status,
        ).toBe("pending");

        expect(
          Number(payment.amount),
        ).toBe(100);

        const offer =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },
              select: {
                currentSubscribers:
                  true,
                offerBoxReservedCount:
                  true,
              },
            });

        expect(
          offer.currentSubscribers,
        ).toBe(0);

        expect(
          offer.offerBoxReservedCount,
        ).toBe(1);

        const memberships =
          await db.userMembership.count({
            where: {
              userId,
            },
          });

        const bookings =
          await db.booking.count({
            where: {
              userId,
            },
          });

        expect(memberships)
          .toBe(0);

        expect(bookings)
          .toBe(0);

        console.log(
          "OFFER_BOX_PURCHASE_STATUS=pending_payment",
        );

        console.log(
          "OFFER_BOX_RESERVED_COUNT=1",
        );

        console.log(
          "OFFER_CURRENT_SUBSCRIBERS=0",
        );

        console.log(
          "USER_MEMBERSHIP_COUNT=0",
        );

        console.log(
          "BOOKING_COUNT=0",
        );

        console.log(
          "PAYMENT_SERVICE_MOCKED=YES",
        );

        console.log(
          "EXTERNAL_PAYMENT_PROVIDER_CALLED=NO",
        );
      },
      20000,
    );
    it("sends 90 without admin discount, 72 with opt-in, and freezes each invoice", async () => {
      // Previous test fixture left an unpaid hold: clean isolated test rows.
      await db.offerBoxPurchase.deleteMany({ where: { userId, offerId } });
      if (paymentId) await db.paymentTransaction.deleteMany({ where: { id: paymentId } });
      paymentId = "";
      purchaseId = "";
      await db.membership.update({ where: { id: membershipId }, data: { priceAfter: 90 } });

      for (const [apply, amount] of [[false, 90], [true, 72]] as const) {
        await db.offer.update({
          where: { id: offerId },
          data: {
            type: "percentage", discount: 20, specialPrice: null,
            offerBoxApplyDiscount: apply, offerBoxReservedCount: 0,
          },
        });
        mocks.createPaymentTransaction.mockClear();
        const response = await offerBoxCheckout(new Request("http://localhost/api/offer-box/checkout", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ offerId }),
        }));
        const body = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(200);
        purchaseId = body.purchaseId;
        expect(mocks.createPaymentTransaction).toHaveBeenCalledWith(
          expect.objectContaining({ amount, provider: "paymob", purpose: "offer_box", offerId }),
        );
        const purchase = await db.offerBoxPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
        expect(Number(purchase.priceSnapshot)).toBe(amount);
        expect(JSON.parse(purchase.offerSnapshot).offer.offerBoxApplyDiscount).toBe(apply);
        const transaction = await db.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } });
        expect(Number(transaction.amount)).toBe(amount);

        await db.offerBoxPurchase.delete({ where: { id: purchaseId } });
        await db.paymentTransaction.delete({ where: { id: paymentId } });
        paymentId = "";
        purchaseId = "";
      }
      expect(await db.userMembership.count({ where: { userId } })).toBe(0);
    }, 20000);

    it("requires a structurally valid Egyptian ID for student offers and never persists it", async () => {
      // Isolated fixture; previous checkout test has removed its own holds.
      await db.offerBoxPurchase.deleteMany({ where: { userId, offerId } });
      if (paymentId) await db.paymentTransaction.deleteMany({ where: { id: paymentId } });
      paymentId = "";
      purchaseId = "";
      await db.offer.update({
        where: { id: offerId },
        data: {
          requiresBirthDate: true, requiresEgyptianNationalId: true,
          minAgeYears: 13, maxAgeYears: 25, offerBoxReservedCount: 0,
        },
      });
      const attempt = async (nationalId?: string) => {
        const response = await offerBoxCheckout(new Request("http://localhost/api/offer-box/checkout", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ offerId, ...(nationalId ? { egyptianNationalId: nationalId } : {}) }),
        }));
        return { status: response.status, data: await response.json() };
      };
      const missing = await attempt();
      expect(missing.status).toBe(400);
      expect(missing.data.code).toBe("EGYPTIAN_NATIONAL_ID_REQUIRED");
      const malformed = await attempt("00000000000000");
      expect(malformed.status).toBe(400);
      expect(malformed.data.code).toBe("EGYPTIAN_NATIONAL_ID_INVALID");
      const tooYoung = await attempt("32010100112345");
      expect(tooYoung.status).toBe(400);
      expect(tooYoung.data.code).toBe("AGE_NOT_ELIGIBLE");
      expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
      const valid = "30810100112345"; // synthetic structure-only fixture; not a real identity proof
      const accepted = await attempt(valid);
      expect(accepted.status, JSON.stringify(accepted.data)).toBe(200);
      purchaseId = accepted.data.purchaseId;
      const saved = await db.offerBoxPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
      const snapshotText = saved.offerSnapshot;
      expect(snapshotText).not.toContain(valid);
      expect(JSON.parse(snapshotText).ageEligibility).toMatchObject({
        verificationMethod: "egyptian_national_id",
        ageYearsAtPurchase: expect.any(Number),
      });
      expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);
      const payment = await db.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.metadata).not.toContain(valid);
      expect(await db.userMembership.count({ where: { userId } })).toBe(0);
    }, 20000);

  },
);