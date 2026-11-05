import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ pending: null });

  const dbx = db as any;

  // Confirmed game session with no linked order = gift won but checkout not completed
  const session = await dbx.storeFreeGiftsSession.findFirst({
    where: { userId: user.id, status: "confirmed", storeOrderId: null },
    orderBy: { confirmedAt: "desc" },
    select: {
      id: true,
      confirmedAt: true,
      selectedProductIds: true,
      spinRewardType: true,
      spinRewardValue: true,
      giftSlotsCount: true,
    },
  }).catch(() => null);

  if (!session) return NextResponse.json({ pending: null });

  let productIds: string[] = [];
  try { productIds = JSON.parse(session.selectedProductIds as string); } catch { productIds = []; }

  // Fetch product names so the account page can re-add them to cart
  const products = productIds.length > 0
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, images: true },
      })
    : [];

  return NextResponse.json({
    pending: {
      confirmedAt: session.confirmedAt,
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        image: (() => { try { const imgs = JSON.parse(p.images ?? "[]") as string[]; return imgs[0] ?? null; } catch { return null; } })(),
      })),
      rewardType: session.spinRewardType,
      rewardValue: session.spinRewardValue,
    },
  });
}
