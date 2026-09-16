import { NextRequest, NextResponse } from "next/server";
import { db, asDbTransactionClient } from "@/lib/db";
import { settleCommissionsTx } from "@/lib/commissions/commission-settlement-service";
import { requireAdminFeature } from "@/lib/admin-guard";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";
const dbx = db as any;

function generateToken() {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function requireStaffReferralAccess() {
  const referralAuth = await requireAdminFeature("referrals");
  if (!("error" in referralAuth)) return referralAuth;
  return requireAdminFeature("settings");
}

// GET /api/admin/staff-referrals?view=commissions&staffUserId=X
export async function GET(req: NextRequest) {
  const auth = await requireStaffReferralAccess();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");
  const staffUserId = searchParams.get("staffUserId");

  const isAdmin = auth.role === "admin" || auth.role === "staff" && auth.permissions?.includes("settings");
  const selfId = auth.session.user.id;

  if (view === "commissions") {
    const where: Record<string, unknown> = {};
    if (isAdmin && staffUserId) where.staffUserId = staffUserId;
    else if (!isAdmin) where.staffUserId = selfId;

    const commissions = await dbx.staffCommission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        staffUser: { select: { id: true, name: true, email: true } },
        staffReferralLink: { select: { id: true, token: true, label: true } },
      },
    });

    const rows = commissions.map((c: any) => ({
      id: c.id,
      staffUserId: c.staffUserId,
      staffName: c.staffUser?.name ?? "—",
      staffEmail: c.staffUser?.email ?? "—",
      linkToken: c.staffReferralLink?.token ?? null,
      linkLabel: c.staffReferralLink?.label ?? null,
      amount: c.amount,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ commissions: rows });
  }

  // Default: list referral links
  const where: Record<string, unknown> = {};
  if (!isAdmin) where.userId = selfId;
  else if (staffUserId) where.userId = staffUserId;

  const links = await dbx.staffReferralLink.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { commissions: true } },
    },
  });

  const rows = await Promise.all(links.map(async (l: any) => {
    const agg = await dbx.staffCommission.aggregate({
      where: { staffReferralLinkId: l.id },
      _sum: { amount: true },
    });
    const pending = await dbx.staffCommission.aggregate({
      where: { staffReferralLinkId: l.id, status: "earned" },
      _sum: { amount: true },
    });
    return {
      id: l.id,
      userId: l.userId,
      staffName: l.user?.name ?? "—",
      staffEmail: l.user?.email ?? "—",
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

// POST /api/admin/staff-referrals  { label? }  — create link for self (staff) or { userId, label } (admin)
export async function POST(req: NextRequest) {
  const auth = await requireStaffReferralAccess();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const isAdmin = auth.role === "admin";
  const targetUserId = isAdmin && body.userId ? String(body.userId) : auth.session.user.id;
  const label = body.label ? String(body.label).trim() : null;

  let token = generateToken();
  // Ensure uniqueness
  let attempts = 0;
  while (attempts < 10) {
    const existing = await dbx.staffReferralLink.findUnique({ where: { token } });
    if (!existing) break;
    token = generateToken();
    attempts++;
  }

  const link = await dbx.staffReferralLink.create({
    data: { userId: targetUserId, token, label, isActive: true },
  });

  return NextResponse.json({ link });
}

// PATCH /api/admin/staff-referrals  { id, label?, isActive?, action }
export async function PATCH(req: NextRequest) {
  const auth = await requireStaffReferralAccess();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const { id, action } = body;

  if (action === "settle") {
    /* COMMISSION_SETTLEMENT_PHASE_A_STAFF */

    const canSettle =
      auth.role === "admin" ||
      (auth.role === "staff" && auth.permissions?.includes("settings"));

    if (!canSettle) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const staffUserId =
      typeof body.staffUserId === "string" ? body.staffUserId.trim() : "";

    if (!staffUserId) {
      return NextResponse.json(
        { error: "staffUserId مطلوب" },
        { status: 400 },
      );
    }

    const eligible = await dbx.staffCommission.findMany({
      where: { staffUserId, status: "earned" },
      select: { id: true },
    });

    if (!eligible.length) {
      return NextResponse.json({ ok: true, settledCount: 0 });
    }

    const result = await db.$transaction(async (tx) =>
      settleCommissionsTx(asDbTransactionClient(tx), {
        commissionType: "staff",
        beneficiaryId: staffUserId,
        commissionIds: eligible.map((row: { id: string }) => row.id),
        actorUserId: auth.session.user.id,
        paymentMethod: "admin_manual",
        notes: "تسوية عمولات إحالة الموظف",
      }),
    );

    return NextResponse.json({
      ok: true,
      settledCount: result.payout.items.length,
      payoutId: result.payout.id,
    });
  }

  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const link = await dbx.staffReferralLink.findUnique({ where: { id }, select: { userId: true } });
  if (!link) return NextResponse.json({ error: "لينك غير موجود" }, { status: 404 });

  const isAdmin = auth.role === "admin";
  if (!isAdmin && link.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if ("label" in body) updates.label = body.label ?? null;
  if ("isActive" in body) updates.isActive = Boolean(body.isActive);

  const updated = await dbx.staffReferralLink.update({ where: { id }, data: updates });
  return NextResponse.json({ link: updated });
}

// DELETE /api/admin/staff-referrals?id=X
export async function DELETE(req: NextRequest) {
  const auth = await requireStaffReferralAccess();
  if ("error" in auth) return auth.error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const link = await dbx.staffReferralLink.findUnique({ where: { id }, select: { userId: true } });
  if (!link) return NextResponse.json({ error: "لينك غير موجود" }, { status: 404 });

  const isAdmin = auth.role === "admin";
  if (!isAdmin && link.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbx.staffReferralLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
