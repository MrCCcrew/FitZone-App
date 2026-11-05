import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: (name: string) => ({ value: name === "vid" ? "550e8400-e29b-41d4-a716-446655440000" : "ckanalyticsession123" }) })) }));
vi.mock("@/lib/analytics/visitor-session", () => ({ ANALYTICS_VISITOR_COOKIE: { name: "vid" }, ANALYTICS_SESSION_COOKIE: { name: "sid" } }));
vi.mock("@/lib/analytics/business-events", () => ({ recordBusinessAnalyticsEvent: vi.fn() }));
import { recordCheckoutStarted } from "@/lib/analytics/checkout-events";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";
describe("checkout analytics", () => {
 beforeEach(() => vi.clearAllMocks());
 it.each([
  ["subscription", "membership_checkout"], ["package", "package_checkout"], ["offer", "offer_checkout"], ["order", "store_checkout"],
 ] as const)("records a trusted %s checkout with final value", async (entityType, source) => {
  await recordCheckoutStarted({ userId: "server-user", entityType, entityId: "entity", entityName: "Trusted entity", value: 75, currency: "EGP", source });
  expect(recordBusinessAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "checkout_started", entityType, value: 75, currency: "EGP", metadata: { source }, userId: "server-user" }));
 });
 it("does not throw or leak payment data when analytics fails", async () => {
  vi.mocked(recordBusinessAnalyticsEvent).mockRejectedValueOnce(new Error("down"));
  await expect(recordCheckoutStarted({ userId: "server-user", entityType: "order", entityId: "order", entityName: "Order", value: 42, currency: "EGP", source: "store_checkout" })).resolves.toBeUndefined();
 });
});
