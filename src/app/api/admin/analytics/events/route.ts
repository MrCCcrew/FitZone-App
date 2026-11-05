import { handleAdminAnalyticsEvents } from "@/lib/analytics/admin-events-handler";

export async function GET(request: Request) {
  return handleAdminAnalyticsEvents(request);
}
