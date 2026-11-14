/* R15Z-Y FIX2: isolated R13 test database guard. */
if (process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1") {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("R15ZY_DATABASE_URL_REQUIRED");
  const u = new URL(raw);
  if (
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV !== "test" ||
    u.protocol !== "mysql:" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "3306" ||
    decodeURIComponent(u.username) !== "fitzone_r13_user" ||
    u.pathname !== "/fitzone_final_release_r13_test" ||
    (process.env.TEST_DATABASE_URL !== undefined &&
      process.env.TEST_DATABASE_URL !== raw)
  ) throw new Error("R15ZY_R13_DATABASE_IDENTITY_REJECTED");
}

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
  buildMembershipCommissionSnapshotTx,
} from "@/lib/commissions/membership-commission-snapshot-builder";

import {
  parseMembershipCommissionSnapshot,
} from "@/lib/commissions/membership-commission-contract";

describe(
  "staff referral immutable legacy cutover compatibility",
  { timeout: 120000 },
  () => {
    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const cutover =
      new Date("2035-01-01T00:00:00.000Z");

    const asOfDate =
      new Date("2035-01-10T12:00:00.000Z");

    let legacyStaffUserId = "";
    let newStaffUserId = "";
    let customerUserId = "";

    let legacyLinkId = "";
    let newLinkId = "";

    let positionId = "";
    let policyId = "";

    function guard() {
      const u =
        new URL(process.env.DATABASE_URL ?? "");

      if (
        process.env.APP_ENV !== "test" ||
        u.pathname.replace(/^\//, "") !==
          (process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1" ? "fitzone_final_release_r13_test" : "fitzone_test")
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
            code: `CUTOVER-${suffix}`,
            name: `Cutover Position ${suffix}`,
            nameEn: `Cutover Position ${suffix}`,
            isActive: true,
          },
        });

      positionId = position.id;

      const legacyStaff =
        await db.user.create({
          data: {
            email:
              `legacy-cutover-${suffix}@example.test`,
            name: "Legacy Referral Staff",
            role: "staff",

            /*
             * Existing production links currently use
             * these legacy User terms.
             */
            commissionRate: 5,
            commissionType: "percentage",
          },
        });

      legacyStaffUserId = legacyStaff.id;

      const newStaff =
        await db.user.create({
          data: {
            email:
              `new-cutover-${suffix}@example.test`,
            name: "New Referral Staff",
            role: "staff",

            /*
             * Deliberately tempting fallback value.
             * New engine MUST NOT use it.
             */
            commissionRate: 5,
            commissionType: "percentage",
          },
        });

      newStaffUserId = newStaff.id;

      const customer =
        await db.user.create({
          data: {
            email:
              `cutover-customer-${suffix}@example.test`,
            name: "Cutover Customer",
          },
        });

      customerUserId = customer.id;

      const legacyLink =
        await db.staffReferralLink.create({
          data: {
            userId: legacyStaffUserId,
            token:
              `LEGACY${suffix}`
                .replace(/[^A-Za-z0-9]/g, "")
                .toUpperCase(),
            label: "Pre-policy legacy link",
            isActive: true,

            /*
             * Explicitly BEFORE first policy.
             */
            createdAt:
              new Date(
                "2034-12-31T12:00:00.000Z",
              ),
          },
        });

      legacyLinkId = legacyLink.id;

      const newLink =
        await db.staffReferralLink.create({
          data: {
            userId: newStaffUserId,
            token:
              `NEW${suffix}`
                .replace(/[^A-Za-z0-9]/g, "")
                .toUpperCase(),
            label: "Post-policy new-engine link",
            isActive: true,

            /*
             * Explicitly AFTER cutover.
             */
            createdAt:
              new Date(
                "2035-01-02T12:00:00.000Z",
              ),
          },
        });

      newLinkId = newLink.id;

      const policy =
        await db.referralCommissionPolicy.create({
          data: {
            effectiveFrom: cutover,
            minimumShortTermGapDays: 15,
            shortTermMaxMonths: 3,
            underMinimumGapBps: 0,
            shortTermBps: 250,
            isActive: true,

            rates: {
              create: {
                positionId,
                newCustomerBps: 700,
                longTermBps: 800,
              },
            },
          },
        });

      policyId = policy.id;

      /*
       * IMPORTANT:
       * Neither staff user receives EmployeeProfile.
       *
       * Legacy link must therefore still work.
       * New link must fail closed.
       */
    });

    afterAll(async () => {
      guard();

      if (policyId) {
        await db.referralCommissionPolicyRate.deleteMany({
          where: {
            policyId,
          },
        });

        await db.referralCommissionPolicy.deleteMany({
          where: {
            id: policyId,
          },
        });
      }

      await db.staffReferralLink.deleteMany({
        where: {
          id: {
            in: [
              legacyLinkId,
              newLinkId,
            ].filter(Boolean),
          },
        },
      });

      await db.user.deleteMany({
        where: {
          id: {
            in: [
              legacyStaffUserId,
              newStaffUserId,
              customerUserId,
            ].filter(Boolean),
          },
        },
      });

      if (positionId) {
        await db.position.deleteMany({
          where: {
            id: positionId,
          },
        });
      }
    });

    it("keeps a link created before the first policy permanently on legacy terms even when full new-policy input is supplied", async () => {
      const raw =
        await db.$transaction((tx) =>
          buildMembershipCommissionSnapshotTx(
            asDbTransactionClient(tx),
            {
              staffReferralLinkId:
                legacyLinkId,

              /*
               * Full new checkout context is present.
               * createdAt boundary must still keep
               * this link legacy.
               */
              customerUserId,
              staffReferralAsOfDate:
                asOfDate,

              partnerCommissionBase: 1000,
              customerPaidAmount: 1000,
            },
          ),
        );

      const snapshot =
        parseMembershipCommissionSnapshot(raw);

      expect(snapshot.staff).toBeDefined();

      expect(
        snapshot.staff?.staffUserId,
      ).toBe(legacyStaffUserId);

      expect(
        snapshot.staff?.referralLinkId,
      ).toBe(legacyLinkId);

      /*
       * Must retain pre-cutover 5% economics.
       */
      expect(
        snapshot.staff?.terms,
      ).toEqual({
        type: "percentage",
        rate: 5,
        baseAmount: 1000,
      });

      /*
       * Legacy snapshot must not pretend
       * a policy was used.
       */
      expect(
        snapshot.staff?.policy,
      ).toBeUndefined();
    });

    it("never falls back to legacy User commission terms for a link created after cutover", async () => {
      await expect(
        db.$transaction((tx) =>
          buildMembershipCommissionSnapshotTx(
            asDbTransactionClient(tx),
            {
              staffReferralLinkId:
                newLinkId,
              customerUserId,
              staffReferralAsOfDate:
                asOfDate,
              partnerCommissionBase: 1000,
              customerPaidAmount: 1000,
            },
          ),
        ),
      ).rejects.toThrow(
        "STAFF_REFERRAL_EMPLOYEE_PROFILE_MISSING",
      );

      /*
       * If the builder had fallen back to the
       * User's legacy 5%, this call would have
       * succeeded instead of throwing.
       */
    });
  },
);
