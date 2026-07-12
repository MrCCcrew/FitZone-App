import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";

const COOKIE = "fitzone-game-token";

export async function POST(req: Request) {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) return NextResponse.json({ error: "game_disabled" }, { status: 403 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const { productId, action } = await req.json() as { productId: string; action: "add" | "remove" };

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  if (session.step < 3) return NextResponse.json({ error: "wrong_step" }, { status: 400 });

  let selected: string[] = [];
  try { selected = JSON.parse(session.selectedProductIds); } catch { selected = []; }

  if (action === "remove") {
    selected = selected.filter(id => id !== productId);
  } else {
    if (selected.length >= session.giftSlotsCount) return NextResponse.json({ error: "slots_full" }, { status: 400 });
    if (selected.includes(productId)) return NextResponse.json({ ok: true, selectedProductIds: selected });

    // Verify product is valid (active, in stock, eligible — includes gift-only products)
    let giftOnlyIds: string[] = [];
    const giftOnlyRecord = await db.siteContent.findUnique({ where: { section: "gift_only_products" } });
    if (giftOnlyRecord) {
      try {
        const parsed = JSON.parse(giftOnlyRecord.content) as { ids?: unknown };
        giftOnlyIds = Array.isArray(parsed.ids) ? (parsed.ids as string[]).filter((x) => typeof x === "string") : [];
      } catch { giftOnlyIds = []; }
    }
    const allEligibleIds = [...new Set([...settings.eligibleGiftProductIds, ...giftOnlyIds])];
    const whereIds = allEligibleIds.length > 0 ? { id: { in: allEligibleIds } } : {};
    const product = await db.product.findFirst({
      where: { id: productId, isActive: true, stock: { gt: 0 }, deletedAt: null, ...whereIds },
      select: { id: true },
    });
    if (!product) return NextResponse.json({ error: "product_not_eligible" }, { status: 400 });
    selected.push(productId);
  }

  await dbx.storeFreeGiftsSession.update({ where: { id: session.id }, data: { selectedProductIds: JSON.stringify(selected) } });
  return NextResponse.json({ ok: true, selectedProductIds: selected });
}
