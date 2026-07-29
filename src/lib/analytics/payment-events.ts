import "server-only";
import { db } from "@/lib/db";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";

function methodType(value: string | null) { return /wallet/i.test(value ?? "") ? "wallet" : /cash|cod/i.test(value ?? "") ? "cash" : /bnpl|installment/i.test(value ?? "") ? "bnpl" : /card|paymob|paytabs/i.test(value ?? "") ? "card" : "unknown"; }
function failureCategory(status: string) { return status === "cancelled" ? "cancelled" : status === "expired" ? "expired" : "unknown"; }

export async function recordPaymentStatusEvent(transactionId: string, status: "paid" | "failed" | "cancelled" | "expired") {
  try {
    const tx = await db.paymentTransaction.findUnique({ where: { id: transactionId }, select: { id: true, userId: true, membershipId: true, offerId: true, orderId: true, amount: true, currency: true, paymentMethod: true } });
    if (!tx) return;
    let entityType: "subscription" | "package" | "offer" | "order" | null = null, entityId: string | null = null, entityName = "";
    if (tx.orderId) { entityType = "order"; entityId = tx.orderId; entityName = `Order ${tx.orderId}`; }
    else if (tx.membershipId) { const m = await db.userMembership.findUnique({ where: { id: tx.membershipId }, include: { membership: { select: { id: true, name: true, kind: true } }, offer: { select: { id: true, title: true } } } }); if (m) { entityType = tx.offerId && m.offer ? "offer" : m.membership.kind === "package" ? "package" : "subscription"; entityId = entityType === "offer" ? m.offer!.id : m.membership.id; entityName = entityType === "offer" ? m.offer!.title : m.membership.name; } }
    if (!entityType || !entityId) return;
    await recordBusinessAnalyticsEvent({ eventName: status === "paid" ? "payment_succeeded" : "payment_failed", paymentTransactionId: tx.id, userId: tx.userId, entityType, entityId, entityName, category: entityType, value: tx.amount, currency: tx.currency, metadata: status === "paid" ? { paymentMethodType: methodType(tx.paymentMethod) } : { failureCategory: failureCategory(status) } });
  } catch (error) { console.error("[PAYMENT_ANALYTICS_FAILED]", error instanceof Error ? error.message : "unknown_error"); }
}
