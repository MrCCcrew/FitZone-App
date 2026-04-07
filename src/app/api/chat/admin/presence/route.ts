import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const user = guard.session.user as { id?: string };
    if (!user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const presence = await db.supportPresence.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        isOnline: true,
        lastSeenAt: new Date(),
      },
      update: {
        isOnline: true,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json(presence);
  } catch (error) {
    console.error("[CHAT_ADMIN_PRESENCE]", error);
    return NextResponse.json({ error: "Failed to update support presence" }, { status: 500 });
  }
}
