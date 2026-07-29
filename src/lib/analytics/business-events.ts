import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";

export const BUSINESS_ANALYTICS_EVENTS = [
  "subscription_viewed",
  "package_viewed",
  "offer_viewed",
  "checkout_started",
  "payment_succeeded",
  "payment_failed",
  "membership_activated",
] as const;

export type BusinessAnalyticsEventName = (typeof BUSINESS_ANALYTICS_EVENTS)[number];

export type RecordBusinessAnalyticsEventResult = {
  recorded: boolean;
  ignored: boolean;
  eventId?: string;
  reason?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID_PATTERN = /^c[a-z0-9]{8,}$/i;
const SENSITIVE_VALUE_PATTERN = /(?:email|phone|cvv|token|secret|password|webhook|payload)/i;
const EVENT_METADATA_KEYS: Record<BusinessAnalyticsEventName, readonly string[]> = {
  subscription_viewed: [],
  package_viewed: [],
  offer_viewed: [],
  checkout_started: ["source"],
  payment_succeeded: ["paymentMethodType"],
  payment_failed: ["failureCategory"],
  membership_activated: [],
};

const inputSchema = z.object({
  eventName: z.enum(BUSINESS_ANALYTICS_EVENTS),
  // This is accepted only from an authenticated server flow, never from a public request body.
  userId: z.string().min(1).max(191).optional(),
  paymentTransactionId: z.string().min(1).max(191).optional(),
  visitorAnonymousId: z.string().max(191).optional(),
  sessionPublicId: z.string().max(191).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(120).optional(),
  entityName: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  value: z.number().finite().min(0).max(1_000_000_000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  success: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type BusinessAnalyticsEventInput = z.input<typeof inputSchema>;

function invalid(reason: string): RecordBusinessAnalyticsEventResult {
  return { recorded: false, ignored: true, reason };
}

function isSafeEntityId(value: string) {
  return value.length > 0 && !SENSITIVE_VALUE_PATTERN.test(value);
}

function sanitizeEntityName(value: string | undefined) {
  if (!value) return undefined;
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return sanitized && !SENSITIVE_VALUE_PATTERN.test(sanitized) ? sanitized : undefined;
}

function sanitizeMetadata(eventName: BusinessAnalyticsEventName, value: Record<string, unknown> | undefined) {
  if (!value) return undefined;
  const allowed = new Set(EVENT_METADATA_KEYS[eventName]);
  const output: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key) || typeof entry === "object" || typeof entry === "undefined") continue;
    if (typeof entry === "string") {
      const sanitized = entry.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);
      if (sanitized && !SENSITIVE_VALUE_PATTERN.test(sanitized)) output[key] = sanitized;
    } else if (typeof entry === "number" && Number.isFinite(entry)) {
      output[key] = entry;
    } else if (typeof entry === "boolean") {
      output[key] = entry;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

function validateEvent(input: z.output<typeof inputSchema>): string | null {
  const entityRequired = ["subscription_viewed", "package_viewed", "offer_viewed", "checkout_started", "payment_succeeded", "payment_failed", "membership_activated"] as const;
  if (entityRequired.includes(input.eventName) && (!input.entityId || !isSafeEntityId(input.entityId))) return "invalid_entity_id";

  const requiredTypes: Partial<Record<BusinessAnalyticsEventName, readonly string[]>> = {
    subscription_viewed: ["subscription"],
    package_viewed: ["package"],
    offer_viewed: ["offer"],
    checkout_started: ["subscription", "package", "offer", "order"],
    membership_activated: ["subscription", "package", "offer"],
  };
  const permittedTypes = requiredTypes[input.eventName];
  if (permittedTypes && !permittedTypes.includes(input.entityType ?? "")) return "invalid_entity_type";
  if (input.eventName === "payment_succeeded" && input.success === false) return "invalid_success";
  if (input.eventName === "payment_failed" && input.success === true) return "invalid_success";
  if (input.eventName === "membership_activated" && input.success === false) return "invalid_success";
  return null;
}

/**
 * Records one trusted server-side business event. Callers must supply userId only
 * from authenticated server code; this helper is never an HTTP request boundary.
 */
export async function recordBusinessAnalyticsEvent(input: unknown): Promise<RecordBusinessAnalyticsEventResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalid("invalid_input");
  const validationError = validateEvent(parsed.data);
  if (validationError) return invalid(validationError);

  try {
    const anonymousId = parsed.data.visitorAnonymousId;
    const publicSessionId = parsed.data.sessionPublicId;
    let visitor: { id: string } | null = null;
    let session: { id: string; visitorId: string } | null = null;
    if (anonymousId || publicSessionId) {
      if (anonymousId && UUID_PATTERN.test(anonymousId) && publicSessionId && SESSION_ID_PATTERN.test(publicSessionId)) {
        visitor = await db.analyticsVisitor.findUnique({ where: { anonymousId } });
        session = visitor ? await db.analyticsSession.findUnique({ where: { id: publicSessionId } }) : null;
        if (!visitor || !session || session.visitorId !== visitor.id) { visitor = null; session = null; }
      }
    }
    const paymentAllowed = ["checkout_started", "payment_succeeded", "payment_failed", "membership_activated"].includes(parsed.data.eventName);
    if (parsed.data.paymentTransactionId && !paymentAllowed) return invalid("payment_context_not_allowed");
    const payment = parsed.data.paymentTransactionId
      ? await db.paymentTransaction.findUnique({ where: { id: parsed.data.paymentTransactionId }, select: { id: true } })
      : null;
    if (parsed.data.paymentTransactionId && !payment) return invalid("invalid_payment_transaction");
    if (!visitor && !parsed.data.userId && !payment) return invalid("missing_analytics_context");
    if (payment && ["payment_succeeded", "payment_failed", "membership_activated"].includes(parsed.data.eventName)) {
      const existing = await db.analyticsEvent.findFirst({ where: { paymentTransactionId: payment.id, eventName: parsed.data.eventName }, select: { id: true } });
      if (existing) return invalid("duplicate");
    }

    const eventMetadata = sanitizeMetadata(parsed.data.eventName, parsed.data.metadata);
    const metadata = {
      ...(eventMetadata ?? {}),
      ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
      ...(parsed.data.currency ? { currency: parsed.data.currency } : {}),
      ...(parsed.data.eventName === "payment_succeeded" ? { success: true } : {}),
      ...(parsed.data.eventName === "payment_failed" ? { success: false } : {}),
      ...(parsed.data.eventName === "membership_activated" ? { success: true } : {}),
    };
    const event = await db.analyticsEvent.create({
      data: {
        ...(visitor ? { visitorId: visitor.id } : {}),
        ...(session ? { sessionId: session.id } : {}),
        ...(payment ? { paymentTransactionId: payment.id } : {}),
        ...(parsed.data.userId ? { userId: parsed.data.userId } : {}),
        eventName: parsed.data.eventName,
        eventCategory: parsed.data.category ?? "business",
        pagePath: "/",
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        entityName: sanitizeEntityName(parsed.data.entityName),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      },
    });
    return { recorded: true, ignored: false, eventId: event.id };
  } catch (error) {
    if (
      (error as { code?: string })?.code === "P2002" &&
      Boolean(parsed.data.paymentTransactionId) &&
      ["payment_succeeded", "payment_failed", "membership_activated"].includes(parsed.data.eventName)
    ) return invalid("duplicate");
    console.error("[BUSINESS_ANALYTICS_RECORD_FAILED]", error instanceof Error ? error.message : "unknown_error");
    return { recorded: false, ignored: false, reason: "analytics_error" };
  }
}
