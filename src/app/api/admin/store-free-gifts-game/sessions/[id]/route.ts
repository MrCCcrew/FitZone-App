import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const OVERRIDES_KEY = "gift_game_user_overrides";

async function saveOverride(userId: string, nextPlayableAt: string | null) {
  const record = await db.siteContent.findUnique({ where: { section: OVERRIDES_KEY } }).catch(() => null);
  let overrides: Record<string, string> = {};
  try { overrides = JSON.parse(record?.content ?? "{}") as Record<string, string>; } catch { /* noop */ }

  // null = allow immediately → store epoch (always in the past)
  overrides[userId] = nextPlayableAt ?? new Date(0).toISOString();

  await db.siteContent.upsert({
    where: { section: OVERRIDES_KEY },
    create: { section: OVERRIDES_KEY, content: JSON.stringify(overrides) },
    update: { content: JSON.stringify(overrides) },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFeature("store-free-gifts");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const dbx = db as any;

  const body = await req.json().catch(() => ({})) as { nextPlayableAt?: string | null };
  const nextPlayableAt: string | null = body.nextPlayableAt ?? null;

  const session = await dbx.storeFreeGiftsSession.findUnique({
    where: { id },
    select: { userId: true },
  }).catch(() => null);

  await dbx.storeFreeGiftsSession.update({
    where: { id },
    data: { status: "cancelled" },
  });

  if (session?.userId) {
    await saveOverride(session.userId as string, nextPlayableAt);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFeature("store-free-gifts");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const dbx = db as any;

  // Read nextPlayableAt from query param (optional)
  const url = new URL(req.url);
  const nextPlayableAtParam = url.searchParams.get("nextPlayableAt");
  const nextPlayableAt: string | null = nextPlayableAtParam ?? null;

  const session = await dbx.storeFreeGiftsSession.findUnique({
    where: { id },
    select: { userId: true },
  }).catch(() => null);

  await dbx.storeFreeGiftsSession.delete({ where: { id } }).catch(() => null);

  // Only store override if admin explicitly set a restriction date
  if (session?.userId && nextPlayableAt) {
    await saveOverride(session.userId as string, nextPlayableAt);
  }

  return NextResponse.json({ ok: true });
}
