import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBotReply, serializeChatSession } from "@/lib/chatbot";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { z } from "zod";

const messageSchema = z.object({ sessionId: z.string().min(8).max(128), content: z.string().trim().min(1).max(1800), visitorName: z.string().trim().max(100).optional(), visitorPhone: z.string().trim().max(40).optional(), lang: z.enum(["ar", "en"]).optional() });

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`chat-message:${clientIp}`, 25, 5 * 60 * 1000);

    if (!limit.ok) {
      return NextResponse.json(
        { error: "تم إرسال رسائل كثيرة في وقت قصير. حاول مرة أخرى بعد قليل.", messages: [] },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = messageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid chat message." }, { status: 400 });
    const { sessionId, content, visitorName, visitorPhone, lang } = parsed.data;
    if (!(await ownsCoachSession(sessionId))) return NextResponse.json({ error: "Session unavailable." }, { status: 403 });

    if (!sessionId || !content?.trim()) {
      return NextResponse.json({ error: "بيانات الرسالة غير مكتملة." }, { status: 400 });
    }

    const session = await db.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: "جلسة المحادثة غير موجودة." }, { status: 404 });
    }

    await db.chatSession.update({
      where: { id: sessionId },
      data: {
        visitorName: visitorName || session.visitorName,
        visitorPhone: visitorPhone || session.visitorPhone,
        lastMessageAt: new Date(),
      },
    });

    await db.chatMessage.create({
      data: {
        sessionId,
        senderType: "user",
        senderName: visitorName?.trim() || "العميل",
        content,
      },
    });

    const updatedSession = await db.chatSession.findUnique({ where: { id: sessionId } });
    if (updatedSession?.mode !== "live") {
      await generateBotReply(sessionId, content, lang === "en" ? "en" : "ar");
    }

    const payload = await db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        recommendedMembership: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json(await serializeChatSession(payload, lang === "en" ? "en" : "ar"));
  } catch (error) {
    console.error("[CHAT_MESSAGE_POST]", error);
    return NextResponse.json({ error: "الخدمة غير متاحة مؤقتًا.", messages: [] }, { status: 500 });
  }
}
