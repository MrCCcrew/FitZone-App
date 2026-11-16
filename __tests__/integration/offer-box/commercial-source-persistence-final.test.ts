{
  const r15zaqRaw = process.env.DATABASE_URL;
  if (!r15zaqRaw ||
      process.env.DIRECT_URL !== r15zaqRaw ||
      process.env.TEST_DATABASE_URL !== r15zaqRaw ||
      process.env.APP_ENV !== "test" ||
      process.env.NODE_ENV !== "test" ||
      process.env.FITZONE_R13_ISOLATED_INTEGRATION !== "1") {
    throw new Error("R15ZAQ_R13_ENVIRONMENT_REJECTED");
  }
  const r15zaqTarget = new URL(r15zaqRaw);
  if (
    r15zaqTarget.protocol !== "mysql:" ||
    r15zaqTarget.hostname !== "127.0.0.1" ||
    r15zaqTarget.port !== "3306" ||
    decodeURIComponent(r15zaqTarget.username) !== "fitzone_r13_user" ||
    r15zaqTarget.pathname !== "/fitzone_final_release_r13_test"
  ) {
    throw new Error("R15ZAQ_R13_DATABASE_IDENTITY_REJECTED");
  }
}
import { reserveDirectCommercialEconomicsTx } from "@/lib/offer-box/direct-commercial-economics";
import { reconcileDirectCommercialHold } from "@/lib/offer-box/reconcile-direct-commercial-hold";
import { readOfferBoxCollection } from "@/lib/offer-box/collection-read-model";
import { releaseUnstartedDirectCommercialHoldTx } from "@/lib/offer-box/direct-commercial-hold-release";
import { activatePaidDirectCommercialPurchaseTx } from "@/lib/offer-box/direct-commercial-activation";
import { reconcilePaidDirectCommercialPurchaseTx } from "@/lib/offer-box/direct-commercial-paid-reconciliation";
import { reconcilePaidOfferBoxPurchase } from "@/lib/payments/offer-box-payment";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";
import { vi } from "vitest";
import { initializeDirectCommercialPayment } from "@/lib/payments/service";
import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";
import { createDirectCommercialPaymentTx } from "@/lib/offer-box/create-direct-commercial-payment";
import { bindDirectCommercialPaymentTx } from "@/lib/offer-box/direct-commercial-payment-binding";
import { prepareDirectCommercialCheckoutTx } from "@/lib/offer-box/prepare-direct-commercial-checkout";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  PrismaClient,
  type Prisma,
} from "@prisma/client";

import {
  assertSameCommercialPurchaseSource,
  createCommercialPurchaseSource,
  readCommercialPurchaseSource,
} from "@/lib/offer-box/commercial-source-contract";

function databaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;

  if (
    !raw ||
    raw !== process.env.DATABASE_URL ||
    raw !== process.env.DIRECT_URL ||
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV !== "test"
  ) {
    throw new Error("EXACT_TEST_ENV_REQUIRED");
  }

  const url = new URL(raw);

  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    decodeURIComponent(url.username) !== "fitzone_r13_user" ||
    url.pathname !== "/fitzone_final_release_r13_test"
  ) {
    throw new Error("REFUSING_NON_SANDBOX_DATABASE");
  }

  return raw;
}

const db = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl(),
    },
  },
});

const DAY = 86400000;

const eligibilitySnapshot = JSON.stringify({
  mode: "class_types",
  classIds: [],
  classTypes: ["fitness"],
});

const frozenTerms = JSON.stringify({
  version: 1,
  offer: {
    title: "Commercial persistence fixture",
  },
  membershipTemplate: {
    name: "Fixture product",
    durationDays: 30,
    sessionsCount: 6,
  },
  eligibilitySnapshot: JSON.parse(eligibilitySnapshot),
  commercial: {
    currency: "EGP",
    finalPrice: 600,
  },
});

beforeAll(async () => {
  const rows = await db.$queryRaw<
    Array<{ dbName: string; dbUser: string }>
  >`
    SELECT DATABASE() AS dbName,
           CURRENT_USER() AS dbUser
  `;

  expect(rows[0]?.dbName).toBe("fitzone_final_release_r13_test");

  expect(
    rows[0]?.dbUser.split("@")[0],
  ).toBe("fitzone_r13_user");

  const columns = await db.$queryRaw<
    Array<{ name: string }>
  >`
    SELECT COLUMN_NAME AS name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'OfferBoxPurchase'
      AND COLUMN_NAME IN (
        'commercialKind',
        'catalogMembershipId'
      )
  `;

  expect(
    columns.map((row) => row.name).sort(),
  ).toEqual([
    "catalogMembershipId",
    "commercialKind",
  ]);
});

afterAll(async () => {
  await db.$disconnect();
});

async function rollbackTest(
  execute: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const marker = new Error("EXPECTED_FIXTURE_ROLLBACK");

  let assertionsCompleted = false;

  try {
    await db.$transaction(async (tx) => {
      await execute(tx);

      assertionsCompleted = true;

      throw marker;
    }, { timeout: 30000 });

    throw new Error("FIXTURE_TRANSACTION_COMMITTED");
  } catch (error) {
    if (
      error !== marker ||
      !assertionsCompleted
    ) {
      throw error;
    }
  }

  expect(assertionsCompleted).toBe(true);
}

async function createCatalogFixture(
  tx: Prisma.TransactionClient,
) {
  const stamp = `${Date.now()}-${Math.random()
    .toString(36).slice(2)}`;

  const user = await tx.user.create({
    data: {
      name: "Commercial persistence customer",
      email: `commercial-source-${stamp}@test.local`,
      role: "member",
      isActive: true,
    },
  });

  const plan = await tx.membership.create({
    data: {
      name: `Package-${stamp}`,
      kind: "package",
      price: 600,
      duration: 30,
      sessionsCount: 6,
      features: "[]",
      isActive: true,
    },
  });

  const offer = await tx.offer.create({
    data: {
      title: `Offer-${stamp}`,
      discount: 10,
      membershipId: plan.id,
      expiresAt: new Date(Date.now() + DAY * 30),
      isActive: true,
    },
  });

  return { user, plan, offer };
}

async function createEntitlement(
  tx: Prisma.TransactionClient,
  userId: string,
  purchaseId: string,
) {
  return tx.offerBoxEntitlement.create({
    data: {
      userId,
      purchaseId,
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + DAY * 30),
      totalSessions: 6,
      eligibilitySnapshot,
    },
  });
}

describe("commercial source persistence real MySQL", () => {
  it("retains the legacy default and existing redemption ownership", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan, offer } =
        await createCatalogFixture(tx);

      const legacyMembership =
        await tx.userMembership.create({
          data: {
            userId: user.id,
            membershipId: plan.id,
            offerId: offer.id,
            status: "active",
            startDate: new Date(),
            endDate: new Date(Date.now() + DAY * 30),
            paymentAmount: 600,
            paymentMethod: "cash",
            totalSessions: 6,
            baseSessions: 6,
          },
        });

      const purchase =
        await tx.offerBoxPurchase.create({
          data: {
            userId: user.id,
            offerId: offer.id,
            status: "redeemed",
            priceSnapshot: 600,
            currency: "EGP",
            offerSnapshot: frozenTerms,
            paidAt: new Date(),
            redeemedAt: new Date(),
            redeemedUserMembershipId:
              legacyMembership.id,
          },
        });

      const loaded =
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: purchase.id },
          include: {
            redeemedUserMembership: true,
            entitlement: true,
          },
        });

      expect(
        readCommercialPurchaseSource(loaded),
      ).toEqual({
        commercialKind: "offer_box",
        offerId: offer.id,
        catalogMembershipId: null,
      });

      expect(loaded.redeemedUserMembershipId)
        .toBe(legacyMembership.id);

      expect(loaded.redeemedUserMembership)
        .toEqual(legacyMembership);

      expect(loaded.entitlement).toBeNull();

      expect(loaded.offerSnapshot).toBe(frozenTerms);
      expect(loaded.priceSnapshot).toBe(600);
    });
  }, 30000);

  it("persists two independent purchases of the same package without a customer membership", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan } =
        await createCatalogFixture(tx);

      const source =
        createCommercialPurchaseSource({
          commercialKind: "package",
          offerId: null,
          catalogMembershipId: plan.id,
        });

      const purchases = [];

      for (let index = 0; index < 2; index++) {
        const purchase =
          await tx.offerBoxPurchase.create({
            data: {
              ...source,
              userId: user.id,
              status: "redeemed",
              priceSnapshot: 600,
              currency: "EGP",
              offerSnapshot: frozenTerms,
              paidAt: new Date(),
              redeemedAt: new Date(),
            },
          });

        const entitlement = await createEntitlement(
          tx,
          user.id,
          purchase.id,
        );

        purchases.push({ purchase, entitlement });
      }

      expect(purchases[0].purchase.id)
        .not.toBe(purchases[1].purchase.id);

      expect(purchases[0].entitlement.id)
        .not.toBe(purchases[1].entitlement.id);

      const loaded =
        await tx.offerBoxPurchase.findMany({
          where: { userId: user.id },
          include: { entitlement: true },
        });

      expect(loaded).toHaveLength(2);

      for (const row of loaded) {
        assertSameCommercialPurchaseSource(
          row,
          source,
        );

        expect(row.redeemedUserMembershipId)
          .toBeNull();

        expect(row.entitlement).toMatchObject({
          purchaseId: row.id,
          userId: user.id,
          status: "active",
          totalSessions: 6,
          eligibilitySnapshot,
        });

        expect(row.priceSnapshot).toBe(600);
        expect(row.offerSnapshot).toBe(frozenTerms);
      }

      expect(
        await tx.userMembership.count({
          where: { userId: user.id },
        }),
      ).toBe(0);

      expect(
        await tx.booking.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });
  }, 30000);

  it("persists an independent direct offer alongside a package without membership ownership", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan, offer } =
        await createCatalogFixture(tx);

      const packageSource =
        createCommercialPurchaseSource({
          commercialKind: "package",
          offerId: null,
          catalogMembershipId: plan.id,
        });

      const directSource =
        createCommercialPurchaseSource({
          commercialKind: "direct_offer",
          offerId: offer.id,
          catalogMembershipId: plan.id,
        });

      const packagePurchase =
        await tx.offerBoxPurchase.create({
          data: {
            ...packageSource,
            userId: user.id,
            status: "redeemed",
            priceSnapshot: 600,
            offerSnapshot: frozenTerms,
            paidAt: new Date(),
            redeemedAt: new Date(),
          },
        });

      const packageEntitlement =
        await createEntitlement(
          tx,
          user.id,
          packagePurchase.id,
        );

      const directPurchase =
        await tx.offerBoxPurchase.create({
          data: {
            ...directSource,
            userId: user.id,
            status: "redeemed",
            priceSnapshot: 500,
            offerSnapshot: frozenTerms,
            paidAt: new Date(),
            redeemedAt: new Date(),
          },
        });

      await createEntitlement(
        tx,
        user.id,
        directPurchase.id,
      );

      const loaded =
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: directPurchase.id },
          include: { entitlement: true },
        });

      assertSameCommercialPurchaseSource(
        loaded,
        directSource,
      );

      expect(loaded.redeemedUserMembershipId)
        .toBeNull();

      expect(loaded.entitlement?.totalSessions)
        .toBe(6);

      expect(
        await tx.offerBoxEntitlement.findUniqueOrThrow({
          where: { id: packageEntitlement.id },
        }),
      ).toEqual(packageEntitlement);

      expect(
        await tx.userMembership.count({
          where: { userId: user.id },
        }),
      ).toBe(0);

      expect(() =>
        assertSameCommercialPurchaseSource(
          loaded,
          packageSource,
        ),
      ).toThrow("COMMERCIAL_SOURCE_MISMATCH");
    });
  }, 30000);

  it("preserves a purchased right when its live offer is deleted", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan, offer } =
        await createCatalogFixture(tx);

      const source =
        createCommercialPurchaseSource({
          commercialKind: "direct_offer",
          offerId: offer.id,
          catalogMembershipId: plan.id,
        });

      const purchase =
        await tx.offerBoxPurchase.create({
          data: {
            ...source,
            userId: user.id,
            status: "redeemed",
            priceSnapshot: 600,
            offerSnapshot: frozenTerms,
            paidAt: new Date(),
            redeemedAt: new Date(),
          },
        });

      const entitlement = await createEntitlement(
        tx,
        user.id,
        purchase.id,
      );

      await tx.offer.delete({
        where: { id: offer.id },
      });

      const historical =
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: purchase.id },
          include: { entitlement: true },
        });

      expect(
        readCommercialPurchaseSource(historical),
      ).toEqual({
        commercialKind: "direct_offer",
        offerId: null,
        catalogMembershipId: plan.id,
      });

      expect(historical.offerSnapshot)
        .toBe(frozenTerms);

      expect(historical.priceSnapshot).toBe(600);

      expect(historical.entitlement)
        .toEqual(entitlement);

      expect(historical.redeemedUserMembershipId)
        .toBeNull();

      expect(() =>
        createCommercialPurchaseSource(historical),
      ).toThrow("OFFER_ID_REQUIRED");
    });
  }, 30000);

  it("enforces one entitlement per purchase and rejects a duplicate owner record", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan } =
        await createCatalogFixture(tx);

      const source =
        createCommercialPurchaseSource({
          commercialKind: "package",
          offerId: null,
          catalogMembershipId: plan.id,
        });

      const purchase =
        await tx.offerBoxPurchase.create({
          data: {
            ...source,
            userId: user.id,
            status: "redeemed",
            priceSnapshot: 600,
            offerSnapshot: frozenTerms,
            paidAt: new Date(),
            redeemedAt: new Date(),
          },
        });

      const entitlement = await createEntitlement(
        tx,
        user.id,
        purchase.id,
      );

      await expect(
        createEntitlement(
          tx,
          user.id,
          purchase.id,
        ),
      ).rejects.toMatchObject({
        code: "P2002",
      });

      expect(
        await tx.offerBoxEntitlement.count({
          where: {
            purchaseId: purchase.id,
          },
        }),
      ).toBe(1);

      expect(
        await tx.offerBoxEntitlement.findUniqueOrThrow({
          where: { id: entitlement.id },
        }),
      ).toEqual(entitlement);
    });
  }, 30000);
});

describe("direct commercial pending checkout", () => {
  function makeSnapshot(
    plan: {
      id: string;
      name: string;
      kind: string;
    },
    offerId: string | null,
  ) {
    return {
      version: 1 as const,
      purchasedAt: new Date().toISOString(),
      offer: {
        id: offerId,
        title: "Direct commercial fixture",
      },
      membershipTemplate: {
        sourceMembershipId: plan.id,
        name: plan.name,
        kind: plan.kind,
        durationDays: 30,
        sessionsCount: 6,
        walletBonus: 0,
        productRewards: null,
      },
      commercial: {
        currency: "EGP" as const,
        originalPrice: 600,
        finalPrice: 500,
      },
      eligibilitySnapshot: JSON.parse(
        eligibilitySnapshot,
      ) as Record<string, unknown>,
      economics: {
        // Identity fixture only, not an earned
        // or verified commission.
        commissionSnapshot: JSON.stringify({ version: 1 }),
        attributionMode:
          "direct_commercial" as const,
      },
    };
  }

  it("rejects malformed commission economics before creating a pending purchase", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan } =
        await createCatalogFixture(tx);

      const now = new Date();
      const snapshot = makeSnapshot(plan, null);

      snapshot.economics.commissionSnapshot = "{}";

      await expect(
        prepareDirectCommercialCheckoutTx(tx, {
          userId: user.id,
          kind: "package",
          offerId: null,
          catalogMembershipId: plan.id,
          snapshot,
          startDate: now,
          selectedScheduleIds: [],
          serverNow: now,
        }),
      ).rejects.toThrow(
        "Unsupported or missing commissionSnapshot version",
      );

      expect(
        await tx.offerBoxPurchase.count({
          where: { userId: user.id },
        }),
      ).toBe(0);

      expect(
        await tx.paymentTransaction.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });
  }, 30000);

  it("creates a pending package without membership or entitlement and freezes the selected dates", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan } =
        await createCatalogFixture(tx);

      const now = new Date();
      const startDate = new Date(
        now.getTime() + 3 * DAY,
      );

      const result =
        await prepareDirectCommercialCheckoutTx(
          tx,
          {
            userId: user.id,
            kind: "package",
            offerId: null,
            catalogMembershipId: plan.id,
            snapshot: makeSnapshot(plan, null),
            startDate,
            selectedScheduleIds: [
              "schedule-fixture-1",
              "schedule-fixture-2",
            ],
            serverNow: now,
          },
        );

      const purchase =
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: result.purchaseId },
          include: { entitlement: true },
        });

      expect(purchase).toMatchObject({
        userId: user.id,
        commercialKind: "package",
        offerId: null,
        catalogMembershipId: plan.id,
        status: "pending_payment",
        paymentTransactionId: null,
        redeemedUserMembershipId: null,
        priceSnapshot: 500,
        currency: "EGP",
        paidAt: null,
        entitlement: null,
      });

      expect(purchase.holdExpiresAt?.getTime())
        .toBe(now.getTime() + 60 * 60 * 1000);

      expect(
        JSON.parse(purchase.offerSnapshot)
          .directActivation,
      ).toEqual({
        version: 1,
        startDate: startDate.toISOString(),
        endDate: result.endDate.toISOString(),
        selectedScheduleIds: [
          "schedule-fixture-1",
          "schedule-fixture-2",
        ],
      });

      expect(
        await tx.userMembership.count({
          where: { userId: user.id },
        }),
      ).toBe(0);

      expect(
        await tx.booking.count({
          where: { userId: user.id },
        }),
      ).toBe(0);

      expect(
        await tx.paymentTransaction.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });
  }, 30000);

  it("rejects a duplicate pending package without creating another purchase", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan } =
        await createCatalogFixture(tx);

      const now = new Date();

      const input = {
        userId: user.id,
        kind: "package" as const,
        offerId: null,
        catalogMembershipId: plan.id,
        snapshot: makeSnapshot(plan, null),
        startDate: now,
        selectedScheduleIds: [],
        serverNow: now,
      };

      const first =
        await prepareDirectCommercialCheckoutTx(
          tx,
          input,
        );

      await expect(
        prepareDirectCommercialCheckoutTx(
          tx,
          input,
        ),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PENDING_ALREADY_EXISTS",
      );

      expect(
        await tx.offerBoxPurchase.count({
          where: { userId: user.id },
        }),
      ).toBe(1);

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: first.purchaseId },
        }),
      ).toMatchObject({
        status: "pending_payment",
        holdExpiresAt: first.holdExpiresAt,
      });
    });
  }, 30000);

  it("reserves shared offer capacity without creating a membership", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan, offer } =
        await createCatalogFixture(tx);

      await tx.offer.update({
        where: { id: offer.id },
        data: {
          type: "special",
          maxSubscribers: 3,
          currentSubscribers: 1,
          offerBoxReservedCount: 1,
        },
      });

      const now = new Date();

      const result =
        await prepareDirectCommercialCheckoutTx(
          tx,
          {
            userId: user.id,
            kind: "direct_offer",
            offerId: offer.id,
            catalogMembershipId: plan.id,
            snapshot: makeSnapshot(plan, offer.id),
            startDate: now,
            selectedScheduleIds: [],
            serverNow: now,
          },
        );

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: result.purchaseId },
        }),
      ).toMatchObject({
        commercialKind: "direct_offer",
        offerId: offer.id,
        catalogMembershipId: plan.id,
        status: "pending_payment",
        paidAt: null,
        redeemedUserMembershipId: null,
      });

      expect(
        await tx.offer.findUniqueOrThrow({
          where: { id: offer.id },
        }),
      ).toMatchObject({
        currentSubscribers: 1,
        offerBoxReservedCount: 2,
      });

      expect(
        await tx.userMembership.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });
  }, 30000);

  it("blocks a sold-out direct offer without changing capacity or creating a purchase", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan, offer } =
        await createCatalogFixture(tx);

      const fullOffer = await tx.offer.update({
        where: { id: offer.id },
        data: {
          type: "special",
          maxSubscribers: 2,
          currentSubscribers: 1,
          offerBoxReservedCount: 1,
        },
      });

      const now = new Date();

      await expect(
        prepareDirectCommercialCheckoutTx(
          tx,
          {
            userId: user.id,
            kind: "direct_offer",
            offerId: offer.id,
            catalogMembershipId: plan.id,
            snapshot: makeSnapshot(plan, offer.id),
            startDate: now,
            selectedScheduleIds: [],
            serverNow: now,
          },
        ),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_OFFER_UNAVAILABLE",
      );

      expect(
        await tx.offerBoxPurchase.count({
          where: { userId: user.id },
        }),
      ).toBe(0);

      expect(
        await tx.offer.findUniqueOrThrow({
          where: { id: offer.id },
        }),
      ).toEqual(fullOffer);
    });
  }, 30000);

  it("rejects inconsistent frozen catalog identity before purchase creation", async () => {
    await rollbackTest(async (tx) => {
      const { user, plan } =
        await createCatalogFixture(tx);

      const now = new Date();

      const snapshot = makeSnapshot(plan, null);

      snapshot.membershipTemplate.sourceMembershipId =
        "different-catalog";

      await expect(
        prepareDirectCommercialCheckoutTx(
          tx,
          {
            userId: user.id,
            kind: "package",
            offerId: null,
            catalogMembershipId: plan.id,
            snapshot,
            startDate: now,
            selectedScheduleIds: [],
            serverNow: now,
          },
        ),
      ).rejects.toThrow(
        "INVALID_DIRECT_COMMERCIAL_SNAPSHOT",
      );

      expect(
        await tx.offerBoxPurchase.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });
  }, 30000);
});

describe("direct commercial payment binding", () => {
  async function fixture(
    tx: Prisma.TransactionClient,
  ) {
    const { user, plan } =
      await createCatalogFixture(tx);

    const now = new Date();

    const prepared =
      await prepareDirectCommercialCheckoutTx(
        tx,
        {
          userId: user.id,
          kind: "package",
          offerId: null,
          catalogMembershipId: plan.id,
          serverNow: now,
          startDate: now,
          selectedScheduleIds: [],
          snapshot: {
            version: 1,
            purchasedAt: now.toISOString(),
            offer: {
              id: null,
              title: "Payment binding fixture",
            },
            membershipTemplate: {
              sourceMembershipId: plan.id,
              name: plan.name,
              kind: "package",
              durationDays: 30,
              sessionsCount: 6,
              walletBonus: 0,
              productRewards: null,
            },
            commercial: {
              currency: "EGP",
              originalPrice: 600,
              finalPrice: 500,
            },
            eligibilitySnapshot: JSON.parse(
              eligibilitySnapshot,
            ),
            economics: {
              commissionSnapshot: JSON.stringify({ version: 1 }),
              attributionMode: "direct_commercial",
            },
          },
        },
      );

    const purchase =
      await tx.offerBoxPurchase.findUniqueOrThrow({
        where: { id: prepared.purchaseId },
      });

    const paymentData = {
      userId: user.id,
      purpose: "offer_box",
      businessUnit: "club",
      provider: "paymob",
      amount: 500,
      currency: "EGP",
      status: "pending",
      paymentMethod: "card",
      expiresAt: prepared.holdExpiresAt,
      metadata: JSON.stringify({
        offerBoxPurchaseId: purchase.id,
        commercialKind: "package",
        catalogMembershipId: plan.id,
      }),
    };

    const payment =
      await tx.paymentTransaction.create({
        data: paymentData,
      });

    return {
      user,
      plan,
      purchase,
      payment,
      paymentData,
      input: {
        userId: user.id,
        purchaseId: purchase.id,
        transactionId: payment.id,
        serverNow: now,
      },
    };
  }

  async function withProviderFixture(
    execute: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
  ) {
    const f = await db.$transaction(async (tx) => {
      const prepared = await fixture(tx);

      await tx.paymentTransaction.delete({
        where: { id: prepared.payment.id },
      });

      return prepared;
    });

    try {
      await execute(f);
    } finally {
      await db.$transaction(async (tx) => {
        await tx.offerBoxPurchase.deleteMany({
          where: { userId: f.user.id },
        });

        await tx.paymentTransaction.deleteMany({
          where: { userId: f.user.id },
        });

        await tx.offer.deleteMany({
          where: { membershipId: f.plan.id },
        });

        await tx.membership.delete({
          where: { id: f.plan.id },
        });

        await tx.user.delete({
          where: { id: f.user.id },
        });
      });
    }
  }

  function providerFixtureResult(
    holdExpiresAt: Date,
    suffix: string,
  ) {
    return {
      provider: "paymob" as const,
      status: "pending" as const,
      checkoutUrl: `https://accept.paymob.com/unifiedcheckout/?fixture=${suffix}`,
      providerReference: `pi_fixture_${suffix}`,
      expiresAt: new Date(
        holdExpiresAt.getTime() - 1000,
      ),
      payload: {
        providerMode: "paymob_unified_checkout",
        intentionId: `pi_fixture_${suffix}`,
        intentionOrderId: "1234567",
      },
    };
  }

  it("direct paid reconciliation requires central proof and does not activate an unverified purchase", async () => {
    await withProviderFixture(async (f) => {
      const created = await db.$transaction((tx) =>
        createDirectCommercialPaymentTx(tx, {
          userId: f.user.id,
          purchaseId: f.purchase.id,
          serverNow: new Date(),
        }),
      );

      const before =
        await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        });

      await db.paymentTransaction.update({
        where: { id: created.transactionId },
        data: {
          status: "paid",
          paidAt: new Date(),
        },
      });

      await expect(
        reconcilePaidOfferBoxPurchase({
          purchaseId: f.purchase.id,
          transactionId: created.transactionId,
          paidAt: new Date(),
          paymobOrderPaidVerified: false,
        }),
      ).rejects.toThrow(
        "OFFER_BOX_PAYMOB_PAID_PROOF_REQUIRED",
      );

      expect(
        await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(before);

      expect(
        await db.offerBoxEntitlement.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);
    });
  }, 60000);

  it("direct paid reconciliation accepts central verification and preserves frozen activation terms on replay", async () => {
    await withProviderFixture(async (f) => {
      const created = await db.$transaction((tx) =>
        createDirectCommercialPaymentTx(tx, {
          userId: f.user.id,
          purchaseId: f.purchase.id,
          serverNow: new Date(),
        }),
      );

      const spy = vi.spyOn(
        paymobPaymentProvider,
        "verifyTransaction",
      ).mockImplementation(async () => ({
        status: "paid",
      }));

      try {
        await expect(
          updatePaymentTransactionStatus(
            created.transactionId,
            "paid",
          ),
        ).rejects.toThrow();

        const paid =
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          });

        expect(paid).toMatchObject({
          status: "paid_activation_pending",
          paymentTransactionId: created.transactionId,
          redeemedAt: null,
          redeemedUserMembershipId: null,
          offerSnapshot: f.purchase.offerSnapshot,
          priceSnapshot: 500,
          holdExpiresAt: f.purchase.holdExpiresAt,
        });

        expect(paid.paidAt).toBeInstanceOf(Date);

        await expect(
          updatePaymentTransactionStatus(
            created.transactionId,
            "paid",
          ),
        ).rejects.toThrow();

        expect(
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          }),
        ).toEqual(paid);

        expect(spy).toHaveBeenCalledTimes(2);

        expect(
          await db.offerBoxEntitlement.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        expect(
          await db.userMembership.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        expect(
          await db.booking.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        expect(
          await db.staffCommission.count({
            where: {
              offerBoxPurchaseId: f.purchase.id,
            },
          }),
        ).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  }, 60000);

  it("direct paid reconciliation rejects a wrong frozen payment amount", async () => {
    await withProviderFixture(async (f) => {
      const created = await db.$transaction((tx) =>
        createDirectCommercialPaymentTx(tx, {
          userId: f.user.id,
          purchaseId: f.purchase.id,
          serverNow: new Date(),
        }),
      );

      await db.paymentTransaction.update({
        where: { id: created.transactionId },
        data: {
          status: "paid",
          paidAt: new Date(),
          amount: 499,
        },
      });

      const before =
        await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        });

      await expect(
        reconcilePaidOfferBoxPurchase({
          purchaseId: f.purchase.id,
          transactionId: created.transactionId,
          paidAt: new Date(),
          paymobOrderPaidVerified: true,
        }),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PAID_PAYMENT_MISMATCH",
      );

      expect(
        await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(before);
    });
  }, 60000);

  it("direct paid reconciliation retains a late confirmed collection for review without activation", async () => {
    await withProviderFixture(async (f) => {
      const created = await db.$transaction((tx) =>
        createDirectCommercialPaymentTx(tx, {
          userId: f.user.id,
          purchaseId: f.purchase.id,
          serverNow: new Date(),
        }),
      );

      const expired = new Date(Date.now() - 1000);

      await db.offerBoxPurchase.update({
        where: { id: f.purchase.id },
        data: { holdExpiresAt: expired },
      });

      await db.paymentTransaction.update({
        where: { id: created.transactionId },
        data: {
          expiresAt: expired,
          status: "paid",
          paidAt: new Date(),
        },
      });

      const proof = {
        purchaseId: f.purchase.id,
        transactionId: created.transactionId,
        paidAt: new Date(),
        paymobOrderPaidVerified: true,
      };

      const first =
        await reconcilePaidOfferBoxPurchase(proof);

      expect(first).toEqual({
        alreadyReconciled: false,
        status: "paid_review",
      });

      const reviewed =
        await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        });

      expect(reviewed).toMatchObject({
        status: "paid_review",
        holdExpiresAt: expired,
        redeemedAt: null,
        redeemedUserMembershipId: null,
        priceSnapshot: 500,
      });

      expect(reviewed.paidAt).toBeInstanceOf(Date);

      expect(
        await reconcilePaidOfferBoxPurchase(proof),
      ).toEqual({
        alreadyReconciled: true,
        status: "paid_review",
      });

      expect(
        await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(reviewed);

      expect(
        await db.offerBoxEntitlement.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);

      expect(
        await db.userMembership.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);
    });
  }, 60000);

  it("provider initialization concurrent callers create one local payment and one checkout", async () => {
    await withProviderFixture(async (f) => {
      let releaseProvider!: () => void;
      let providerEntered!: () => void;

      const entered = new Promise<void>((resolve) => {
        providerEntered = resolve;
      });

      const gate = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });

      const spy = vi.spyOn(
        paymobPaymentProvider,
        "createCheckout",
      ).mockImplementation(async (input) => {
        providerEntered();
        await gate;

        expect(input.purpose).toBe("offer_box");
        expect(input.customer.id).toBe(f.user.id);
        expect(input.amount).toBe(500);

        expect(input.membershipHoldExpiresAt).toEqual(
          f.purchase.holdExpiresAt,
        );

        const local =
          await db.paymentTransaction.findUniqueOrThrow({
            where: { id: input.transactionId },
          });

        const owner =
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          });

        expect(owner.paymentTransactionId).toBe(local.id);
        expect(local.status).toBe("pending");
        expect(local.referenceCode).toMatch(/^FZ-Packg-/);

        expect(JSON.parse(local.metadata!)
          .directCommercialProviderInitialization.state)
          .toBe("started");

        return providerFixtureResult(
          f.purchase.holdExpiresAt!,
          f.purchase.id,
        );
      });

      const input = {
        userId: f.user.id,
        purchaseId: f.purchase.id,
      };

      try {
        const first = initializeDirectCommercialPayment(input);

        try {
          await Promise.race([
            entered,
            first.then(() => {
              throw new Error("PROVIDER_GATE_NOT_ENTERED");
            }),
          ]);

          await expect(
            initializeDirectCommercialPayment(input),
          ).rejects.toThrow(
            "DIRECT_COMMERCIAL_PROVIDER_RECONCILIATION_REQUIRED",
          );

          expect(spy).toHaveBeenCalledTimes(1);
        } finally {
          releaseProvider();
        }

        const result = await first;

        const replay =
          await initializeDirectCommercialPayment(input);

        expect(replay.id).toBe(result.id);
        expect(replay.checkoutUrl).toBe(result.checkoutUrl);
        expect(replay.referenceCode).toBe(result.referenceCode);
        expect(spy).toHaveBeenCalledTimes(1);

        const payments =
          await db.paymentTransaction.findMany({
            where: { userId: f.user.id },
          });

        expect(payments).toHaveLength(1);

        expect(payments[0]).toMatchObject({
          id: result.id,
          status: "pending",
          paidAt: null,
          expiresAt: f.purchase.holdExpiresAt,
        });

        expect(JSON.parse(payments[0].metadata!)
          .directCommercialProviderInitialization.state)
          .toBe("ready");

        expect(
          await db.userMembership.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        expect(
          await db.offerBoxEntitlement.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        expect(
          await db.booking.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  }, 60000);

  it("provider initialization ambiguous failure keeps the claim and blocks another provider request", async () => {
    await withProviderFixture(async (f) => {
      const spy = vi.spyOn(
        paymobPaymentProvider,
        "createCheckout",
      ).mockRejectedValue(
        new Error("SIMULATED_AMBIGUOUS_PROVIDER_FAILURE"),
      );

      const input = {
        userId: f.user.id,
        purchaseId: f.purchase.id,
      };

      try {
        await expect(
          initializeDirectCommercialPayment(input),
        ).rejects.toThrow(
          "SIMULATED_AMBIGUOUS_PROVIDER_FAILURE",
        );

        const purchase =
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          });

        expect(purchase.paymentTransactionId).not.toBeNull();

        const payment =
          await db.paymentTransaction.findUniqueOrThrow({
            where: { id: purchase.paymentTransactionId! },
          });

        expect(payment).toMatchObject({
          status: "pending",
          paidAt: null,
          checkoutUrl: null,
          providerReference: null,
          expiresAt: f.purchase.holdExpiresAt,
        });

        expect(JSON.parse(payment.metadata!)
          .directCommercialProviderInitialization.state)
          .toBe("started");

        await expect(
          initializeDirectCommercialPayment(input),
        ).rejects.toThrow(
          "DIRECT_COMMERCIAL_PROVIDER_RECONCILIATION_REQUIRED",
        );

        expect(spy).toHaveBeenCalledTimes(1);

        expect(
          await db.paymentTransaction.count({
            where: { userId: f.user.id },
          }),
        ).toBe(1);

        expect(
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: purchase.id },
          }),
        ).toEqual(purchase);
      } finally {
        spy.mockRestore();
      }
    });
  }, 60000);

  it("provider initialization never overwrites a newer simulated paid settlement", async () => {
    await withProviderFixture(async (f) => {
      const simulatedPaidAt = new Date();

      const spy = vi.spyOn(
        paymobPaymentProvider,
        "createCheckout",
      ).mockImplementation(async (input) => {
        // Race fixture only. This is not Paymob proof.
        await db.paymentTransaction.update({
          where: { id: input.transactionId },
          data: {
            status: "paid",
            paidAt: simulatedPaidAt,
            providerReference:
              `pi_settlement_${f.purchase.id}`,
          },
        });

        return providerFixtureResult(
          f.purchase.holdExpiresAt!,
          f.purchase.id,
        );
      });

      try {
        await expect(
          initializeDirectCommercialPayment({
            userId: f.user.id,
            purchaseId: f.purchase.id,
          }),
        ).rejects.toThrow(
          "DIRECT_COMMERCIAL_PROVIDER_RECONCILIATION_REQUIRED",
        );

        const purchase =
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          });

        const payment =
          await db.paymentTransaction.findUniqueOrThrow({
            where: { id: purchase.paymentTransactionId! },
          });

        expect(payment).toMatchObject({
          status: "paid",
          paidAt: simulatedPaidAt,
          providerReference:
            `pi_settlement_${f.purchase.id}`,
          checkoutUrl: null,
        });

        expect(spy).toHaveBeenCalledTimes(1);

        expect(
          await db.offerBoxEntitlement.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        expect(
          await db.userMembership.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  }, 60000);

  for (const providerStarted of [false, true]) {
    it(`direct hold lifecycle providerStarted=${providerStarted}`, async () => {
      await rollbackTest(async (tx) => {
        const f = await fixture(tx);

        await tx.paymentTransaction.delete({
          where: { id: f.payment.id },
        });

        const now = new Date();

        const created =
          await createDirectCommercialPaymentTx(tx, {
            userId: f.user.id,
            purchaseId: f.purchase.id,
            serverNow: now,
          });

        const purchase =
          await tx.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          });

        const payment =
          await tx.paymentTransaction.findUniqueOrThrow({
            where: { id: created.transactionId },
          });

        const trainer = await tx.trainer.create({
          data: {
            name: "Hold release fixture",
            specialty: "fitness",
            bio: "Integration fixture",
            isActive: true,
          },
        });

        const gymClass = await tx.class.create({
          data: {
            name: "Hold release fixture",
            trainerId: trainer.id,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
            isActive: true,
          },
        });

        const schedule = await tx.schedule.create({
          data: {
            classId: gymClass.id,
            date: new Date(now.getTime() + DAY * 2),
            time: "12:00",
            availableSpots: 9,
            isActive: true,
          },
        });

        const right =
          await tx.offerBoxEntitlement.create({
            data: {
              userId: f.user.id,
              purchaseId: purchase.id,
              status: "pending_payment",
              startDate: now,
              endDate: new Date(now.getTime() + DAY * 7),
              totalSessions: 1,
              eligibilitySnapshot,
            },
          });

        const booking = await tx.booking.create({
          data: {
            userId: f.user.id,
            scheduleId: schedule.id,
            offerBoxEntitlementId: right.id,
            userMembershipId: null,
            status: "confirmed",
            paymentMethod: "offer_box",
            paidAmount: 0,
            entitlementUnits: 1,
          },
        });

        const beforeExpiry =
          await releaseUnstartedDirectCommercialHoldTx(
            tx,
            {
              purchaseId: purchase.id,
              transactionId: payment.id,
              now,
            },
          );

        expect(beforeExpiry.released).toBe(false);

        if (providerStarted) {
          await tx.paymentTransaction.update({
            where: { id: payment.id },
            data: {
              status: "expired",
              metadata: JSON.stringify({
                ...JSON.parse(payment.metadata!),
                directCommercialProviderInitialization: {
                  version: 1,
                  state: "started",
                  transactionId: payment.id,
                  startedAt: now.toISOString(),
                },
              }),
            },
          });
        }

        const expiryInput = {
          purchaseId: purchase.id,
          transactionId: payment.id,
          now: new Date(
            purchase.holdExpiresAt!.getTime() + 1,
          ),
        };

        const result =
          await releaseUnstartedDirectCommercialHoldTx(
            tx,
            expiryInput,
          );

        if (providerStarted) {

          expect(result).toEqual({
            released: false,
            reason: "provider_reconciliation_required",
          });

          expect(
            await tx.offerBoxPurchase.findUniqueOrThrow({
              where: { id: purchase.id },
            }),
          ).toEqual(purchase);

          expect(
            await tx.offerBoxEntitlement.findUniqueOrThrow({
              where: { id: right.id },
            }),
          ).toEqual(right);

          expect(
            await tx.booking.findUniqueOrThrow({
              where: { id: booking.id },
            }),
          ).toEqual(booking);

          expect(
            await tx.schedule.findUniqueOrThrow({
              where: { id: schedule.id },
            }),
          ).toEqual(schedule);

          return;
        }

        expect(result).toEqual({
          released: true,
          reason: "payment_expired",
        });

        expect(
          await tx.offerBoxPurchase.findUniqueOrThrow({
            where: { id: purchase.id },
          }),
        ).toMatchObject({
          status: "cancelled",
          paidAt: null,
          holdExpiresAt: purchase.holdExpiresAt,
        });

        expect(
          await tx.paymentTransaction.findUniqueOrThrow({
            where: { id: payment.id },
          }),
        ).toMatchObject({
          status: "expired",
          paidAt: null,
        });

        expect(
          await tx.offerBoxEntitlement.findUniqueOrThrow({
            where: { id: right.id },
          }),
        ).toMatchObject({
          status: "cancelled",
        });

        expect(
          await tx.booking.findUniqueOrThrow({
            where: { id: booking.id },
          }),
        ).toMatchObject({
          status: "cancelled",
        });

        expect(
          await tx.schedule.findUniqueOrThrow({
            where: { id: schedule.id },
          }),
        ).toMatchObject({
          availableSpots: 10,
        });

        expect(
          await releaseUnstartedDirectCommercialHoldTx(
            tx,
            expiryInput,
          ),
        ).toEqual({
          released: false,
          reason: "purchase_not_pending",
        });

        expect(
          await tx.schedule.findUniqueOrThrow({
            where: { id: schedule.id },
          }),
        ).toMatchObject({
          availableSpots: 10,
        });

        expect(
          await tx.userMembership.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        expect(
          await tx.journal.count({
            where: {
              referenceType: "OfferBoxPurchase",
              referenceId: purchase.id,
            },
          }),
        ).toBe(0);
      });
    }, 30000);
  }

  it("commercial final recovery retains a provider-started unpaid hold and records late paid review", async () => {
    await withProviderFixture(async (f) => {
      const created =
        await db.$transaction((tx) =>
          createDirectCommercialPaymentTx(tx, {
            userId: f.user.id,
            purchaseId: f.purchase.id,
            serverNow: new Date(),
          }),
        );

      const payment =
        await db.paymentTransaction.findUniqueOrThrow({
          where: { id: created.transactionId },
        });

      const expired = new Date(Date.now() - 1000);

      await db.offerBoxPurchase.update({
        where: { id: f.purchase.id },
        data: { holdExpiresAt: expired },
      });

      await db.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          expiresAt: expired,
          metadata: JSON.stringify({
            ...JSON.parse(payment.metadata!),
            directCommercialProviderInitialization: {
              version: 1,
              state: "started",
              transactionId: payment.id,
              startedAt: expired.toISOString(),
            },
          }),
        },
      });

      const verifySpy = vi.spyOn(
        paymobPaymentProvider,
        "verifyTransaction",
      ).mockResolvedValue({
        status: "pending",
      });

      try {
        expect(
          await reconcileDirectCommercialHold(f.purchase.id),
        ).toBe("review_required");

        expect(
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          }),
        ).toMatchObject({
          status: "pending_payment",
          paidAt: null,
        });

        // A failed individual attempt is not terminal.
        await updatePaymentTransactionStatus(
          payment.id,
          "failed",
        );

        expect(
          await db.paymentTransaction.findUniqueOrThrow({
            where: { id: payment.id },
          }),
        ).toMatchObject({
          status: "pending",
          paidAt: null,
        });

        verifySpy.mockResolvedValue({
          status: "paid",
        });

        expect(
          await reconcileDirectCommercialHold(f.purchase.id),
        ).toBe("paid_review");

        const paid =
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          });

        expect(paid.status).toBe("paid_review");
        expect(paid.paidAt).toBeInstanceOf(Date);

        expect(
          await db.offerBoxEntitlement.count({
            where: { purchaseId: paid.id },
          }),
        ).toBe(0);

        expect(
          await db.userMembership.count({
            where: { userId: f.user.id },
          }),
        ).toBe(0);

        const confirmed =
          await db.paymentTransaction.findUniqueOrThrow({
            where: { id: payment.id },
          });

        const collection =
          readOfferBoxCollection(paid, confirmed.userId === paid.userId ? { ...confirmed, userId: confirmed.userId } : null);

        expect(collection.confirmedPaidAmount)
          .toBe(500);

        expect(collection.needsFinancialReview)
          .toBe(true);

        expect(collection.paidAt).not.toBeNull();
      } finally {
        verifySpy.mockRestore();
      }
    });
  }, 60000);

  it("commercial final recovery releases an unstarted expired purchase without calling Paymob", async () => {
    await withProviderFixture(async (f) => {
      const created =
        await db.$transaction((tx) =>
          createDirectCommercialPaymentTx(tx, {
            userId: f.user.id,
            purchaseId: f.purchase.id,
            serverNow: new Date(),
          }),
        );

      const expired = new Date(Date.now() - 1000);

      await db.offerBoxPurchase.update({
        where: { id: f.purchase.id },
        data: { holdExpiresAt: expired },
      });

      await db.paymentTransaction.update({
        where: { id: created.transactionId },
        data: { expiresAt: expired },
      });

      const verifySpy = vi.spyOn(
        paymobPaymentProvider,
        "verifyTransaction",
      );

      try {
        expect(
          await reconcileDirectCommercialHold(f.purchase.id),
        ).toBe("released");

        expect(verifySpy).not.toHaveBeenCalled();

        expect(
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: f.purchase.id },
          }),
        ).toMatchObject({
          status: "cancelled",
          paidAt: null,
        });

        expect(
          await reconcileDirectCommercialHold(f.purchase.id),
        ).toBe("not_applicable");

        expect(verifySpy).not.toHaveBeenCalled();
      } finally {
        verifySpy.mockRestore();
      }
    });
  }, 60000);

  it("commercial economic ownership restores unstarted wallet points and discount exactly once", async () => {
    await rollbackTest(async tx => {
      const {user,plan}=await createCatalogFixture(tx);
      const now=new Date();
      await tx.wallet.create({data:{userId:user.id,balance:100,referralBalance:20}});
      await tx.rewardPoints.create({data:{userId:user.id,points:50}});
      const code=await tx.discountCode.create({data:{code:`ECON-${plan.id}`,type:"fixed",value:50,maxUses:1,scope:"subscriptions",isActive:true}});
      const pending=await prepareDirectCommercialCheckoutTx(tx,{
        userId:user.id,kind:"package",offerId:null,catalogMembershipId:plan.id,startDate:now,selectedScheduleIds:[],serverNow:now,
        snapshot:{version:1,purchasedAt:now.toISOString(),offer:{id:null,title:plan.name},membershipTemplate:{sourceMembershipId:plan.id,name:plan.name,kind:"package",durationDays:30,sessionsCount:6,walletBonus:0,productRewards:null},commercial:{currency:"EGP",originalPrice:600,finalPrice:500},eligibilitySnapshot:JSON.parse(eligibilitySnapshot),economics:{commissionSnapshot:JSON.stringify({version:1}),attributionMode:"direct_commercial"},directConsideration:{version:1,totalMinor:55000,externalMinor:50000,walletMinor:4000,pointsMinor:1000,pointsCount:10,discount:{codeId:code.id,amountMinor:5000,beforeDiscountMinor:60000}}},
      });
      const p=await createDirectCommercialPaymentTx(tx,{userId:user.id,purchaseId:pending.purchaseId,serverNow:now});
      await reserveDirectCommercialEconomicsTx(tx,pending.purchaseId,p.transactionId);
      expect(await tx.wallet.findUniqueOrThrow({where:{userId:user.id}})).toMatchObject({balance:60,referralBalance:20});
      expect(await tx.rewardPoints.findUniqueOrThrow({where:{userId:user.id}})).toMatchObject({points:40});
      const args={purchaseId:pending.purchaseId,transactionId:p.transactionId,now:new Date(pending.holdExpiresAt.getTime()+1)};
      expect(await releaseUnstartedDirectCommercialHoldTx(tx,args)).toMatchObject({released:true});
      expect(await releaseUnstartedDirectCommercialHoldTx(tx,args)).toMatchObject({released:false});
      expect(await tx.wallet.findUniqueOrThrow({where:{userId:user.id}})).toMatchObject({balance:100,referralBalance:20});
      expect(await tx.rewardPoints.findUniqueOrThrow({where:{userId:user.id}})).toMatchObject({points:50});
      expect(await tx.discountCodeUsage.count({where:{id:pending.purchaseId}})).toBe(0);
      expect((await tx.discountCode.findUniqueOrThrow({where:{id:code.id}})).usedCount).toBe(0);
      const payment=await tx.paymentTransaction.findUniqueOrThrow({where:{id:p.transactionId}});
      expect(JSON.parse(payment.metadata!).directCommercialEconomics.state).toBe("restored");
      expect(await tx.journal.count({where:{referenceType:"OfferBoxPurchase",referenceId:pending.purchaseId}})).toBe(0);
    });
  },60000);

  it("atomic creation creates one bound payment and reuses it without extending the hold", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      // The existing fixture creates an unbound
      // payment for binding tests. Remove only
      // this new fixture payment before testing
      // the real creation service.
      await tx.paymentTransaction.delete({
        where: { id: f.payment.id },
      });

      const input = {
        userId: f.user.id,
        purchaseId: f.purchase.id,
        serverNow: f.input.serverNow,
      };

      const created =
        await createDirectCommercialPaymentTx(
          tx,
          input,
        );

      expect(created.created).toBe(true);

      const purchase =
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
          include: { entitlement: true },
        });

      const payment =
        await tx.paymentTransaction.findUniqueOrThrow({
          where: { id: created.transactionId },
        });

      expect(purchase).toMatchObject({
        paymentTransactionId: payment.id,
        status: "pending_payment",
        paidAt: null,
        entitlement: null,
        redeemedUserMembershipId: null,
        holdExpiresAt: f.purchase.holdExpiresAt,
        priceSnapshot: 500,
      });

      expect(payment).toMatchObject({
        userId: f.user.id,
        purpose: "offer_box",
        provider: "paymob",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "pending",
        membershipId: null,
        orderId: null,
        offerId: null,
        paidAt: null,
        checkoutUrl: null,
        expiresAt: f.purchase.holdExpiresAt,
      });

      expect(JSON.parse(payment.metadata!))
        .toMatchObject({
          offerBoxPurchaseId: purchase.id,
          commercialKind: "package",
          catalogMembershipId: f.plan.id,
          offerBoxSnapshotVersion: 1,
        });

      const replay =
        await createDirectCommercialPaymentTx(
          tx,
          {
            ...input,
            serverNow: new Date(
              input.serverNow.getTime() + 1000,
            ),
          },
        );

      expect(replay).toEqual({
        ...created,
        created: false,
      });

      expect(
        await tx.paymentTransaction.count({
          where: { userId: f.user.id },
        }),
      ).toBe(1);

      expect(
        await tx.paymentTransaction.findUniqueOrThrow({
          where: { id: payment.id },
        }),
      ).toEqual(payment);

      expect(
        await tx.userMembership.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);

      expect(
        await tx.booking.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);

      expect(
        await tx.staffCommission.count({
          where: {
            offerBoxPurchaseId: purchase.id,
          },
        }),
      ).toBe(0);
    });
  }, 30000);

  it("atomic creation refuses an expired purchase without creating another payment", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      await tx.paymentTransaction.delete({
        where: { id: f.payment.id },
      });

      await expect(
        createDirectCommercialPaymentTx(
          tx,
          {
            userId: f.user.id,
            purchaseId: f.purchase.id,
            serverNow: new Date(
              f.purchase.holdExpiresAt!.getTime() + 1,
            ),
          },
        ),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_HOLD_EXPIRED",
      );

      expect(
        await tx.paymentTransaction.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(f.purchase);
    });
  }, 30000);

  it("atomic creation refuses an inconsistent bound payment without creating a replacement", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      await bindDirectCommercialPaymentTx(
        tx,
        f.input,
      );

      await tx.paymentTransaction.update({
        where: { id: f.payment.id },
        data: {
          amount: 499,
        },
      });

      const before =
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        });

      await expect(
        createDirectCommercialPaymentTx(
          tx,
          {
            userId: f.user.id,
            purchaseId: f.purchase.id,
            serverNow: f.input.serverNow,
          },
        ),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PAYMENT_AMOUNT_MISMATCH",
      );

      expect(
        await tx.paymentTransaction.count({
          where: { userId: f.user.id },
        }),
      ).toBe(1);

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(before);
    });
  }, 30000);

  it("binds once and replays without payment or entitlement mutation", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      const first =
        await bindDirectCommercialPaymentTx(
          tx,
          f.input,
        );

      expect(first).toEqual({
        purchaseId: f.purchase.id,
        transactionId: f.payment.id,
        alreadyBound: false,
      });

      const replay =
        await bindDirectCommercialPaymentTx(
          tx,
          f.input,
        );

      expect(replay.alreadyBound).toBe(true);

      const loaded =
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
          include: { entitlement: true },
        });

      expect(loaded).toMatchObject({
        paymentTransactionId: f.payment.id,
        status: "pending_payment",
        paidAt: null,
        redeemedAt: null,
        redeemedUserMembershipId: null,
        holdExpiresAt: f.purchase.holdExpiresAt,
        offerSnapshot: f.purchase.offerSnapshot,
        priceSnapshot: 500,
        entitlement: null,
      });

      expect(
        await tx.paymentTransaction.findUniqueOrThrow({
          where: { id: f.payment.id },
        }),
      ).toEqual(f.payment);

      expect(
        await tx.userMembership.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);

      expect(
        await tx.booking.count({
          where: { userId: f.user.id },
        }),
      ).toBe(0);

      expect(
        await tx.staffCommission.count({
          where: { offerBoxPurchaseId: f.purchase.id },
        }),
      ).toBe(0);
    });
  }, 30000);

  it("rejects a different payment amount", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      await tx.paymentTransaction.update({
        where: { id: f.payment.id },
        data: { amount: 499 },
      });

      await expect(
        bindDirectCommercialPaymentTx(tx, f.input),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PAYMENT_AMOUNT_MISMATCH",
      );

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(f.purchase);
    });
  }, 30000);

  it("rejects another customer payment", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);
      const other = await createCatalogFixture(tx);

      await tx.paymentTransaction.update({
        where: { id: f.payment.id },
        data: { userId: other.user.id },
      });

      await expect(
        bindDirectCommercialPaymentTx(tx, f.input),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PAYMENT_IDENTITY_MISMATCH",
      );

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(f.purchase);
    });
  }, 30000);

  it("rejects incorrect purchase metadata", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      await tx.paymentTransaction.update({
        where: { id: f.payment.id },
        data: {
          metadata: JSON.stringify({
            offerBoxPurchaseId: "different-purchase",
            commercialKind: "package",
            catalogMembershipId: f.plan.id,
          }),
        },
      });

      await expect(
        bindDirectCommercialPaymentTx(tx, f.input),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PAYMENT_SOURCE_MISMATCH",
      );

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(f.purchase);
    });
  }, 30000);

  it("does not replace an already bound transaction", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      await bindDirectCommercialPaymentTx(
        tx,
        f.input,
      );

      const another =
        await tx.paymentTransaction.create({
          data: f.paymentData,
        });

      await expect(
        bindDirectCommercialPaymentTx(
          tx,
          {
            ...f.input,
            transactionId: another.id,
          },
        ),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PAYMENT_ALREADY_BOUND",
      );

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toMatchObject({
        paymentTransactionId: f.payment.id,
        status: "pending_payment",
      });
    });
  }, 30000);

  it("rejects expired holds without extending the original hold", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      await expect(
        bindDirectCommercialPaymentTx(
          tx,
          {
            ...f.input,
            serverNow: new Date(
              f.purchase.holdExpiresAt!.getTime() + 1,
            ),
          },
        ),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_HOLD_EXPIRED",
      );

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
        }),
      ).toEqual(f.purchase);
    });
  }, 30000);

  it("does not accept a locally paid payment as pending binding", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);

      await tx.paymentTransaction.update({
        where: { id: f.payment.id },
        data: {
          status: "paid",
          paidAt: f.input.serverNow,
        },
      });

      await expect(
        bindDirectCommercialPaymentTx(tx, f.input),
      ).rejects.toThrow(
        "DIRECT_COMMERCIAL_PAYMENT_IDENTITY_MISMATCH",
      );

      expect(
        await tx.offerBoxPurchase.findUniqueOrThrow({
          where: { id: f.purchase.id },
          include: { entitlement: true },
        }),
      ).toMatchObject({
        status: "pending_payment",
        paymentTransactionId: null,
        paidAt: null,
        entitlement: null,
      });
    });
  }, 30000);
});

describe("integrated commercial acceptance", () => {
  for (const kind of ["package", "direct_offer"] as const) {
    it(`activates ${kind} with actual schedules and atomic settlement`, async () => {
      await rollbackTest(async (tx) => {
        const { user, plan, offer } =
          await createCatalogFixture(tx);

        const stamp = plan.id;
        const now = new Date();

        const startDate = new Date(
          now.getTime() + DAY,
        );

        const oldPlan = await tx.membership.create({
          data: {
            name: `Old subscription ${stamp}`,
            kind: "subscription",
            duration: 30,
            price: 200,
            sessionsCount: 4,
            features: "[]",
            isActive: true,
          },
        });

        const oldMembership =
          await tx.userMembership.create({
            data: {
              userId: user.id,
              membershipId: oldPlan.id,
              status: "active",
              startDate: now,
              endDate: new Date(now.getTime() + 30 * DAY),
              totalSessions: 4,
              baseSessions: 4,
              paymentAmount: 200,
              paymentMethod: "cash",
            },
          });

        const trainer = await tx.trainer.create({
          data: {
            name: `Trainer ${stamp}`,
            specialty: "fitness",
            bio: "Integration fixture",
            isActive: true,
          },
        });

        const gymClass = await tx.class.create({
          data: {
            name: `Class ${stamp}`,
            trainerId: trainer.id,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
            isActive: true,
          },
        });

        const date = new Date(
          now.getTime() + 2 * DAY,
        );

        date.setUTCHours(0, 0, 0, 0);

        const oldSchedule = await tx.schedule.create({
          data: {
            classId: gymClass.id,
            date,
            time: "09:00",
            availableSpots: 9,
            isActive: true,
          },
        });

        const selected = await tx.schedule.create({
          data: {
            classId: gymClass.id,
            date,
            time: "12:00",
            availableSpots: 10,
            isActive: true,
          },
        });

        const oldBooking = await tx.booking.create({
          data: {
            userId: user.id,
            scheduleId: oldSchedule.id,
            userMembershipId: oldMembership.id,
            status: "confirmed",
            paymentMethod: "cash",
            paidAmount: 100,
            entitlementUnits: 1,
          },
        });

        await tx.membership.update({
          where: { id: plan.id },
          data: {
            duration: 7,
            sessionsCount: 1,
            price: 500,
          },
        });

        if (kind === "direct_offer") {
          await tx.offer.update({
            where: { id: offer.id },
            data: {
              type: "special",
              maxSubscribers: 5,
              currentSubscribers: 0,
              offerBoxReservedCount: 0,
            },
          });
        }

        const offerId =
          kind === "direct_offer" ? offer.id : null;

        const pending =
          await prepareDirectCommercialCheckoutTx(tx, {
            userId: user.id,
            kind,
            offerId,
            catalogMembershipId: plan.id,
            startDate,
            selectedScheduleIds: [selected.id],
            serverNow: now,
            snapshot: {
              version: 1,
              purchasedAt: now.toISOString(),
              offer: {
                id: offerId,
                title: "Integrated commercial fixture",
              },
              membershipTemplate: {
                sourceMembershipId: plan.id,
                name: plan.name,
                kind: "package",
                durationDays: 7,
                sessionsCount: 1,
                walletBonus: 25,
                productRewards: null,
              },
              commercial: {
                currency: "EGP",
                originalPrice: 500,
                finalPrice: 500,
              },
              eligibilitySnapshot: {
                mode: "class_ids",
                classIds: [gymClass.id],
                classTypes: [],
              },
              economics: {
                commissionSnapshot: JSON.stringify({
  version: 1,
}),
                attributionMode: "direct_commercial",
              },
            },
          });

        const local =
          await createDirectCommercialPaymentTx(tx, {
            userId: user.id,
            purchaseId: pending.purchaseId,
            serverNow: now,
          });

        const paidAt = new Date();

        // Simulate the output of central Paymob proof.
        // Actual provider verification is covered
        // separately by the accepted proof tests.
        await tx.paymentTransaction.update({
          where: { id: local.transactionId },
          data: {
            status: "paid",
            paidAt,
            providerReference: `pi_acceptance_${stamp}`,
            externalReference: `tx_acceptance_${stamp}`,
          },
        });

        const proof = {
          purchaseId: pending.purchaseId,
          transactionId: local.transactionId,
          paymobOrderPaidVerified: true,
        };

        await reconcilePaidDirectCommercialPurchaseTx(
          tx,
          proof,
        );

        const before =
          await tx.offerBoxPurchase.findUniqueOrThrow({
            where: { id: pending.purchaseId },
          });

        expect(before.status)
          .toBe("paid_activation_pending");

        const activationInput = {
          ...proof,
          userId: user.id,
        };

        const first =
          await activatePaidDirectCommercialPurchaseTx(
            tx as unknown as Parameters<
              typeof activatePaidDirectCommercialPurchaseTx
            >[0],
            activationInput,
          );

        expect(first.alreadyActivated).toBe(false);

        const purchase =
          await tx.offerBoxPurchase.findUniqueOrThrow({
            where: { id: pending.purchaseId },
          });

        expect(purchase).toMatchObject({
          status: "redeemed",
          commercialKind: kind,
          redeemedUserMembershipId: null,
          paymentTransactionId: local.transactionId,
          holdExpiresAt: null,
          offerSnapshot: before.offerSnapshot,
          paidAt,
        });

        const right =
          await tx.offerBoxEntitlement.findUniqueOrThrow({
            where: { id: first.entitlementId },
          });

        expect(right).toMatchObject({
          userId: user.id,
          purchaseId: purchase.id,
          status: "active",
          startDate: pending.startDate,
          endDate: pending.endDate,
          totalSessions: 1,
        });

        const bookings = await tx.booking.findMany({
          where: {
            offerBoxEntitlementId: right.id,
          },
        });

        expect(bookings).toHaveLength(1);

        expect(bookings[0]).toMatchObject({
          userId: user.id,
          scheduleId: selected.id,
          userMembershipId: null,
          offerBoxEntitlementId: right.id,
          status: "confirmed",
          paidAmount: 0,
          entitlementUnits: 1,
        });

        expect(
          await tx.schedule.findUniqueOrThrow({
            where: { id: selected.id },
          }),
        ).toMatchObject({
          availableSpots: 9,
        });

        const journal =
          await tx.journal.findUniqueOrThrow({
            where: {
              referenceType_referenceId: {
                referenceType: "OfferBoxPurchase",
                referenceId: purchase.id,
              },
            },
          });

        expect(journal.status).toBe("posted");

        const wallet =
          await tx.wallet.findUniqueOrThrow({
            where: { userId: user.id },
          });

        expect(wallet.balance).toBe(25);

        expect(
          await tx.walletTransaction.count({
            where: {
              walletId: wallet.id,
              source: "offer_box_bonus",
            },
          }),
        ).toBe(1);

        const payment =
          await tx.paymentTransaction.findUniqueOrThrow({
            where: { id: local.transactionId },
          });

        expect(payment).toMatchObject({
          status: "paid",
          membershipId: null,
          amount: 500,
        });

        expect(
          JSON.parse(payment.metadata!)
            .offerBoxActivationReconciliation,
        ).toMatchObject({
          completed: true,
          purchaseId: purchase.id,
          entitlementId: right.id,
          journalId: journal.id,
        });

        // Replay the exact reconciliation and
        // activation with the same paid owner.
        await reconcilePaidDirectCommercialPurchaseTx(
          tx,
          proof,
        );

        const replay =
          await activatePaidDirectCommercialPurchaseTx(
            tx as unknown as Parameters<
              typeof activatePaidDirectCommercialPurchaseTx
            >[0],
            activationInput,
          );

        expect(replay).toEqual({
          alreadyActivated: true,
          entitlementId: right.id,
        });

        expect(
          await tx.offerBoxEntitlement.count({
            where: { purchaseId: purchase.id },
          }),
        ).toBe(1);

        expect(
          await tx.booking.findMany({
            where: { offerBoxEntitlementId: right.id },
          }),
        ).toEqual(bookings);

        expect(
          await tx.wallet.findUniqueOrThrow({
            where: { id: wallet.id },
          }),
        ).toEqual(wallet);

        expect(
          await tx.walletTransaction.count({
            where: {
              walletId: wallet.id,
              source: "offer_box_bonus",
            },
          }),
        ).toBe(1);

        expect(
          await tx.journal.count({
            where: {
              referenceType: "OfferBoxPurchase",
              referenceId: purchase.id,
            },
          }),
        ).toBe(1);

        expect(
          await tx.userMembership.findUniqueOrThrow({
            where: { id: oldMembership.id },
          }),
        ).toEqual(oldMembership);

        expect(
          await tx.booking.findUniqueOrThrow({
            where: { id: oldBooking.id },
          }),
        ).toEqual(oldBooking);

        expect(
          await tx.schedule.findUniqueOrThrow({
            where: { id: oldSchedule.id },
          }),
        ).toEqual(oldSchedule);

        expect(
          await tx.userMembership.count({
            where: { userId: user.id },
          }),
        ).toBe(1);

        if (kind === "direct_offer") {
          expect(
            await tx.offer.findUniqueOrThrow({
              where: { id: offer.id },
            }),
          ).toMatchObject({
            currentSubscribers: 1,
            offerBoxReservedCount: 0,
          });
        }

        console.info(
          `COMMERCIAL_ACCEPTANCE_KIND=${kind}`,
        );

        console.info("ACTUAL_BOOKING=PASS");
        console.info("OLD_SUBSCRIPTION=PRESERVED");
        console.info("OLD_BOOKING=PRESERVED");
        console.info("JOURNAL_EXACT_ONCE=PASS");
        console.info("WALLET_BONUS_EXACT_ONCE=PASS");
        console.info("ACTIVATION_REPLAY=PASS");
      });
    }, 60000);
  }
});
