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
  },
);