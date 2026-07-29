import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { ANALYTICS_SESSION_COOKIE, ANALYTICS_VISITOR_COOKIE } from "@/lib/analytics/visitor-session";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";

const bodySchema = z.object({
  eventName: z.enum(["subscription_viewed", "package_viewed", "offer_viewed"]),
  entityId: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ignored: true, reason: "invalid_input" }, { status: 400 });

  try {
    const event = parsed.data;
    const entity = event.eventName === "offer_viewed"
      ? await db.offer.findUnique({ where: { id: event.entityId }, select: { id: true, title: true, isActive: true } })
      : await db.membership.findUnique({ where: { id: event.entityId }, select: { id: true, name: true, kind: true, isActive: true } });
    if (!entity || !entity.isActive) return NextResponse.json({ ignored: true, reason: "entity_not_found" }, { status: 404 });
    const entityKind = "kind" in entity ? entity.kind : undefined;
    if (event.eventName === "subscription_viewed" && entityKind !== "subscription") {
      return NextResponse.json({ ignored: true, reason: "entity_type_mismatch" }, { status: 400 });
    }
    if (event.eventName === "package_viewed" && entityKind !== "package") {
      return NextResponse.json({ ignored: true, reason: "entity_type_mismatch" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const user = await getCurrentAppUser();
    const result = await recordBusinessAnalyticsEvent({
      eventName: event.eventName,
      entityType: event.eventName === "subscription_viewed" ? "subscription" : event.eventName === "package_viewed" ? "package" : "offer",
      entityId: entity.id,
      entityName: "title" in entity ? entity.title : entity.name,
      category: entityKind ?? "offer",
      visitorAnonymousId: cookieStore.get(ANALYTICS_VISITOR_COOKIE.name)?.value,
      sessionPublicId: cookieStore.get(ANALYTICS_SESSION_COOKIE.name)?.value,
      ...(user?.id ? { userId: user.id } : {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[BUSINESS_ANALYTICS_ENDPOINT_FAILED]", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ recorded: false, ignored: false, reason: "analytics_error" });
  }
}
