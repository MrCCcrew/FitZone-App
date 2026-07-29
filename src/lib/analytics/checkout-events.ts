import "server-only";

import { cookies } from "next/headers";
import { ANALYTICS_SESSION_COOKIE, ANALYTICS_VISITOR_COOKIE } from "@/lib/analytics/visitor-session";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";

type CheckoutStartedInput = {
  userId: string;
  entityType: "subscription" | "package" | "offer" | "order";
  entityId: string;
  entityName: string;
  value: number;
  currency: string;
  source: "membership_checkout" | "package_checkout" | "offer_checkout" | "store_checkout";
  paymentTransactionId?: string;
};

/** Best-effort only: analytics failures must never affect a payment attempt. */
export async function recordCheckoutStarted(input: CheckoutStartedInput) {
  try {
    const store = await cookies();
    await recordBusinessAnalyticsEvent({
      eventName: "checkout_started",
      ...input,
      visitorAnonymousId: store.get(ANALYTICS_VISITOR_COOKIE.name)?.value,
      sessionPublicId: store.get(ANALYTICS_SESSION_COOKIE.name)?.value,
      paymentTransactionId: input.paymentTransactionId,
      metadata: { source: input.source },
    });
  } catch (error) {
    console.error("[CHECKOUT_ANALYTICS_FAILED]", error instanceof Error ? error.message : "unknown_error");
  }
}
