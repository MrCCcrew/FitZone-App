import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBotReply, serializeMessages } from "@/lib/chatbot";

export async function POST(req: Request) {
  try {
    const { sessionId, content, visitorName, visitorPhone } = await req.json();

    if (!sessionId || !content?.trim()) {
      return NextResponse.json({ error: "بيانات الرسالة غير مكتملة" }, { status: 400 });
    }

    const session = await db.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: "جلسة المحادثة غير موجودة" }, { status: 404 });
    }

    await db.chatSession.update({
      where: { id: sessionId },
      data: {
        visitorName: visitorName?.trim() || session.visitorName,
        visitorPhone: visitorPhone?.trim() || session.visitorPhone,
        lastMessageAt: new Date(),
      },
    });

    await db.chatMessage.create({
      data: {
        sessionId,
        senderType: "user",
        senderName: visitorName?.trim() || "زائر",
        content: content.trim(),
      },
    });

    const updatedSession = await db.chatSession.findUnique({ where: { id: sessionId } });
    if (updatedSession?.mode !== "live") {
      await generateBotReply(sessionId, content.trim());
    }

    const payload = await db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        recommendedMembership: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json({
      ...payload,
      messages: serializeMessages(payload?.messages ?? []),
    });
  } catch (error) {
    console.error("[CHAT_MESSAGE_POST]", error);
    return NextResponse.json({ error: "الخدمة غير متاحة مؤقتًا", messages: [] }, { status: 200 });
  }
}
