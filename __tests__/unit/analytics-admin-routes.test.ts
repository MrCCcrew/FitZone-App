import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdminFeature, overview } = vi.hoisted(() => ({ requireAdminFeature: vi.fn(), overview: vi.fn() }));
vi.mock("@/lib/admin-guard", () => ({ requireAdminFeature }));
vi.mock("@/lib/analytics/admin-queries", () => ({ getAnalyticsOverview: overview }));

import { GET } from "@/app/api/admin/analytics/overview/route";

describe("admin analytics overview route", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("returns 401/403 from the server-side guard", async () => {
    requireAdminFeature.mockResolvedValueOnce({ error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(new Request("http://localhost/api/admin/analytics/overview")))?.status).toBe(401);
    requireAdminFeature.mockResolvedValueOnce({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await GET(new Request("http://localhost/api/admin/analytics/overview")))?.status).toBe(403);
  });
  it("allows analytics_view and rejects invalid filters", async () => {
    requireAdminFeature.mockResolvedValue({ role: "staff", permissions: ["analytics_view"] });
    overview.mockResolvedValue({ traffic: { visitors: 0 } });
    expect((await GET(new Request("http://localhost/api/admin/analytics/overview?from=2026-01-01&to=2026-01-02")))?.status).toBe(200);
    expect((await GET(new Request("http://localhost/api/admin/analytics/overview?timezone=invalid/timezone")))?.status).toBe(400);
  });
});
