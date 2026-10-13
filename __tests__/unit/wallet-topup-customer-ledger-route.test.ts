import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  payments: [] as Array<Record<string, unknown>>,
  journals: [] as Array<Record<string, unknown>>,
  permitted: true,
}));
vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => state.permitted
    ? { user: { id: "authorized-accounting-admin" } }
    : { error: new Response("Forbidden", { status: 403 }) }),
}));
vi.mock("@/lib/db", () => ({
  db: {
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
  },
}));
import { GET as routeGet } from "@/app/api/admin/accounting/wallet-topups/route";
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

  it("filters to paid transactions without treating pending attempts as collections", async () => {
    const response = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=paid",
    ));
    const body = await response.json();
    expect(body.total).toBe(2);
    expect(body.rows.map((row: { amount: number }) => row.amount)).toEqual([250, 98]);
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
