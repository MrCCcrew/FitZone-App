import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { serializeMessages } from "@/lib/chatbot";

export async function GET() {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const sessions = await db.chatSession.findMany({
      orderBy: { lastMessageAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        recommendedMembership: true,
      },
    });

    return NextResponse.json(
      sessions.map((session) => ({
        ...session,
        messages: serializeMessages(session.messages),
      })),
    );
  } catch (error) {
    console.error("[CHAT_ADMIN_SESSIONS]", error);
    return NextResponse.json([]);
  }
}
