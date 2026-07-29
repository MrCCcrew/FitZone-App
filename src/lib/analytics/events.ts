export const ANALYTICS_EVENTS = [
  "page_view", "page_leave", "heartbeat", "subscription_view", "offer_view", "package_view",
  "subscription_click", "offer_click", "package_click", "ai_coach_open", "ai_coach_message",
  "ai_coach_response", "ai_coach_error", "signup_start", "signup_complete", "payment_start",
  "payment_success", "payment_failed",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === "string" && ANALYTICS_EVENTS.includes(value as AnalyticsEventName);
}
