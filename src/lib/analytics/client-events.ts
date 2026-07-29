export type BusinessViewEventName = "subscription_viewed" | "package_viewed" | "offer_viewed";

const pendingViews = new Set<string>();

/** Fire-and-forget client helper. Call only when a user opens a concrete entity detail/flow. */
export function trackBusinessView(eventName: BusinessViewEventName, entityId: string) {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/admin") || !entityId) return;
  const key = `${eventName}:${entityId}`;
  if (pendingViews.has(key)) return;
  pendingViews.add(key);
  void fetch("/api/analytics/business-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventName, entityId }),
  }).catch(() => null).finally(() => pendingViews.delete(key));
}
