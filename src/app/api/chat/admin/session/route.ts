import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { serializeMessages } from "@/lib/chatbot";

export async function DELETE(req: Request) {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

    await db.chatSession.delete({ where: { id: sessionId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CHAT_ADMIN_SESSION_DELETE]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const { sessionId, status, mode, assignToMe } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const user = guard.session.user as { id?: string; name?: string | null };

    const updated = await db.chatSession.update({
      where: { id: sessionId },
      data: {
        status: status ?? undefined,
        mode: mode ?? undefined,
        assignedToId: assignToMe ? user.id : undefined,
        lastMessageAt: new Date(),
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        recommendedMembership: true,
      },
    });

    if (assignToMe) {
      await db.chatMessage.create({
        data: {
          sessionId,
          senderType: "system",
          senderName: "System",
          content: `${user.name ?? "الدعم"} انضم للمحادثة الآن.`,
        },
      });
    }

    return NextResponse.json({
      ...updated,
      messages: serializeMessages(updated.messages),
    });
  } catch (error) {
    console.error("[CHAT_ADMIN_SESSION]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}
