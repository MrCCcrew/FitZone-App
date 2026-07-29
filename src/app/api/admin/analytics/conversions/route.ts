import { NextResponse } from "next/server";
import { withAnalyticsAccess } from "@/lib/analytics/admin-route";
import { getAnalyticsConversions } from "@/lib/analytics/admin-queries";

export async function GET(request: Request) {
  const access = await withAnalyticsAccess(request);
  if ("response" in access) return access.response;
  return NextResponse.json(await getAnalyticsConversions(access.filters));
}
