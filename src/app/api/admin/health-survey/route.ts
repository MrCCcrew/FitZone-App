import { NextRequest, NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/admin/health-survey?userId=X
export async function GET(req: NextRequest) {
  const guard = await requireAdminFeature("customers");
  if ("error" in guard) return guard.error;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ responses: [] });

  try {
    const dbx = db as any;
    const responses = await dbx.healthResponse.findMany({
      where: { userId },
      include: {
        question: {
          select: { id: true, title: true, prompt: true, allowReason: true, sortOrder: true },
        },
      },
      orderBy: { question: { sortOrder: "asc" } },
    });

    return NextResponse.json({
      responses: responses.map((r: any) => ({
        questionId: r.questionId,
        questionTitle: r.question.title,
        questionPrompt: r.question.prompt,
        allowReason: r.question.allowReason,
        answer: r.answer,
        reason: r.reason ?? null,
        answeredAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[ADMIN_HEALTH_SURVEY_GET]", error);
    return NextResponse.json({ responses: [] });
  }
}
