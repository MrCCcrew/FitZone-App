import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initializeChatSession, serializeChatSession } from "@/lib/chatbot";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "ar";

    if (!sessionId) {
      return NextResponse.json({ error: "معرف الجلسة مطلوب." }, { status: 400 });
    }

    const session = await db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        recommendedMembership: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "جلسة المحادثة غير موجودة." }, { status: 404 });
    }

    return NextResponse.json(await serializeChatSession(session, lang));
  } catch (error) {
    console.error("[CHAT_SESSION_GET]", error);
    return NextResponse.json({ error: "الخدمة غير متاحة مؤقتًا.", messages: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`chat-session:${clientIp}`, 10, 10 * 60 * 1000);

    if (!limit.ok) {
      return NextResponse.json(
        { error: "تم إنشاء جلسات كثيرة في وقت قصير. حاول مرة أخرى بعد قليل.", messages: [] },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const lang = body && body.lang === "en" ? "en" : "ar";
    const session = await db.chatSession.create({
      data: {
        status: "open",
        mode: "bot",
      },
    });

    const initialized = await initializeChatSession(session.id, lang);

    return NextResponse.json(
      await serializeChatSession((initialized ?? session) as typeof initialized, lang),
    );
  } catch (error) {
    console.error("[CHAT_SESSION_POST]", error);
    return NextResponse.json({ error: "الخدمة غير متاحة مؤقتًا.", messages: [] }, { status: 500 });
  }
}
