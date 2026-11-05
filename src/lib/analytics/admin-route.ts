import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { parseAdminAnalyticsFilters } from "@/lib/analytics/admin-filters";

export async function withAnalyticsAccess(request: Request) {
  const guard = await requireAdminFeature("analytics_view");
  if ("error" in guard) return { response: guard.error } as const;
  try {
    return { filters: parseAdminAnalyticsFilters(new URL(request.url).searchParams) } as const;
  } catch (error) {
    return { response: NextResponse.json({ error: error instanceof Error ? error.message : "invalid_filters" }, { status: 400 }) } as const;
  }
}
