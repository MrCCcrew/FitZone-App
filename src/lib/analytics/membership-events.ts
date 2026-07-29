import "server-only";
import { db } from "@/lib/db";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";

export async function recordMembershipActivatedEvent(userMembershipId: string, paymentTransactionId?: string) {
  try {
    const membership = await db.userMembership.findUnique({ where: { id: userMembershipId }, include: { membership: { select: { id: true, name: true, kind: true } }, offer: { select: { id: true, title: true } } } });
    if (!membership || membership.status !== "active") return;
    const transaction = paymentTransactionId
      ? await db.paymentTransaction.findUnique({ where: { id: paymentTransactionId }, select: { amount: true, currency: true } })
      : null;
    const entityType = membership.offer ? "offer" : membership.membership.kind === "package" ? "package" : "subscription";
    await recordBusinessAnalyticsEvent({ eventName: "membership_activated", userId: membership.userId, entityType, entityId: membership.offer?.id ?? membership.membership.id, entityName: membership.offer?.title ?? membership.membership.name, category: entityType, success: true, ...(paymentTransactionId ? { paymentTransactionId } : {}), ...(transaction ? { value: transaction.amount, currency: transaction.currency } : {}) });
  } catch (error) { console.error("[MEMBERSHIP_ANALYTICS_FAILED]", error instanceof Error ? error.message : "unknown_error"); }
}
