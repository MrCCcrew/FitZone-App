import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const globalForChatPresence = globalThis as unknown as {
  fitzoneChatPresenceCache?: { expiresAt: number; payload: { online: boolean; onlineCount: number } };
};

export const dynamic = "force-dynamic";
export const revalidate = 10;

export async function GET() {
  try {
    const cached = globalForChatPresence.fitzoneChatPresenceCache;
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" },
      });
    }

    const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);
    const onlineCount = await db.supportPresence.count({
      where: {
        isOnline: true,
        lastSeenAt: { gte: onlineThreshold },
      },
    });

    const payload = {
      online: onlineCount > 0,
      onlineCount,
    };

    globalForChatPresence.fitzoneChatPresenceCache = {
      expiresAt: Date.now() + 10_000,
      payload,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    console.error("[CHAT_PRESENCE]", error);
    return NextResponse.json({ online: false, onlineCount: 0 });
  }
}
