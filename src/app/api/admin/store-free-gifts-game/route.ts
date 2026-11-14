import { NextResponse } from "next/server";
import { getGameSettings, type StoreFreeGiftsGameSettings } from "@/lib/store-free-gifts-game-settings";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

const SECTION = "store_free_gifts_game";

export async function GET() {
  const { error } = await requireAdminFeature("store-free-gifts");
  if (error) return error;
  const settings = await getGameSettings();
  const dbx = db as any;
  const totalSessions = await dbx.storeFreeGiftsSession.count().catch(() => 0);
  const confirmedSessions = await dbx.storeFreeGiftsSession.count({ where: { status: "confirmed" } }).catch(() => 0);
  return NextResponse.json({ settings, stats: { totalSessions, confirmedSessions } });
}

export async function PUT(req: Request) {
  const { error } = await requireAdminFeature("store-free-gifts");
  if (error) return error;
  const body = await req.json() as StoreFreeGiftsGameSettings;
  await db.siteContent.upsert({
    where: { section: SECTION },
    create: { section: SECTION, content: JSON.stringify(body) },
    update: { content: JSON.stringify(body) },
  });
  return NextResponse.json({ ok: true });
}
