import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  db,
  asDbTransactionClient,
} from "@/lib/db";

import {
  saveReferralCommissionPolicyTx,
} from "@/lib/commissions/staff-referral-policy-admin";

describe(
  "referral commission policy admin effective dating",
  { timeout: 120000 },
  () => {
    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let positionId = "";
    let firstPolicyId = "";
    let secondPolicyId = "";

    function guard() {
      const url = new URL(
        process.env.DATABASE_URL ?? "",
      );

      if (
        process.env.APP_ENV !== "test" ||
        url.pathname.replace(/^\//, "") !==
          "fitzone_test"
      ) {
        throw new Error(
          "REFUSING: fitzone_test required",
        );
      }
    }

    beforeAll(async () => {
      guard();

      const position =
        await db.position.create({
          data: {
            code: `REFPOL-${suffix}`,
            name: `Referral Policy ${suffix}`,
            nameEn: `Referral Policy ${suffix}`,
            isActive: true,
          },
        });

      positionId = position.id;
    });

    afterAll(async () => {
      guard();

      if (positionId) {
        const linkedRates =
          await db.referralCommissionPolicyRate.findMany({
            where: {
              positionId,
            },
            select: {
              policyId: true,
            },
          });

        const policyIds = [
          ...new Set(
            linkedRates.map((row) => row.policyId),
          ),
        ];

        await db.referralCommissionPolicyRate.deleteMany({
          where: {
            positionId,
          },
        });

        if (policyIds.length > 0) {
          await db.referralCommissionPolicy.deleteMany({
            where: {
              id: {
                in: policyIds,
              },
            },
          });
        }

        await db.position.deleteMany({
          where: {
            id: positionId,
          },
        });
      }
    });

    it("creates the first policy without an effectiveTo", async () => {
      const created =
        await db.$transaction((tx) =>
          saveReferralCommissionPolicyTx(
            asDbTransactionClient(tx),
            {
              effectiveFrom:
                new Date(
                  "2026-09-01T00:00:00.000Z",
                ),

              minimumShortTermGapDays: 15,
              shortTermMaxMonths: 3,

              underMinimumGapBps: 0,
              shortTermBps: 250,

              notes: "first policy",

              rates: [
                {
                  positionId,
                  newCustomerBps: 500,
                  longTermBps: 600,
                },
              ],
            },
          ),
        );

      firstPolicyId = created.id;

      expect(
        created.effectiveFrom.toISOString(),
      ).toBe(
        "2026-09-01T00:00:00.000Z",
      );

      expect(created.effectiveTo).toBeNull();

      expect(created.rates).toHaveLength(1);

      expect(
        created.rates[0].newCustomerBps,
      ).toBe(500);

      expect(
        created.rates[0].longTermBps,
      ).toBe(600);
    });

    it("creates a later policy and closes the previous policy one day before it starts", async () => {
      const created =
        await db.$transaction((tx) =>
          saveReferralCommissionPolicyTx(
            asDbTransactionClient(tx),
            {
              effectiveFrom:
                new Date(
                  "2026-10-01T00:00:00.000Z",
                ),

              minimumShortTermGapDays: 20,
              shortTermMaxMonths: 4,

              underMinimumGapBps: 100,
              shortTermBps: 300,

              notes: "second policy",

              rates: [
                {
                  positionId,
                  newCustomerBps: 550,
                  longTermBps: 650,
                },
              ],
            },
          ),
        );

      secondPolicyId = created.id;

      expect(created.effectiveTo).toBeNull();

      const first =
        await db.referralCommissionPolicy.findUnique({
          where: {
            id: firstPolicyId,
          },
          include: {
            rates: true,
          },
        });

      expect(first).not.toBeNull();

      expect(
        first?.effectiveTo?.toISOString(),
      ).toBe(
        "2026-09-30T00:00:00.000Z",
      );

      /*
       * Historical economics must remain unchanged.
       */
      expect(
        first?.minimumShortTermGapDays,
      ).toBe(15);

      expect(
        first?.shortTermMaxMonths,
      ).toBe(3);

      expect(
        first?.underMinimumGapBps,
      ).toBe(0);

      expect(
        first?.shortTermBps,
      ).toBe(250);

      expect(
        first?.rates[0].newCustomerBps,
      ).toBe(500);

      expect(
        first?.rates[0].longTermBps,
      ).toBe(600);
    });

    it("resolves the old and new policy according to their effective dates", async () => {
      const september =
        await db.referralCommissionPolicy.findFirst({
          where: {
            isActive: true,

            effectiveFrom: {
              lte: new Date(
                "2026-09-15T00:00:00.000Z",
              ),
            },

            OR: [
              {
                effectiveTo: null,
              },
              {
                effectiveTo: {
                  gte: new Date(
                    "2026-09-15T00:00:00.000Z",
                  ),
                },
              },
            ],
          },

          orderBy: {
            effectiveFrom: "desc",
          },
        });

      expect(september?.id).toBe(
        firstPolicyId,
      );

      const october =
        await db.referralCommissionPolicy.findFirst({
          where: {
            isActive: true,

            effectiveFrom: {
              lte: new Date(
                "2026-10-15T00:00:00.000Z",
              ),
            },

            OR: [
              {
                effectiveTo: null,
              },
              {
                effectiveTo: {
                  gte: new Date(
                    "2026-10-15T00:00:00.000Z",
                  ),
                },
              },
            ],
          },

          orderBy: {
            effectiveFrom: "desc",
          },
        });

      expect(october?.id).toBe(
        secondPolicyId,
      );
    });

    it("rejects duplicate effectiveFrom instead of overwriting history", async () => {
      await expect(
        db.$transaction((tx) =>
          saveReferralCommissionPolicyTx(
            asDbTransactionClient(tx),
            {
              effectiveFrom:
                new Date(
                  "2026-10-01T00:00:00.000Z",
                ),

              minimumShortTermGapDays: 15,
              shortTermMaxMonths: 3,
              underMinimumGapBps: 0,
              shortTermBps: 250,

              rates: [
                {
                  positionId,
                  newCustomerBps: 999,
                  longTermBps: 999,
                },
              ],
            },
          ),
        ),
      ).rejects.toThrow(
        "REFERRAL_POLICY_EFFECTIVE_FROM_EXISTS",
      );

      const second =
        await db.referralCommissionPolicy.findUnique({
          where: {
            id: secondPolicyId,
          },
          include: {
            rates: true,
          },
        });

      /*
       * Failed duplicate must not mutate existing policy.
       */
      expect(
        second?.minimumShortTermGapDays,
      ).toBe(20);

      expect(
        second?.shortTermBps,
      ).toBe(300);

      expect(
        second?.rates[0].newCustomerBps,
      ).toBe(550);
    });

    it("rejects invalid short-term calendar months atomically", async () => {
      const before =
        await db.referralCommissionPolicy.count();

      await expect(
        db.$transaction((tx) =>
          saveReferralCommissionPolicyTx(
            asDbTransactionClient(tx),
            {
              effectiveFrom:
                new Date(
                  "2026-11-01T00:00:00.000Z",
                ),

              minimumShortTermGapDays: 15,
              shortTermMaxMonths: 0,

              underMinimumGapBps: 0,
              shortTermBps: 250,

              rates: [
                {
                  positionId,
                  newCustomerBps: 500,
                  longTermBps: 600,
                },
              ],
            },
          ),
        ),
      ).rejects.toThrow(
        "REFERRAL_POLICY_INVALID_SHORT_TERM_MONTHS",
      );

      expect(
        await db.referralCommissionPolicy.count(),
      ).toBe(before);
    });

    it("rejects percentage values above 100% without mutation", async () => {
      const before =
        await db.referralCommissionPolicy.count();

      await expect(
        db.$transaction((tx) =>
          saveReferralCommissionPolicyTx(
            asDbTransactionClient(tx),
            {
              effectiveFrom:
                new Date(
                  "2026-11-01T00:00:00.000Z",
                ),

              minimumShortTermGapDays: 15,
              shortTermMaxMonths: 3,

              underMinimumGapBps: 0,
              shortTermBps: 10001,

              rates: [
                {
                  positionId,
                  newCustomerBps: 500,
                  longTermBps: 600,
                },
              ],
            },
          ),
        ),
      ).rejects.toThrow(
        "REFERRAL_POLICY_INVALID_SHORT_TERM_BPS",
      );

      expect(
        await db.referralCommissionPolicy.count(),
      ).toBe(before);
    });
  },
);
