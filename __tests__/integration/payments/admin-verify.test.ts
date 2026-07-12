import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    siteContent: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/lib/payments/service", () => ({
  verifyPaymentTransaction: vi.fn(),
  updatePaymentTransactionStatus: vi.fn(),
}));

import { POST, GET } from "@/app/api/admin/payments/verify/route";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { verifyPaymentTransaction, updatePaymentTransactionStatus } from "@/lib/payments/service";

const ADMIN_OK = {
  session: { user: { id: "a1", email: "admin@test.com", name: "Admin", role: "admin", jobTitle: null, permissions: [] } },
  role: "admin",
  permissions: [] as string[],
};

const UNAUTHORIZED = { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
const FORBIDDEN    = { error: NextResponse.json({ error: "Forbidden" },    { status: 403 }) };

function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/payments/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(userId?: string) {
  const url = userId
    ? `http://localhost/api/admin/payments/verify?userId=${userId}`
    : "http://localhost/api/admin/payments/verify";
  return new Request(url);
}

// ─── POST authorization ────────────────────────────────────────────────────────

describe("POST /admin/payments/verify — authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAdminFeature).mockResolvedValue(UNAUTHORIZED);
    const res = (await POST(postReq({ transactionId: "t1" })))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but lacks 'settings' feature", async () => {
    vi.mocked(requireAdminFeature).mockResolvedValue(FORBIDDEN);
    const res = (await POST(postReq({ transactionId: "t1" })))!;
    expect(res.status).toBe(403);
  });
});

// ─── POST validation ──────────────────────────────────────────────────────────

describe("POST /admin/payments/verify — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminFeature).mockResolvedValue(ADMIN_OK);
  });

  it("returns 400 when transactionId is absent", async () => {
    const res = (await POST(postReq({})))!;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("transactionId");
  });

  it("returns 404 when transaction does not exist", async () => {
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValue(null);
    const res = (await POST(postReq({ transactionId: "missing" })))!;
    expect(res.status).toBe(404);
  });
});

// ─── POST verify flow ─────────────────────────────────────────────────────────

describe("POST /admin/payments/verify — verify vs force-activate", () => {
  const TX = { id: "t1", status: "pending_payment", userId: "u1", membershipId: "m1" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminFeature).mockResolvedValue(ADMIN_OK);
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValue(TX as never);
  });

  it("calls verifyPaymentTransaction (not update) when forceActivate is absent", async () => {
    vi.mocked(verifyPaymentTransaction).mockResolvedValue({ id: "t1", status: "paid" } as never);
    const res = (await POST(postReq({ transactionId: "t1" })))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.method).toBe("verify");
    expect(verifyPaymentTransaction).toHaveBeenCalledWith("t1");
    expect(updatePaymentTransactionStatus).not.toHaveBeenCalled();
  });

  it("calls updatePaymentTransactionStatus with 'paid' when forceActivate=true", async () => {
    vi.mocked(updatePaymentTransactionStatus).mockResolvedValue({ id: "t1", status: "paid" } as never);
    const res = (await POST(postReq({ transactionId: "t1", forceActivate: true })))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.method).toBe("force");
    expect(updatePaymentTransactionStatus).toHaveBeenCalledWith("t1", "paid", "تفعيل يدوي من الأدمن");
    expect(verifyPaymentTransaction).not.toHaveBeenCalled();
  });
});

// ─── GET authorization ────────────────────────────────────────────────────────

describe("GET /admin/payments/verify — authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAdminFeature).mockResolvedValue(UNAUTHORIZED);
    const res = (await GET(getReq("u1")))!;
    expect(res.status).toBe(401);
  });
});

// ─── GET listing ─────────────────────────────────────────────────────────────

describe("GET /admin/payments/verify — listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminFeature).mockResolvedValue(ADMIN_OK);
  });

  it("returns 400 when userId query param is absent", async () => {
    const res = (await GET(getReq()))!;
    expect(res.status).toBe(400);
  });

  it("returns transactions array for a valid userId", async () => {
    const rows = [{ id: "t1", status: "paid", amount: 1000, purpose: "subscription", provider: "paymob", externalReference: null, createdAt: new Date() }];
    vi.mocked(db.paymentTransaction.findMany).mockResolvedValue(rows as never);
    const res = (await GET(getReq("u1")))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].id).toBe("t1");
    expect(vi.mocked(db.paymentTransaction.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
  });

  it("returns empty array when user has no transactions", async () => {
    vi.mocked(db.paymentTransaction.findMany).mockResolvedValue([]);
    const res = (await GET(getReq("u99")))!;
    const body = await res.json();
    expect(body.transactions).toEqual([]);
  });
});
