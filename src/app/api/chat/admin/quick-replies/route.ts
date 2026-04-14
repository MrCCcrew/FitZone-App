import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const replies = await db.quickReply.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(replies);
  } catch (error) {
    console.error("[QUICK_REPLIES_GET]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const { label, content, sortOrder } = await req.json();
    if (!label?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "label and content are required" }, { status: 400 });
    }

    const reply = await db.quickReply.create({
      data: {
        label: label.trim(),
        content: content.trim(),
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      },
    });
    return NextResponse.json(reply);
  } catch (error) {
    console.error("[QUICK_REPLIES_POST]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const guard = await requireAdminFeature("chat");
    if ("error" in guard) return guard.error;

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await db.quickReply.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[QUICK_REPLIES_DELETE]", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}
