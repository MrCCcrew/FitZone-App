import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";
const dbx = db as any;

function generateToken() {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function requireTrainerReferralAccess() {
  const auth = await requireAdminFeature("trainers");
  if (!("error" in auth)) return auth;
  return requireAdminFeature("settings");
}

// GET /api/admin/trainer-referrals?view=commissions&trainerUserId=X
export async function GET(req: NextRequest) {
  const auth = await requireTrainerReferralAccess();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");
  const trainerUserId = searchParams.get("trainerUserId");

  const canSeeAll = auth.role === "admin" || auth.role === "head_coach";
  const selfId = auth.session.user.id;

  // Non-admin/head_coach: resolve own trainer profile to get userId
  let ownTrainerUserId: string | null = null;
  if (!canSeeAll) {
    const profile = await db.trainer.findFirst({
      where: { userId: selfId },
      select: { userId: true },
    });
    if (!profile?.userId) return NextResponse.json({ links: [], commissions: [] });
    ownTrainerUserId = profile.userId;
  }

  if (view === "commissions") {
    const where: Record<string, unknown> = {};
    if (canSeeAll && trainerUserId) where.trainerUserId = trainerUserId;
    else if (!canSeeAll) where.trainerUserId = ownTrainerUserId!;

    const commissions = await dbx.trainerCommission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        trainerUser: { select: { id: true, name: true, email: true } },
        trainerReferralLink: { select: { id: true, token: true, label: true } },
        userMembership: {
          select: {
            id: true,
            paymentAmount: true,
            membership: { select: { name: true } },
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    const rows = commissions.map((c: any) => ({
      id: c.id,
      trainerUserId: c.trainerUserId,
      trainerName: c.trainerUser?.name ?? "—",
      trainerEmail: c.trainerUser?.email ?? "—",
      linkToken: c.trainerReferralLink?.token ?? null,
      linkLabel: c.trainerReferralLink?.label ?? null,
      customerName: c.userMembership?.user?.name ?? null,
      customerEmail: c.userMembership?.user?.email ?? null,
      membershipName: c.userMembership?.membership?.name ?? null,
      amount: c.amount,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ commissions: rows });
  }

  // Default: list referral links
  const where: Record<string, unknown> = {};
  if (!canSeeAll) where.userId = ownTrainerUserId!;
  else if (trainerUserId) where.userId = trainerUserId;

  const links = await dbx.trainerReferralLink.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const rows = await Promise.all(links.map(async (l: any) => {
    const agg = await dbx.trainerCommission.aggregate({
      where: { trainerReferralLinkId: l.id },
      _sum: { amount: true },
    });
    const pending = await dbx.trainerCommission.aggregate({
      where: { trainerReferralLinkId: l.id, status: "earned" },
      _sum: { amount: true },
    });
    return {
      id: l.id,
      userId: l.userId,
      trainerName: l.user?.name ?? "—",
      trainerEmail: l.user?.email ?? "—",
      token: l.token,
      label: l.label,
      clickCount: l.clickCount,
      isActive: l.isActive,
      createdAt: l.createdAt.toISOString(),
      totalEarned: agg._sum.amount ?? 0,
      pendingCommission: pending._sum.amount ?? 0,
      settledCommission: (agg._sum.amount ?? 0) - (pending._sum.amount ?? 0),
    };
  }));

  return NextResponse.json({ links: rows });
}

// POST /api/admin/trainer-referrals  { label?, userId? (admin only) }
export async function POST(req: NextRequest) {
  const auth = await requireTrainerReferralAccess();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const canSeeAll = auth.role === "admin" || auth.role === "head_coach";

  let targetUserId: string;
  if (canSeeAll && body.userId) {
    targetUserId = String(body.userId);
  } else {
    // Trainer creates for themselves — resolve own user ID
    const profile = await db.trainer.findFirst({
      where: { userId: auth.session.user.id },
      select: { userId: true },
    });
    if (!profile?.userId) {
      return NextResponse.json({ error: "لا يوجد حساب مدربة مرتبط بهذا الحساب." }, { status: 403 });
    }
    targetUserId = profile.userId;
  }

  const label = body.label ? String(body.label).trim() : null;

  let token = generateToken();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await dbx.trainerReferralLink.findUnique({ where: { token } });
    if (!existing) break;
    token = generateToken();
    attempts++;
  }

  const link = await dbx.trainerReferralLink.create({
    data: { userId: targetUserId, token, label, isActive: true },
  });

  return NextResponse.json({ link });
}

// PATCH /api/admin/trainer-referrals  { id, label?, isActive?, action, trainerUserId? }
export async function PATCH(req: NextRequest) {
  const auth = await requireTrainerReferralAccess();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const { id, action } = body;
  const canSeeAll = auth.role === "admin" || auth.role === "head_coach";

  if (action === "settle") {
    if (!canSeeAll) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    const trainerUserId = body.trainerUserId;
    if (!trainerUserId) return NextResponse.json({ error: "trainerUserId مطلوب" }, { status: 400 });
    await dbx.trainerCommission.updateMany({
      where: { trainerUserId, status: "earned" },
      data: { status: "settled", settledAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const link = await dbx.trainerReferralLink.findUnique({ where: { id }, select: { userId: true } });
  if (!link) return NextResponse.json({ error: "لينك غير موجود" }, { status: 404 });

  if (!canSeeAll && link.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if ("label" in body) updates.label = body.label ?? null;
  if ("isActive" in body) updates.isActive = Boolean(body.isActive);

  const updated = await dbx.trainerReferralLink.update({ where: { id }, data: updates });
  return NextResponse.json({ link: updated });
}

// DELETE /api/admin/trainer-referrals?id=X
export async function DELETE(req: NextRequest) {
  const auth = await requireTrainerReferralAccess();
  if ("error" in auth) return auth.error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const link = await dbx.trainerReferralLink.findUnique({ where: { id }, select: { userId: true } });
  if (!link) return NextResponse.json({ error: "لينك غير موجود" }, { status: 404 });

  const canSeeAll = auth.role === "admin" || auth.role === "head_coach";
  if (!canSeeAll && link.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbx.trainerReferralLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
