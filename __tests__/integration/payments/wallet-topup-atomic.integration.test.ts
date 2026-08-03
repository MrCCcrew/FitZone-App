import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/db").db;
let updatePaymentTransactionStatus: typeof import("@/lib/payments/service").updatePaymentTransactionStatus;
let setWalletTopupTestFailpoint: typeof import("@/lib/payments/service").setWalletTopupTestFailpoint;
const userIds = new Set<string>();
let sequence = 0;

function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required for wallet top-up integration tests.");

  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (database !== "fitzone_test") {
    throw new Error("Wallet top-up integration tests require the fitzone_test database.");
  }
  return value;
}

beforeAll(async () => {
  process.env.DATABASE_URL = testDatabaseUrl();
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Wallet top-up integration tests require NODE_ENV=test.");
  }

  ({ db } = await import("@/lib/db"));
  ({ updatePaymentTransactionStatus, setWalletTopupTestFailpoint } = await import("@/lib/payments/service"));
});

afterEach(async () => {
  if (setWalletTopupTestFailpoint) setWalletTopupTestFailpoint(null);
  for (const userId of userIds) {
    await db.paymentTransaction.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
  userIds.clear();
});

afterAll(async () => {
  if (db) await db.$disconnect();
});

async function fixture(currency = "EGP") {
  const key = `wallet-topup-it-${Date.now()}-${++sequence}`;
  const user = await db.user.create({
    data: { name: key, email: `${key}@test.local` },
    select: { id: true },
  });
  userIds.add(user.id);
  await db.wallet.create({ data: { userId: user.id, balance: 25 } });
  const payment = await db.paymentTransaction.create({
    data: {
      userId: user.id,
      referenceCode: `FZ-Wallet-IT-${key}`,
      purpose: "wallet_topup",
      businessUnit: "club",
      provider: "paymob",
      amount: 100,
      currency,
      status: "pending",
      paymentMethod: "paymob",
    },
  });
  return { userId: user.id, transactionId: payment.id };
}

async function state(userId: string, transactionId: string) {
  const [payment, wallet] = await Promise.all([
    db.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId } }),
    db.wallet.findUniqueOrThrow({ where: { userId } }),
  ]);
  const ledger = await db.walletTransaction.findMany({ where: { walletId: wallet.id } });
  return { payment, wallet, ledger };
}

describe("wallet top-up — real fitzone_test transaction integration", () => {
  it("credits the stored EGP amount once and creates one ledger entry", async () => {
    const record = await fixture();

    await updatePaymentTransactionStatus(record.transactionId, "paid");

    const stored = await state(record.userId, record.transactionId);
    expect(stored.payment.status).toBe("paid");
    expect(stored.wallet.balance).toBe(125);
    expect(stored.ledger).toHaveLength(1);
    expect(stored.ledger[0]).toMatchObject({ amount: 100, type: "credit" });
  });

  it("rolls back the payment claim, balance, and ledger when credit fails, then retries once", async () => {
    const record = await fixture();
    setWalletTopupTestFailpoint("credit");

    await expect(updatePaymentTransactionStatus(record.transactionId, "paid")).rejects.toThrow("WALLET_TOPUP_TEST_FAILPOINT:credit");

    let stored = await state(record.userId, record.transactionId);
    expect(stored.payment.status).toBe("pending");
    expect(stored.wallet.balance).toBe(25);
    expect(stored.ledger).toHaveLength(0);

    setWalletTopupTestFailpoint(null);
    await updatePaymentTransactionStatus(record.transactionId, "paid");

    stored = await state(record.userId, record.transactionId);
    expect(stored.payment.status).toBe("paid");
    expect(stored.wallet.balance).toBe(125);
    expect(stored.ledger).toHaveLength(1);
  });

  it("rolls back the balance and claim when ledger creation fails, then retries once", async () => {
    const record = await fixture();
    setWalletTopupTestFailpoint("ledger");

    await expect(updatePaymentTransactionStatus(record.transactionId, "paid")).rejects.toThrow("WALLET_TOPUP_TEST_FAILPOINT:ledger");

    let stored = await state(record.userId, record.transactionId);
    expect(stored.payment.status).toBe("pending");
    expect(stored.wallet.balance).toBe(25);
    expect(stored.ledger).toHaveLength(0);

    setWalletTopupTestFailpoint(null);
    await updatePaymentTransactionStatus(record.transactionId, "paid");

    stored = await state(record.userId, record.transactionId);
    expect(stored.payment.status).toBe("paid");
    expect(stored.wallet.balance).toBe(125);
    expect(stored.ledger).toHaveLength(1);
  });

  it("is idempotent after success", async () => {
    const record = await fixture();

    await updatePaymentTransactionStatus(record.transactionId, "paid");
    await updatePaymentTransactionStatus(record.transactionId, "paid");

    const stored = await state(record.userId, record.transactionId);
    expect(stored.payment.status).toBe("paid");
    expect(stored.wallet.balance).toBe(125);
    expect(stored.ledger).toHaveLength(1);
  });

  it("rejects non-EGP wallet top-ups without changing stored money", async () => {
    const record = await fixture("USD");

    await expect(updatePaymentTransactionStatus(record.transactionId, "paid")).rejects.toThrow();

    const stored = await state(record.userId, record.transactionId);
    expect(stored.payment.status).toBe("pending");
    expect(stored.wallet.balance).toBe(25);
    expect(stored.ledger).toHaveLength(0);
  });
});
