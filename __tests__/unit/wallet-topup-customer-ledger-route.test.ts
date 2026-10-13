import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  payments: [] as Array<Record<string, unknown>>,
  journals: [] as Array<Record<string, unknown>>,
  movements: [] as Array<Record<string, unknown>>,
  permitted: true,
}));
vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => state.permitted
    ? { user: { id: "authorized-accounting-admin" } }
    : { error: new Response("Forbidden", { status: 403 }) }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations)),
    paymentTransaction: {
      findMany: vi.fn(async ({ where, skip, take }: {
        where: { purpose: string; status?: string }; skip: number; take: number;
      }) => state.payments.filter((entry) =>
        entry.purpose === where.purpose &&
        (!where.status || entry.status === where.status),
      ).slice(skip, skip + take)),
      count: vi.fn(async ({ where }: { where: { purpose: string; status?: string } }) =>
        state.payments.filter((entry) =>
          entry.purpose === where.purpose &&
          (!where.status || entry.status === where.status),
        ).length),
    },
    journal: {
      findMany: vi.fn(async () => state.journals),
    },
    walletTransaction: {
      findMany: vi.fn(async ({ where }: {
        where: {
          type: string;
          source: { in: string[] };
          OR: Array<{
            wallet: { userId: string };
            description: { contains: string };
            createdAt: { gte: Date; lte: Date };
          }>;
        };
      }) => state.movements.filter((movement) =>
        movement.type === where.type &&
        where.source.in.includes(String(movement.source)) &&
        where.OR.some((condition) =>
          movement.userId === condition.wallet.userId &&
          String(movement.description).includes(
            condition.description.contains,
          ) &&
          movement.createdAt instanceof Date &&
          movement.createdAt >= condition.createdAt.gte &&
          movement.createdAt <= condition.createdAt.lte,
        ),
      ).map((movement) => ({
        ...movement,
        wallet: { userId: movement.userId },
      }))),
    },
  },
}));
import { GET as routeGet } from "@/app/api/admin/accounting/wallet-topups/route";
import { db } from "@/lib/db";
async function GET(req: Request): Promise<Response> {
  const response = await routeGet(req);
  if (!response) throw new Error("ACCOUNTING_GET_RETURNED_UNDEFINED");
  return response;
}

const create = (id: string, paid: boolean, amount: number) => ({
  id,
  userId: `customer-${id}`,
  purpose: "wallet_topup",
  status: paid ? "paid" : "pending",
  amount,
  currency: "EGP",
  provider: "paymob",
  referenceCode: `REF-${id}`,
  providerReference: null,
  externalReference: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  paidAt: paid ? new Date("2026-10-01T10:02:00Z") : null,
  user: {
    name: `Customer ${id}`,
    email: `${id}@example.invalid`,
    phone: "01000000000",
    wallet: { balance: paid ? amount : 0 },
  },
});

beforeEach(() => {
  state.permitted = true;
  state.movements = [];
  state.payments = [create("A", true, 250), create("B", true, 98),
    create("C", false, 100), create("D", false, 100), create("E", false, 50)];
  state.journals = [{ referenceId: "A", status: "posted" }, { referenceId: "B", status: "posted" }];
});

describe("wallet-topup ledger with customer attribution", () => {
  it("lists paying customers separately from pending attempts, with journal evidence", async () => {
    const response = await GET(new Request("http://localhost/api/admin/accounting/wallet-topups"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(5);
    expect(body.rows).toHaveLength(5);
    expect(body.rows.map((row: { customerName: string }) => row.customerName))
      .toEqual(["Customer A", "Customer B", "Customer C", "Customer D", "Customer E"]);
    expect(body.rows[0]).toMatchObject({
      amount: 250, currency: "EGP", status: "paid",
      reference: "REF-A", customerEmail: "A@example.invalid",
      journalStatus: "posted", currentWalletBalance: 250,
      walletCreditReconciled: false,
    });
    expect(body.creditReconciliationStatus).toBe("requires_direct_payment_transaction_link");
  });

  it("matches old legacy source by payment reference and amount, never double-counting bonus", async () => {
    state.movements = [
      { userId: "customer-A", type: "credit", source: "legacy", amount: 250,
        description: "شحن محفظة عبر REF-A", createdAt: new Date("2026-10-01T10:02:00Z") },
      { userId: "customer-B", type: "credit", source: "legacy", amount: 98,
        description: "شحن محفظة عبر REF-B", createdAt: new Date("2026-10-01T10:02:00Z") },
      { userId: "customer-B", type: "credit", source: "legacy", amount: 14.7,
        description: "بونص شحن للمعاملة REF-B", createdAt: new Date("2026-10-01T10:02:00Z") },
    ];
    const body = await (await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=paid",
    ))).json();
    expect(body.rows[0]).toMatchObject({
      principalCreditEvidence: "unique_reference_amount_match",
      additionalReferencedCreditCandidate: 0,
    });
    expect(body.rows[1]).toMatchObject({
      principalCreditEvidence: "unique_reference_amount_match",
      additionalReferencedCreditCandidate: 14.7,
      additionalReferencedCreditCount: 1,
      walletCreditReconciled: false,
    });
  });

  it("flags duplicate principal credit candidates, never claims full reconciliation", async () => {
    state.movements = Array.from({ length: 2 }, () => ({
      userId: "customer-A", type: "credit", source: "legacy", amount: 250,
      description: "شحن محفظة عبر REF-A", createdAt: new Date("2026-10-01T10:02:00Z"),
    }));
    const body = await (await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=paid",
    ))).json();
    expect(body.rows[0].principalCreditEvidence).toBe("ambiguous_duplicate");
    expect(body.rows[0].walletCreditReconciled).toBe(false);
  });

  it("filters to paid transactions without treating pending attempts as collections", async () => {
    const response = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=paid",
    ));
    const body = await response.json();
    expect(body.total).toBe(2);
    expect(body.rows.map((row: { amount: number }) => row.amount)).toEqual([250, 98]);
  });

  it("uses one batched wallet query and a repeatable-read page snapshot", async () => {
    vi.mocked(db.walletTransaction.findMany).mockClear();
    vi.mocked(db.$transaction).mockClear();

    const response = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=paid",
    ));

    expect(response.status).toBe(200);
    expect(db.walletTransaction.findMany).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
  });

  it("does not read wallet evidence for an unpaid-only page", async () => {
    vi.mocked(db.walletTransaction.findMany).mockClear();

    const response = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=pending",
    ));

    expect(response.status).toBe(200);
    expect(db.walletTransaction.findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid status filters", async () => {
    const response = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=paid%20OR%201%3D1",
    ));
    expect(response.status).toBe(400);
  });

  it("protects records from non-accounting users", async () => {
    state.permitted = false;
    const response = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups",
    ));
    expect(response.status).toBe(403);
  });
});
