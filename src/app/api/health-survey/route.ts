import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/health-survey — save survey answers for current user
export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      answers: Array<{ questionId: string; answer: boolean; reason?: string | null }>;
    };

    if (!Array.isArray(body.answers) || body.answers.length === 0) {
      return NextResponse.json({ error: "لا توجد إجابات." }, { status: 400 });
    }

    const dbx = db as any;

    // Upsert each answer (update if already answered, create otherwise)
    await Promise.all(
      body.answers.map((item) =>
        dbx.healthResponse.upsert({
          where: { userId_questionId: { userId: user.id, questionId: item.questionId } },
          update: {
            answer: item.answer,
            reason: item.answer && item.reason?.trim() ? item.reason.trim() : null,
          },
          create: {
            userId: user.id,
            questionId: item.questionId,
            answer: item.answer,
            reason: item.answer && item.reason?.trim() ? item.reason.trim() : null,
          },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[HEALTH_SURVEY_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ الإجابات." }, { status: 500 });
  }
}

// GET /api/health-survey — get current user's survey answers
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ responses: [] });
  }

  try {
    const dbx = db as any;
    const responses = await dbx.healthResponse.findMany({
      where: { userId: user.id },
      include: { question: { select: { id: true, title: true, allowReason: true } } },
      orderBy: { question: { sortOrder: "asc" } },
    });

    return NextResponse.json({
      responses: responses.map((r: any) => ({
        questionId: r.questionId,
        questionTitle: r.question.title,
        allowReason: r.question.allowReason,
        answer: r.answer,
        reason: r.reason ?? null,
        answeredAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[HEALTH_SURVEY_GET]", error);
    return NextResponse.json({ responses: [] });
  }
}
