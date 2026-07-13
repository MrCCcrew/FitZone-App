import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFeature("store-free-gifts");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const dbx = db as any;

  await dbx.storeFreeGiftsSession.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFeature("store-free-gifts");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const dbx = db as any;

  await dbx.storeFreeGiftsSession.update({
    where: { id },
    data: { status: "cancelled" },
  });

  return NextResponse.json({ ok: true });
}
