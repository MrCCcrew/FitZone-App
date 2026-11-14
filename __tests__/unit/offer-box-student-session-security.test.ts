import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// OFFER_BOX_STUDENT_SESSION_SECURITY_V1

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  paymentFind: vi.fn(),
  purchaseFind: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.currentUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: mocks.paymentFind,
    },
    offerBoxPurchase: {
      findUnique: mocks.purchaseFind,
    },
  },
}));

import { GET } from
  "@/app/api/payments/session/[transactionId]/route";

const CHECKOUT = "https://checkout.example.test/existing";

function payment(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "payment-1",
    referenceCode: "TEST-PAYMENT",
    userId: "user-1",
    provider: "paymob",
    purpose: "offer_box",
    status: "pending",
    amount: 90,
    currency: "EGP",
    expiresAt: new Date(Date.now() + 600000),
    checkoutUrl: CHECKOUT,
    iframeUrl: null,
    providerPayload: JSON.stringify({
      checkoutUrl: CHECKOUT,
      clientSecret: "synthetic-test-secret",
    }),
    ...overrides,
  };
}

function studentSnapshot(
  overrides: Record<string, unknown> = {},
) {
  return JSON.stringify({
    version: 1,
    offer: { id: "offer-1" },
    ageEligibility: {
      requiresBirthDate: true,
      verificationMethod: "egyptian_national_id",
      minAgeYears: 13,
      maxAgeYears: 25,
      ageYearsAtPurchase: 18,
      validatedAt: new Date().toISOString(),
      ...overrides,
    },
  });
}

function purchase(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "purchase-1",
    userId: "user-1",
    offerId: "offer-1",
    paymentTransactionId: "payment-1",
    status: "pending_payment",
    holdExpiresAt: new Date(Date.now() + 600000),
    offerSnapshot: studentSnapshot(),
    ...overrides,
  };
}

async function request() {
  return GET(
    new Request(
      "http://localhost/api/payments/session/payment-1",
    ),
    {
      params: Promise.resolve({
        transactionId: "payment-1",
      }),
    },
  );
}

async function expectBlocked(
  expectedStatus: number,
) {
  const response = await request();
  const body = await response.json();
  const serialized = JSON.stringify(body);

  expect(response.status).toBe(expectedStatus);
  expect(serialized).not.toContain(CHECKOUT);
  expect(serialized).not.toContain(
    "synthetic-test-secret",
  );
}

describe(
  "Offer Box frozen student payment session security",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.currentUser.mockResolvedValue({
        id: "user-1",
      });

      mocks.paymentFind.mockResolvedValue(
        payment(),
      );

      mocks.purchaseFind.mockResolvedValue(
        purchase(),
      );
    });

    it(
      "resumes the same verified student payment",
      async () => {
        const response = await request();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.transaction.id).toBe(
          "payment-1",
        );
        expect(body.session.checkoutUrl).toBe(
          CHECKOUT,
        );

        expect(mocks.purchaseFind)
          .toHaveBeenCalledOnce();
      },
    );

    it(
      "blocks an unverified frozen student purchase",
      async () => {
        mocks.purchaseFind.mockResolvedValue(
          purchase({
            offerSnapshot: studentSnapshot({
              verificationMethod: null,
              ageYearsAtPurchase: null,
              validatedAt: null,
            }),
          }),
        );

        await expectBlocked(409);
      },
    );

    it(
      "blocks an invalid frozen student age",
      async () => {
        mocks.purchaseFind.mockResolvedValue(
          purchase({
            offerSnapshot: studentSnapshot({
              ageYearsAtPurchase: 10,
            }),
          }),
        );

        await expectBlocked(409);
      },
    );

    it("resumes a legacy verified birth-date checkout without changing payment", async () => {
      const frozen = JSON.parse(studentSnapshot());
      frozen.purchasedAt = new Date(Date.now() - 120000).toISOString();
      delete frozen.ageEligibility.verificationMethod;

      mocks.purchaseFind.mockResolvedValue(
        purchase({ offerSnapshot: JSON.stringify(frozen) }),
      );

      const response = await request();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.transaction.id).toBe("payment-1");
      expect(body.session.checkoutUrl).toBe(CHECKOUT);
      expect(mocks.paymentFind).toHaveBeenCalledTimes(1);
    });

    it("preserves legacy frozen age-bound purchases when birth-date flag was false", async () => {
      const frozen = JSON.parse(studentSnapshot({
        requiresBirthDate: false,
        minAgeYears: 13,
        maxAgeYears: 25,
        ageYearsAtPurchase: 18,
      }));
      frozen.purchasedAt = new Date(Date.now() - 120000).toISOString();
      delete frozen.ageEligibility.verificationMethod;

      mocks.purchaseFind.mockResolvedValue(
        purchase({ offerSnapshot: JSON.stringify(frozen) }),
      );

      const response = await request();
      expect(response.status).toBe(200);
      expect((await response.json()).session.checkoutUrl).toBe(CHECKOUT);
    });

    it("resumes a legacy unrestricted offer without demanding an ID", async () => {
      const frozen = JSON.parse(studentSnapshot({
        requiresBirthDate: false,
        minAgeYears: null,
        maxAgeYears: null,
        ageYearsAtPurchase: null,
      }));
      frozen.purchasedAt = new Date(Date.now() - 120000).toISOString();
      delete frozen.ageEligibility.verificationMethod;

      mocks.purchaseFind.mockResolvedValue(
        purchase({ offerSnapshot: JSON.stringify(frozen) }),
      );

      const response = await request();
      expect(response.status).toBe(200);
      expect((await response.json()).session.checkoutUrl).toBe(CHECKOUT);
    });

    it("rejects legacy age evidence that fails frozen age boundaries", async () => {
      const frozen = JSON.parse(studentSnapshot({ ageYearsAtPurchase: 10 }));
      frozen.purchasedAt = new Date(Date.now() - 120000).toISOString();
      delete frozen.ageEligibility.verificationMethod;

      mocks.purchaseFind.mockResolvedValue(
        purchase({ offerSnapshot: JSON.stringify(frozen) }),
      );

      await expectBlocked(409);
    });

    it("rejects a missing-method snapshot with no frozen purchase date", async () => {
      const frozen = JSON.parse(studentSnapshot());
      delete frozen.ageEligibility.verificationMethod;

      mocks.purchaseFind.mockResolvedValue(
        purchase({ offerSnapshot: JSON.stringify(frozen) }),
      );

      await expectBlocked(409);
    });

    it(
      "does not expose an orphan Offer Box session",
      async () => {
        mocks.purchaseFind.mockResolvedValue(
          null,
        );

        await expectBlocked(409);
      },
    );

    it(
      "does not expose a foreign linked purchase",
      async () => {
        mocks.purchaseFind.mockResolvedValue(
          purchase({
            userId: "another-user",
          }),
        );

        await expectBlocked(404);
      },
    );

    it(
      "does not resume an expired purchase hold",
      async () => {
        mocks.purchaseFind.mockResolvedValue(
          purchase({
            holdExpiresAt:
              new Date(Date.now() - 60000),
          }),
        );

        await expectBlocked(410);
      },
    );

    it(
      "keeps paid reconciliation available",
      async () => {
        mocks.paymentFind.mockResolvedValue(
          payment({ status: "paid" }),
        );

        mocks.purchaseFind.mockResolvedValue(
          purchase({
            offerSnapshot: studentSnapshot({
              verificationMethod: null,
            }),
          }),
        );

        const response = await request();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.transaction.status).toBe(
          "paid",
        );
        expect(body.session.checkoutUrl).toBeNull();
      },
    );

    it(
      "keeps non-student offers independent",
      async () => {
        mocks.purchaseFind.mockResolvedValue(
          purchase({
            offerSnapshot: studentSnapshot({
              requiresBirthDate: false,
              verificationMethod:
                "account_birth_date",
              minAgeYears: null,
              maxAgeYears: null,
              ageYearsAtPurchase: null,
            }),
          }),
        );

        const response = await request();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.session.checkoutUrl).toBe(
          CHECKOUT,
        );
      },
    );
  },
);
