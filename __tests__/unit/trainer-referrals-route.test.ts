import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  findTrainer: vi.fn(),
  findLinks: vi.fn(),
  aggregateCommissions: vi.fn(),
  findLinkByToken: vi.fn(),
  createLink: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({ requireAdminFeature: mocks.requireAdminFeature }));
vi.mock("@/lib/db", () => ({
  db: {
    trainer: { findFirst: mocks.findTrainer },
    trainerReferralLink: {
      findMany: mocks.findLinks,
      findUnique: mocks.findLinkByToken,
      create: mocks.createLink,
    },
    trainerCommission: { aggregate: mocks.aggregateCommissions },
  },
}));

import { GET, POST } from "@/app/api/admin/trainer-referrals/route";

function access(role: string, id = `${role}-1`) {
  return {
    session: { user: { id, email: `${id}@test.local`, name: role, role, permissions: [] } },
    role,
    permissions: [],
  };
}

function request(method: "GET" | "POST", body?: unknown) {
  return new NextRequest("http://localhost/api/admin/trainer-referrals", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("trainer referrals API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLinks.mockResolvedValue([]);
    mocks.aggregateCommissions.mockResolvedValue({ _sum: { amount: 0 } });
    mocks.findLinkByToken.mockResolvedValue(null);
    mocks.createLink.mockResolvedValue({ id: "link-1", userId: "trainer-1", token: "TRAINERTOKEN", label: null, isActive: true });
  });

  it.each(["staff", "accountant", "partner", "contracts_manager", "agent", "nutritionist"])("rejects %s GET and POST with 403 and no trainer token", async (role) => {
    mocks.requireAdminFeature.mockResolvedValue(access(role));

    const getResponse = await GET(request("GET"));
    const postResponse = await POST(request("POST", { label: "private" }));

    expect(getResponse).toBeDefined();
    expect(postResponse).toBeDefined();
    expect(getResponse!.status).toBe(403);
    expect(postResponse!.status).toBe(403);
    await expect(getResponse!.json()).resolves.toEqual({ error: "Forbidden" });
    await expect(postResponse!.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mocks.findLinks).not.toHaveBeenCalled();
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it.each(["admin", "head_coach"])("allows %s to list referral links with the current response shape", async (role) => {
    mocks.requireAdminFeature.mockResolvedValue(access(role));
    mocks.findLinks.mockResolvedValue([{
      id: "link-1", userId: "trainer-1", token: "TRAINERTOKEN", label: "Summer", clickCount: 2, isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"), user: { name: "Trainer", email: "trainer@test.local" },
    }]);

    const response = await GET(request("GET"));
    expect(response).toBeDefined();
    const body = await response!.json();

    expect(response!.status).toBe(200);
    expect(body).toEqual({ links: [expect.objectContaining({
      id: "link-1", userId: "trainer-1", trainerName: "Trainer", trainerEmail: "trainer@test.local",
      token: "TRAINERTOKEN", label: "Summer", clickCount: 2, isActive: true, totalEarned: 0, pendingCommission: 0, settledCommission: 0,
    })] });
  });

  it("allows a trainer to list only their own links and create a link for themselves", async () => {
    mocks.requireAdminFeature.mockResolvedValue(access("trainer", "trainer-1"));
    mocks.findTrainer.mockResolvedValue({ userId: "trainer-1" });

    const getResponse = await GET(request("GET"));
    const postResponse = await POST(request("POST", { label: "My link", userId: "other-user" }));

    expect(getResponse).toBeDefined();
    expect(postResponse).toBeDefined();
    expect(getResponse!.status).toBe(200);
    expect(mocks.findLinks).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "trainer-1" } }));
    expect(postResponse!.status).toBe(200);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "trainer-1", label: "My link" }) }));
  });

  it("keeps a forbidden requireAdminFeature response opaque and token-free", async () => {
    mocks.requireAdminFeature.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });

    const response = await GET(request("GET"));

    expect(response).toBeDefined();
    expect(response!.status).toBe(403);
    expect(await response!.json()).toEqual({ error: "Forbidden" });
    expect(mocks.findLinks).not.toHaveBeenCalled();
  });
});
