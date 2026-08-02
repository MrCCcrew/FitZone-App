import { NextResponse } from "next/server";
import { cleanupStaleVoiceSessions, voiceQuotaEnabled } from "@/lib/ai-coach/voice/quota";

// Run every minute or two. finalizeVoiceSession owns the atomic active ->
// finalized transition, so concurrent cron runs and client finalization are safe.
export async function GET(req: Request) {
  if (!voiceQuotaEnabled()) return NextResponse.json({ ok: true, disabled: true });
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  if (new URL(req.url).searchParams.get("secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const finalized = await cleanupStaleVoiceSessions();
  return NextResponse.json({ ok: true, scanned: finalized.length, finalized: finalized.filter((result) => result.finalized).length });
}
