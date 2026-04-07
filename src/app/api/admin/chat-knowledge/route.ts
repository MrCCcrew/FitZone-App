import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

function parseKeywords(value: string | null) {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

async function checkAdmin() {
  const guard = await requireAdminFeature("knowledge");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  try {
    const err = await checkAdmin();
    if (err) return err;

    const entries = await db.chatKnowledgeEntry.findMany({
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json(
      entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        keywords: parseKeywords(entry.keywords),
        answer: entry.answer,
        priority: entry.priority,
        active: entry.isActive,
        updatedAt: entry.updatedAt,
      })),
    );
  } catch (error) {
    console.error("[CHAT_KNOWLEDGE_GET]", error);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const err = await checkAdmin();
    if (err) return err;

    const body = await req.json();
    const { title, category, keywords, answer, priority, active } = body;

    if (!title?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: "title and answer are required" }, { status: 400 });
    }

    const entry = await db.chatKnowledgeEntry.create({
      data: {
        title: title.trim(),
        category: category?.trim() || "general",
        keywords: JSON.stringify(Array.isArray(keywords) ? keywords.filter(Boolean) : []),
        answer: answer.trim(),
        priority: Number(priority ?? 0),
        isActive: active !== false,
      },
    });

    return NextResponse.json({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      keywords: parseKeywords(entry.keywords),
      answer: entry.answer,
      priority: entry.priority,
      active: entry.isActive,
      updatedAt: entry.updatedAt,
    });
  } catch (error) {
    console.error("[CHAT_KNOWLEDGE_POST]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const err = await checkAdmin();
    if (err) return err;

    const body = await req.json();
    const { id, title, category, keywords, answer, priority, active } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await db.chatKnowledgeEntry.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(category !== undefined ? { category: String(category).trim() || "general" } : {}),
        ...(keywords !== undefined
          ? { keywords: JSON.stringify(Array.isArray(keywords) ? keywords.filter(Boolean) : []) }
          : {}),
        ...(answer !== undefined ? { answer: String(answer).trim() } : {}),
        ...(priority !== undefined ? { priority: Number(priority) || 0 } : {}),
        ...(active !== undefined ? { isActive: Boolean(active) } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CHAT_KNOWLEDGE_PATCH]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const err = await checkAdmin();
    if (err) return err;

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await db.chatKnowledgeEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CHAT_KNOWLEDGE_DELETE]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}
