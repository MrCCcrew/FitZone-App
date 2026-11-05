import { handleAdminAnalyticsEvents } from "@/lib/analytics/admin-events-handler";

// Neutral alias for Mobile Safari content blockers. Keep /events for compatibility.
export async function GET(request: Request) {
  return handleAdminAnalyticsEvents(request);
}
