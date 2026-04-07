import { NextRequest, NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

export async function GET(req: NextRequest) {
  const sections = req.nextUrl.searchParams.get("sections")?.split(",").filter(Boolean);

  const records = await db.siteContent.findMany({
    where: sections?.length ? { section: { in: sections } } : undefined,
  });

  const result: Record<string, unknown> = {};
  for (const record of records) {
    try {
      result[record.section] = JSON.parse(record.content);
    } catch {
      result[record.section] = record.content;
    }
  }

  return NextResponse.json(result);
}

export async function PUT(req: Request) {
  try {
    const guard = await requireAdminFeature("site-content");
    if ("error" in guard) return guard.error;

    const { section, content } = await req.json();
    if (!section || content === undefined) {
      return NextResponse.json({ error: "اسم القسم والمحتوى مطلوبان." }, { status: 400 });
    }

    const payload = JSON.stringify(content);
    const record = await db.siteContent.upsert({
      where: { section },
      update: { content: payload },
      create: { section, content: payload },
    });

    clearPublicApiCache();
    return NextResponse.json(record);
  } catch (error) {
    console.error("[SITE_CONTENT_PUT]", error);
    return NextResponse.json({ error: "تعذر حفظ محتوى الصفحة الآن." }, { status: 500 });
  }
}
