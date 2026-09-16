import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAiCoachEvent } from "@/lib/analytics/ai-coach-events";

const schema = z.object({
  sessionId: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const limit = applyRateLimit(
    `analytics-ai-coach-open:${getClientIp(req)}`,
    30,
    60_000,
  );

  if (!limit.ok) {
    return new NextResponse(null, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ignored: true }, { status: 400 });
  }

  if (!(await ownsCoachSession(parsed.data.sessionId))) {
    return NextResponse.json({ ignored: true }, { status: 403 });
  }

  const session = await db.chatSession.findUnique({
    where: { id: parsed.data.sessionId },
    select: { id: true, userId: true },
  });

  if (!session) {
    return NextResponse.json({ ignored: true }, { status: 404 });
  }

  const result = await recordAiCoachEvent({
    eventName: "ai_coach_open",
    chatSessionId: session.id,
    userId: session.userId,
  });

  return NextResponse.json(result);
}
