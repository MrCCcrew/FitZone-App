import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { serializeMessages } from "@/lib/chatbot";

export async function POST(req: Request) {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const { sessionId, content } = await req.json();
    if (!sessionId || !content?.trim()) {
      return NextResponse.json({ error: "بيانات الرد غير مكتملة" }, { status: 400 });
    }

    const role = guard.role;
    const user = guard.session.user as { id?: string; name?: string | null };

    await db.chatSession.update({
      where: { id: sessionId },
      data: {
        mode: "live",
        status: "live",
        assignedToId: user.id,
        lastMessageAt: new Date(),
      },
    });

    await db.chatMessage.create({
      data: {
        sessionId,
        senderType: role === "admin" ? "admin" : "staff",
        senderName: user.name ?? (role === "admin" ? "الإدارة" : "الدعم"),
        content: content.trim(),
      },
    });

    const session = await db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        recommendedMembership: true,
      },
    });

    return NextResponse.json({
      ...session,
      messages: serializeMessages(session?.messages ?? []),
    });
  } catch (error) {
    console.error("[CHAT_ADMIN_MESSAGE]", error);
    return NextResponse.json({ error: "الخدمة غير متاحة مؤقتًا" }, { status: 500 });
  }
}
