import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdminFeature("store-campaigns");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") ?? "all";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = 25;

  const dbx = db as any;
  const where = statusFilter !== "all" ? { status: statusFilter } : {};

  const [claims, total] = await Promise.all([
    dbx.storeGiftCampaignClaim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        storeOrder: { select: { id: true, status: true, total: true } },
      },
    }),
    dbx.storeGiftCampaignClaim.count({ where }),
  ]);

  return NextResponse.json({ claims, total, page, limit });
}
