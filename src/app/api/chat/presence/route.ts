import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);
    const onlineCount = await db.supportPresence.count({
      where: {
        isOnline: true,
        lastSeenAt: { gte: onlineThreshold },
      },
    });

    return NextResponse.json({
      online: onlineCount > 0,
      onlineCount,
    });
  } catch (error) {
    console.error("[CHAT_PRESENCE]", error);
    return NextResponse.json({ online: false, onlineCount: 0 });
  }
}
