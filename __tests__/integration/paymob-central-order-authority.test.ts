// PAYMOB_CENTRAL_ORDER_AUTHORITY_REGRESSION_V1
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";
import { getPaymentProvider } from "@/lib/payments/registry";

describe("Paymob central Order authority", () => {
  const createdUsers: string[] = [];
  const createdPayments: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();

    await db.paymentTransaction.deleteMany({
      where: { id: { in: createdPayments } },
    });

    await db.user.deleteMany({
      where: { id: { in: createdUsers } },
    });

    createdPayments.length = 0;
    createdUsers.length = 0;
  });

  async function createPayment(status: "pending" | "paid") {
    if (
      process.env.APP_ENV !== "test" ||
      !process.env.DATABASE_URL?.includes(
        "127.0.0.1:3306/fitzone_test"
      )
    ) {
      throw new Error("TEST_DATABASE_REQUIRED");
    }

    const id = randomUUID();
    const userId = randomUUID();

    /*
     * R19_LEGACY_PAYMOB_FIXTURE_V1
     *
     * The legacy fitzone_test.User schema lacks newer profile,
     * referral and marketing fields. This fixture only needs
     * a user ID to exercise real Paymob payment finality.
     *
     * Parameterized SQL avoids projecting absent Prisma fields.
     * It is strictly limited to this integration test.
     */
    await db.$executeRaw`
      INSERT INTO \`User\` (id, email, name, updatedAt)
      VALUES (
        ${userId},
        ${`order-authority-${id}@fitzone.test`},
        ${"Order Authority Test"},
        ${new Date()}
      )
    `;

    createdUsers.push(userId);

    await db.paymentTransaction.create({
      data: {
        id,
        userId,
        referenceCode: `TEST-${id}`,
        purpose: "subscription",
        businessUnit: "club",
        provider: "paymob",
        amount: 333,
        currency: "EGP",
        status,
        paymentMethod: "wallet",
      },
      select: { id: true },
    });

    createdPayments.push(id);
    return id;
  }

  function mockOrderVerification(status: "paid" | "pending") {
    const provider = getPaymentProvider("paymob");

    if (!provider) {
      throw new Error("PAYMOB_PROVIDER_MISSING");
    }

    return vi.spyOn(provider, "verifyTransaction")
      .mockResolvedValue({
        status,
        message: "Isolated Paymob Order test",
      });
  }

  it("rejects direct paid promotion without Order proof", async () => {
    const id = await createPayment("pending");
    const verify = mockOrderVerification("pending");

    await expect(
      updatePaymentTransactionStatus(id, "paid"),
    ).rejects.toThrow("PAYMOB_ORDER_PAID_PROOF_REQUIRED");

    expect(verify).toHaveBeenCalledTimes(1);

    const after = await db.paymentTransaction.findUniqueOrThrow({
      where: { id },
    });

    expect(after.status).toBe("pending");
    expect(after.paidAt).toBeNull();
  });

  it("rejects already-paid side-effect replay without Order proof", async () => {
    const id = await createPayment("paid");
    const verify = mockOrderVerification("pending");

    await expect(
      updatePaymentTransactionStatus(id, "paid"),
    ).rejects.toThrow("PAYMOB_ORDER_PAID_PROOF_REQUIRED");

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("allows verified already-paid reconciliation", async () => {
    const id = await createPayment("paid");
    const verify = mockOrderVerification("paid");

    const result = await updatePaymentTransactionStatus(id, "paid");

    expect(verify).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("paid");
  });
});
