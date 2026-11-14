import { afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getPaymentProvider } from "@/lib/payments/registry";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("TEST_DATABASE_URL_REQUIRED");

const url = new URL(rawUrl);

const r13Requested =
  process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1";

const commonTestSafety =
  process.env.APP_ENV === "test" &&
  process.env.NODE_ENV === "test" &&
  url.protocol === "mysql:" &&
  url.hostname === "127.0.0.1" &&
  url.port === "3306";

const allowedR13 =
  r13Requested &&
  commonTestSafety &&
  url.pathname === "/fitzone_final_release_r13_test" &&
  decodeURIComponent(url.username) === "fitzone_r13_user";

const allowedLegacy =
  !r13Requested &&
  commonTestSafety &&
  url.pathname === "/fitzone_final_r06_20261110_201735" &&
  decodeURIComponent(url.username) === "fzr06_20261110_201735";

if (!allowedR13 && !allowedLegacy) {
  throw new Error("REFUSING_NON_ISOLATED_DATABASE");
}

const db = new PrismaClient();

const marker = `R07B2B2-${Date.now()}-${Math.random()
  .toString(36).slice(2, 8)}`;

async function scenario(options: {
  rate: number;
  expectedAmount: number;
  expectedStatus: "earned" | "ineligible";
  settleThenRetry?: boolean;
}) {
  let customerId = "";
  let staffId = "";
  let offerId = "";
  let linkId = "";
  let paymentId = "";
  let purchaseId = "";
  let employeeId = "";
  let payrollRunId = "";

  const monthKey = "2054-06";
  const monthStart = new Date("2054-06-01T00:00:00.000Z");
  const monthEnd = new Date("2054-06-30T00:00:00.000Z");

  const paidAt = new Date("2054-06-08T12:00:00.000Z");

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

    if (
      await db.payrollRun.count({
        where: { monthKey },
      })
    ) {
      throw new Error("PAYROLL_TEST_MONTH_ALREADY_USED");
    }

    const employee = await db.employeeProfile.create({
      data: {
        userId: staffId,
        employeeCode: `${marker}-PAYROLL`.slice(0, 45),
        name: `${marker} PAYROLL EMPLOYEE`,
        employmentStatus: "active",
        payrollEnabled: true,
        hireDate: monthStart,
        employmentEndDate: monthEnd,
      },
    });

    employeeId = employee.id;

    await db.employeePayrollEligibilityTerm.create({
      data: {
        employeeId,
        effectiveFrom: monthStart,
        effectiveTo: monthEnd,
        enabled: true,
        createdById: staffId,
      },
    });

    await db.employeeCompensationTerm.create({
      data: {
        employeeId,
        effectiveFrom: monthStart,
        effectiveTo: monthEnd,
        fixedSalaryMinor: 100000,
        currency: "EGP",
        createdById: staffId,
      },
    });

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
      capturedAt: "2054-06-08T10:00:00.000Z",
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
        status: "paid",
        paymentMethod: "paymob",
        offerId,
        paidAt,
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
    expect(first[0].earnedAt?.getTime()).toBe(paidAt.getTime());
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
      const {
        calculatePayrollRun,
        finalizePayrollRun,
      } = await import("@/lib/employees/payroll-run-service");

      const { asDbTransactionClient } = await import("@/lib/db");

      const { settleCommissionsTx } = await import(
        "@/lib/commissions/commission-settlement-service"
      );

      const actor = {
        userId: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      };

      const calculated = await calculatePayrollRun(
        monthKey,
        actor,
      );

      payrollRunId = calculated.id;

      const row = calculated.employees.find(
        (item) => item.employeeId === employeeId,
      );

      expect(row).toBeTruthy();

      expect(row?.referralCommissionEarningMinor).toBe(5000);
      expect(row?.grossEarningsMinor).toBe(105000);
      expect(row?.netPayMinor).toBe(105000);

      const items = row?.items.filter(
        (item) =>
          item.sourceType === "staff_referral" &&
          item.sourceId === first[0].id,
      );

      expect(items).toHaveLength(1);
      expect(items?.[0].amountMinor).toBe(5000);

      const beforeFinalize =
        await db.staffCommission.findUniqueOrThrow({
          where: { id: first[0].id },
        });

      expect(beforeFinalize.status).toBe("earned");
      expect(beforeFinalize.settlementOwnerType).toBeNull();
      expect(beforeFinalize.offerBoxPurchaseId).toBe(purchaseId);
      expect(beforeFinalize.userMembershipId).toBeNull();

      console.log("OFFER_COMMISSION_IN_PAYROLL=PASS");
      console.log("PAYROLL_SALARY_PLUS_COMMISSION=1050_EGP");

      const finalized = await finalizePayrollRun(
        monthKey,
        actor,
      );

      expect(finalized.status).toBe("finalized");

      const afterFinalize =
        await db.staffCommission.findUniqueOrThrow({
          where: { id: first[0].id },
        });

      expect(afterFinalize.status).toBe("settled");
      expect(afterFinalize.settlementOwnerType).toBe("payroll");
      expect(afterFinalize.settlementOwnerId).toBe(calculated.id);
      expect(afterFinalize.settledAt).toBeTruthy();

      const repeated = await finalizePayrollRun(
        monthKey,
        actor,
      );

      expect(repeated.id).toBe(calculated.id);
      expect(repeated.status).toBe("finalized");

      console.log("OFFER_PAYROLL_FINALIZATION_EXACT_ONCE=PASS");

      await expect(
        db.$transaction((tx) =>
          settleCommissionsTx(asDbTransactionClient(tx), {
            commissionType: "staff",
            beneficiaryId: staffId,
            commissionIds: [first[0].id],
            actorUserId: staffId,
            paymentMethod: "integration_test",
          }),
        ),
      ).rejects.toThrow("COMMISSION_SETTLEMENT_NOT_OPEN");

      expect(
        await db.commissionPayoutItem.count({
          where: {
            commissionType: "staff",
            commissionId: first[0].id,
          },
        }),
      ).toBe(0);

      console.log("OFFER_DOUBLE_SETTLEMENT_BLOCKED=PASS");

      await updatePaymentTransactionStatus(paymentId, "paid");

      const settled = await db.staffCommission.findMany({
        where: { offerBoxPurchaseId: purchaseId },
      });
      expect(settled).toHaveLength(1);
      expect(settled[0].id).toBe(first[0].id);
      expect(settled[0].status).toBe("settled");
      expect(settled[0].settlementOwnerType).toBe("payroll");
      expect(settled[0].settlementOwnerId).toBe(payrollRunId);
      expect(settled[0].offerBoxPurchaseId).toBe(purchaseId);
      expect(settled[0].userMembershipId).toBeNull();

      console.log("PAID_REPLAY_PRESERVES_PAYROLL_OWNERSHIP=PASS");

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

    // Recover an owned run if calculate committed before its ID was assigned.
    // Never clean up a run belonging to a different fixture or actor.
    if (staffId) {
      const ownedRuns = await db.payrollRun.findMany({
        where: {
          monthKey,
          createdById: staffId,
        },
        select: { id: true },
      });

      if (ownedRuns.length > 1) {
        throw new Error("PAYROLL_TEST_CLEANUP_AMBIGUOUS_OWNER");
      }

      if (
        payrollRunId &&
        (ownedRuns.length !== 1 || ownedRuns[0].id !== payrollRunId)
      ) {
        throw new Error("PAYROLL_TEST_CLEANUP_OWNER_MISMATCH");
      }

      if (!payrollRunId && ownedRuns.length === 1) {
        payrollRunId = ownedRuns[0].id;
      }
    } else if (payrollRunId) {
      throw new Error("PAYROLL_TEST_CLEANUP_ACTOR_MISSING");
    }

    if (payrollRunId) {
      const rows = await db.payrollRunEmployee.findMany({
        where: { payrollRunId },
        select: { id: true },
      });

      await db.payrollRunItem.deleteMany({
        where: {
          payrollRunEmployeeId: {
            in: rows.map((row) => row.id),
          },
        },
      });

      await db.payrollRunEmployee.deleteMany({
        where: { payrollRunId },
      });

      await db.payrollRun.deleteMany({
        where: { id: payrollRunId },
      });
    }

    if (employeeId) {
      await db.employeeCompensationTerm.deleteMany({
        where: { employeeId },
      });

      await db.employeePayrollEligibilityTerm.deleteMany({
        where: { employeeId },
      });

      await db.employeeProfile.deleteMany({
        where: { id: employeeId },
      });
    }

    if (staffId) {
      await db.auditLog.deleteMany({
        where: { actorUserId: staffId },
      });
    }

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

describe("R07B2B2 independent offer payroll bridge", () => {
  it("earns on verified offer payment, settles in payroll, blocks duplicate payout and preserves ownership on paid replay", async () => {
    await scenario({
      rate: 10,
      expectedAmount: 50,
      expectedStatus: "earned",
      settleThenRetry: true,
    });

    console.log("R07B2B2_REAL_PAYROLL_BRIDGE=PASS");
  });
});