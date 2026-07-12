import { NextRequest, NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

const SECTION = "gift_only_products";

async function checkAdmin() {
  const guard = await requireAdminFeature("products");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  const record = await db.siteContent.findUnique({ where: { section: SECTION } });
  let ids: string[] = [];
  if (record) {
    try {
      const parsed = JSON.parse(record.content);
      ids = Array.isArray(parsed.ids) ? parsed.ids : [];
    } catch { ids = []; }
  }
  return NextResponse.json({ ids });
}

export async function PUT(req: NextRequest) {
  const err = await checkAdmin();
  if (err) return err;

  const body = await req.json() as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? (body.ids as string[]).filter((x) => typeof x === "string") : [];

  await db.siteContent.upsert({
    where: { section: SECTION },
    create: { section: SECTION, content: JSON.stringify({ ids }) },
    update: { content: JSON.stringify({ ids }) },
  });

  clearPublicApiCache();
  return NextResponse.json({ ok: true, ids });
}
