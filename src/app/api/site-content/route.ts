import { NextResponse, NextRequest } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

// GET /api/site-content?sections=hero,contact,announcements
export async function GET(req: NextRequest) {
  const sections = req.nextUrl.searchParams.get("sections")?.split(",").filter(Boolean);

  const records = await db.siteContent.findMany({
    where: sections?.length ? { section: { in: sections } } : undefined,
  });

  const result: Record<string, unknown> = {};
  for (const r of records) {
    try { result[r.section] = JSON.parse(r.content); }
    catch { result[r.section] = r.content; }
  }

  return NextResponse.json(result);
}

// PUT /api/site-content  — admin only
export async function PUT(req: Request) {
  const guard = await requireAdminFeature("site-content");
  if ("error" in guard) return guard.error;

  const { section, content } = await req.json();
  if (!section || content === undefined) {
    return NextResponse.json({ error: "section و content مطلوبان" }, { status: 400 });
  }

  const record = await db.siteContent.upsert({
    where:  { section },
    update: { content: JSON.stringify(content) },
    create: { section, content: JSON.stringify(content) },
  });

  return NextResponse.json(record);
}
