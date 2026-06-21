import { NextRequest, NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

type SiteContentCacheState = {
  fitzoneSiteContentCache?: { data: Record<string, unknown>; expiresAt: number };
};
const g = globalThis as unknown as SiteContentCacheState;
const CACHE_TTL_MS = 60_000;

function filterSections(
  data: Record<string, unknown>,
  sections: string[] | undefined,
): Record<string, unknown> {
  if (!sections?.length) return data;
  const out: Record<string, unknown> = {};
  for (const s of sections) if (s in data) out[s] = data[s];
  return out;
}

export async function GET(req: NextRequest) {
  const sections = req.nextUrl.searchParams.get("sections")?.split(",").filter(Boolean);

  const now = Date.now();
  const cached = g.fitzoneSiteContentCache;
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(filterSections(cached.data, sections));
  }

  try {
    const records = await db.siteContent.findMany();
    const result: Record<string, unknown> = {};
    for (const record of records) {
      try {
        result[record.section] = JSON.parse(record.content);
      } catch {
        result[record.section] = record.content;
      }
    }
    g.fitzoneSiteContentCache = { data: result, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(filterSections(result, sections));
  } catch (error) {
    console.error("[SITE_CONTENT_GET]", error);
    const fallback = g.fitzoneSiteContentCache?.data ?? {};
    return NextResponse.json(filterSections(fallback, sections));
  }
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
    delete g.fitzoneSiteContentCache;
    return NextResponse.json(record);
  } catch (error) {
    console.error("[SITE_CONTENT_PUT]", error);
    return NextResponse.json({ error: "تعذر حفظ محتوى الصفحة الآن." }, { status: 500 });
  }
}
