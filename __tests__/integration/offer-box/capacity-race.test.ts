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
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: Offer Box capacity race requires fitzone_test",
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
  getCurrentAppUser: mocks.getCurrentAppUser,
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
  `TEST-OFFER-BOX-RACE-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

let userAId = "";
let userBId = "";
let membershipId = "";
let offerId = "";

function getOfferMembershipIdField() {
  const offerModel =
    Prisma.dmmf.datamodel.models.find(
      model => model.name === "Offer",
    );

  if (!offerModel) {
    throw new Error("TEST_OFFER_MODEL_MISSING");
  }

  const relation =
    offerModel.fields.find(
      field =>
        field.kind === "object" &&
        field.type === "Membership" &&
        Array.isArray(field.relationFromFields) &&
        field.relationFromFields.length > 0,
    );

  const field =
    relation?.relationFromFields?.[0];

  if (!field) {
    throw new Error(
      "TEST_OFFER_MEMBERSHIP_RELATION_NOT_FOUND",
    );
  }

  return field;
}

async function cleanup() {
  const userIds =
    [userAId, userBId].filter(Boolean);

  if (userIds.length) {
    await db.offerBoxPurchase.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });

    await db.paymentTransaction.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
        purpose: "offer_box",
      },
    });

    await db.booking.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });

    await db.userMembership.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
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

  if (userIds.length) {
    await db.user.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });
  }
}

beforeAll(async () => {
  const userA =
    await db.user.create({
      data: {
        name: `${stamp} USER A`,
        email:
          `${stamp.toLowerCase()}-a@test.local`,
        role: "customer",
        isActive: true,
      },
    });

  userAId = userA.id;

  const userB =
    await db.user.create({
      data: {
        name: `${stamp} USER B`,
        email:
          `${stamp.toLowerCase()}-b@test.local`,
        role: "customer",
        isActive: true,
      },
    });

  userBId = userB.id;

  const membership =
    await db.membership.create({
      data: {
        name: `${stamp} MEMBERSHIP`,
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

  const offer =
    await db.offer.create({
      data: {
        title: `${stamp} OFFER`,
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

        /*
         * Exactly ONE remaining slot.
         */
        maxSubscribers: 1,

        requiresBirthDate: false,
        minAgeYears: null,
        maxAgeYears: null,

        [membershipField]:
          membershipId,
      } as any,
    });

  offerId = offer.id;
});

beforeEach(() => {
  vi.clearAllMocks();

  let authCall = 0;

  mocks.getCurrentAppUser
    .mockImplementation(async () => {
      const index = authCall++;

      if (index === 0) {
        return {
          id: userAId,
          name: `${stamp} USER A`,
          email:
            `${stamp.toLowerCase()}-a@test.local`,
        };
      }

      if (index === 1) {
        return {
          id: userBId,
          name: `${stamp} USER B`,
          email:
            `${stamp.toLowerCase()}-b@test.local`,
        };
      }

      throw new Error(
        "UNEXPECTED_AUTH_CALL",
      );
    });

  mocks.updatePaymentTransactionStatus
    .mockResolvedValue(undefined);

  mocks.createPaymentTransaction
    .mockImplementation(
      async (input: any) => {
        /*
         * No Paymob call.
         * Create only the local fitzone_test row.
         */
        return db.paymentTransaction.create({
          data: {
            userId: input.userId,
            provider: input.provider,
            purpose: input.purpose,

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
      },
    );
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

function checkoutRequest() {
  return new Request(
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
  );
}

describe(
  "Offer Box capacity race",
  () => {
    it(
      "allows exactly one buyer to claim the final slot",
      async () => {
        /*
         * Start both checkout requests concurrently.
         */
        const [
          responseA,
          responseB,
        ] = await Promise.all([
          offerBoxCheckout(
            checkoutRequest(),
          ),
          offerBoxCheckout(
            checkoutRequest(),
          ),
        ]);

        const [
          bodyA,
          bodyB,
        ] = await Promise.all([
          responseA.json(),
          responseB.json(),
        ]);

        const outcomes = [
          {
            status:
              responseA.status,
            body: bodyA,
          },
          {
            status:
              responseB.status,
            body: bodyB,
          },
        ];

        const winners =
          outcomes.filter(
            result =>
              result.status === 200 &&
              result.body.success === true,
          );

        const soldOut =
          outcomes.filter(
            result =>
              result.status === 409 &&
              result.body.code ===
                "OFFER_BOX_SOLD_OUT",
          );

        expect(
          winners,
          JSON.stringify(outcomes),
        ).toHaveLength(1);

        expect(
          soldOut,
          JSON.stringify(outcomes),
        ).toHaveLength(1);

        expect(
          typeof winners[0].body.purchaseId,
        ).toBe("string");

        /*
         * External checkout creation must happen
         * only for the winner.
         */
        expect(
          mocks.createPaymentTransaction,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.updatePaymentTransactionStatus,
        ).not.toHaveBeenCalled();

        const offer =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },

              select: {
                maxSubscribers: true,
                currentSubscribers: true,
                offerBoxReservedCount:
                  true,
              },
            });

        expect(
          offer.maxSubscribers,
        ).toBe(1);

        expect(
          offer.currentSubscribers,
        ).toBe(0);

        expect(
          offer.offerBoxReservedCount,
        ).toBe(1);

        /*
         * Exactly one durable purchase.
         */
        const purchases =
          await db.offerBoxPurchase.findMany({
            where: {
              offerId,
            },
          });

        expect(
          purchases,
        ).toHaveLength(1);

        expect(
          purchases[0].status,
        ).toBe("pending_payment");

        expect(
          purchases[0].paymentTransactionId,
        ).toBeTruthy();

        const paymentCount =
          await db.paymentTransaction.count({
            where: {
              offerId,
              purpose: "offer_box",
            },
          });

        expect(
          paymentCount,
        ).toBe(1);

        /*
         * No entitlement activation before payment/redeem.
         */
        const membershipCount =
          await db.userMembership.count({
            where: {
              userId: {
                in: [
                  userAId,
                  userBId,
                ],
              },
            },
          });

        const bookingCount =
          await db.booking.count({
            where: {
              userId: {
                in: [
                  userAId,
                  userBId,
                ],
              },
            },
          });

        expect(
          membershipCount,
        ).toBe(0);

        expect(
          bookingCount,
        ).toBe(0);

        console.log(
          "CONCURRENT_BUYERS=2",
        );

        console.log(
          "AVAILABLE_SLOTS=1",
        );

        console.log(
          "SUCCESSFUL_CHECKOUTS=1",
        );

        console.log(
          "SOLD_OUT_RESPONSES=1",
        );

        console.log(
          "PAYMENT_TRANSACTIONS_CREATED=1",
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
          "OVERSELL_PREVENTION_GATE=PASS",
        );

        console.log(
          "EXTERNAL_PAYMENT_PROVIDER_CALLED=NO",
        );
      },
      20000,
    );
  },
);