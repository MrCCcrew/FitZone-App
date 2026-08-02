import { NextResponse } from "next/server";
import { z } from "zod";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { getCurrentAppUser } from "@/lib/app-session";
import { finalizeVoiceSession, voiceQuotaEnabled, VoiceQuotaError } from "@/lib/ai-coach/voice/quota";

const schema = z.object({ sessionId: z.string().min(8).max(128), voiceSessionId: z.string().length(64), reason: z.enum(["user_ended", "quota_exhausted", "max_duration", "expired", "heartbeat_timeout", "connection_failed", "authorization_failed"]).default("user_ended") });

export async function POST(req: Request) {
  if (!voiceQuotaEnabled()) return NextResponse.json({ ok: true, legacy: true });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(await ownsCoachSession(parsed.data.sessionId))) return NextResponse.json({ errorCode: "SESSION_UNAVAILABLE" }, { status: 403 });
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ errorCode: "VOICE_LOGIN_REQUIRED" }, { status: 401 });
  try {
    return NextResponse.json(await finalizeVoiceSession({ ...parsed.data, userId: user.id }));
  } catch (error) {
    const errorCode = error instanceof VoiceQuotaError ? error.code : "VOICE_FINALIZE_UNAVAILABLE";
    return NextResponse.json({ errorCode }, { status: 409 });
  }
}
