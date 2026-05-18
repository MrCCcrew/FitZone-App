import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";

const COOKIE = "fitzone-game-token";

export async function POST() {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) return NextResponse.json({ error: "game_disabled" }, { status: 403 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return NextResponse.json({ error: "invalid_session" }, { status: 400 });

  let selected: string[] = [];
  try { selected = JSON.parse(session.selectedProductIds); } catch { selected = []; }
  if (selected.length === 0) return NextResponse.json({ error: "no_products_selected" }, { status: 400 });

  await dbx.storeFreeGiftsSession.update({
    where: { id: session.id },
    data: { status: "confirmed", confirmedAt: new Date() },
  });

  return NextResponse.json({ ok: true, selectedProductIds: selected });
}
