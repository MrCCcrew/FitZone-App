import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function checkNutritionist() {
  const guard = await requireAdminFeature("nutrition");
  if ("error" in guard) return { error: guard.error, userId: null };
  return { error: null, userId: guard.session.user.id };
}

function generateToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return "NTR-" + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// GET — list own referral links + commission summary
export async function GET() {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const dbx = db as any;
  const [links, commissions, profile] = await Promise.all([
    dbx.nutritionReferralLink.findMany({
      where: { userId: userId! },
      orderBy: { createdAt: "desc" },
    }),
    dbx.nutritionCommission.findMany({
      where: { nutritionistUserId: userId! },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        userMembership: { select: { user: { select: { name: true } } } },
        nutritionSession: { select: { id: true, type: true, price: true, user: { select: { name: true } } } },
      },
    }),
    dbx.nutritionistProfile.findUnique({
      where: { userId: userId! },
      select: { commissionRate: true, commissionType: true },
    }),
  ]);

  const referralCommissions = commissions.filter((c: any) => c.userMembershipId !== null);
  const sessionCommissions = commissions.filter((c: any) => c.nutritionSessionId !== null);

  const totalEarned: number = commissions.reduce((sum: number, c: any) => sum + c.amount, 0);
  const pendingEarned: number = commissions.filter((c: any) => c.status === "earned").reduce((sum: number, c: any) => sum + c.amount, 0);

  const referralEarned: number = referralCommissions.reduce((sum: number, c: any) => sum + c.amount, 0);
  const sessionEarned: number = sessionCommissions.reduce((sum: number, c: any) => sum + c.amount, 0);

  return NextResponse.json({
    links,
    commissions,
    referralCommissions,
    sessionCommissions,
    summary: {
      totalEarned,
      pendingEarned,
      referralEarned,
      sessionEarned,
      count: commissions.length
    },
    commissionRate: profile?.commissionRate ?? 0,
    commissionType: profile?.commissionType ?? "percentage",
  });
}

// POST — create a new referral link
export async function POST(req: Request) {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const body = await req.json() as { label?: string };
  const label = String(body.label ?? "").trim() || null;

  // Generate a unique token
  const dbx = db as any;
  let token = generateToken();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await dbx.nutritionReferralLink.findUnique({ where: { token } });
    if (!existing) break;
    token = generateToken();
    attempts++;
  }

  const link = await dbx.nutritionReferralLink.create({
    data: { userId: userId!, token, label, isActive: true },
  });

  return NextResponse.json({ ok: true, link });
}

// PATCH — toggle isActive or update label
export async function PATCH(req: Request) {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const body = await req.json() as { id: string; isActive?: boolean; label?: string };
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const dbx = db as any;
  const link = await dbx.nutritionReferralLink.findUnique({ where: { id } });
  if (!link || link.userId !== userId!) {
    return NextResponse.json({ error: "الرابط غير موجود" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.label !== undefined) data.label = String(body.label).trim() || null;

  const updated = await dbx.nutritionReferralLink.update({ where: { id }, data });
  return NextResponse.json({ ok: true, link: updated });
}

// DELETE — remove a referral link
export async function DELETE(req: Request) {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const dbx = db as any;
  const link = await dbx.nutritionReferralLink.findUnique({ where: { id } });
  if (!link || link.userId !== userId!) {
    return NextResponse.json({ error: "الرابط غير موجود" }, { status: 404 });
  }

  await dbx.nutritionReferralLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
