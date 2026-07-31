import { NextResponse } from "next/server";
import { withAnalyticsAccess } from "@/lib/analytics/admin-route";
import { getAnalyticsEvents } from "@/lib/analytics/admin-queries";

/** Shared read-only handler retained by both /events and the Safari-safe alias. */
export async function handleAdminAnalyticsEvents(request: Request) {
  const access = await withAnalyticsAccess(request);
  if ("response" in access) return access.response;
  return NextResponse.json(await getAnalyticsEvents(access.filters));
}
