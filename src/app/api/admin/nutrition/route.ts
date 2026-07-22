import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";
import { clearPublicApiCache } from "@/lib/public-cache";

async function checkAdmin() {
  const guard = await requireAdminFeature("nutrition");
  return "error" in guard
    ? { error: guard.error, role: null, userId: null }
    : { error: null, role: guard.role, userId: guard.session.user.id };
}

function formatProfile(p: {
  id: string;
  userId: string;
  name: string;
  bio: string | null;
  image: string | null;
  isActive: boolean;
  showOnHome: boolean;
  slotsJson: string | null;
  consultationFee: number;
  consultationFeeMember: number;
  followupFee: number;
  followupFeeMember: number;
  commissionRate?: number;
  commissionType?: string;
  sessionCommissionRate?: number;
  sessionCommissionType?: string;
  createdAt: Date;
  user: { id: string; name: string | null; email: string | null; phone: string | null } | null;
}) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    bio: p.bio,
    image: p.image,
    isActive: p.isActive,
    showOnHome: p.showOnHome,
    slots: p.slotsJson ? (JSON.parse(p.slotsJson) as { label: string; day: string; time: string }[]) : [],
    consultationFee: p.consultationFee,
    consultationFeeMember: p.consultationFeeMember,
    followupFee: p.followupFee,
    followupFeeMember: p.followupFeeMember,
    commissionRate: p.commissionRate ?? 0,
    commissionType: p.commissionType ?? "percentage",
    sessionCommissionRate: p.sessionCommissionRate ?? 0,
    sessionCommissionType: p.sessionCommissionType ?? "percentage",
    createdAt: p.createdAt.toISOString(),
    linkedUser: p.user,
  };
}

function formatSession(s: {
  id: string;
  type: string;
  status: string;
  isGymMember: boolean;
  price: number;
  formJson: string | null;
  selectedSlot: string | null;
  proposedSlots: string | null;
  doctorNote: string | null;
  paidAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string | null; email: string | null; phone: string | null; avatar: string | null };
  nutritionist: { id: string; name: string };
}) {
  return {
    id: s.id,
    type: s.type,
    status: s.status,
    isGymMember: s.isGymMember,
    price: s.price,
    formData: s.formJson ? JSON.parse(s.formJson) : null,
    selectedSlot: s.selectedSlot,
    proposedSlots: s.proposedSlots ? (JSON.parse(s.proposedSlots) as string[]) : [],
    doctorNote: s.doctorNote,
    paidAt: s.paidAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    user: s.user,
    nutritionist: s.nutritionist,
  };
}

// GET /api/admin/nutrition — list profiles or sessions
export async function GET(req: Request) {
  const { error, role, userId } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "sessions"; // profiles | sessions
  const status = searchParams.get("status") || "all";
  const ownOnly = searchParams.get("ownOnly") === "true" || role === "nutritionist";

  if (view === "profiles") {
    const profiles = await (db as any).nutritionistProfile.findMany({
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ profiles: profiles.map(formatProfile) });
  }

  if (view === "commissions") {
    const commissions = await (db as any).nutritionCommission.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        nutritionistUser: { select: { id: true, name: true, email: true } },
        nutritionReferralLink: { select: { token: true, label: true } },
        userMembership: { select: { id: true, membership: { select: { name: true } }, user: { select: { name: true, email: true } } } },
      },
    });
    return NextResponse.json({ commissions });
  }

  // Check if current admin has their own linked NutritionistProfile
  const ownProfile = await (db as any).nutritionistProfile.findFirst({ where: { userId }, select: { id: true } });
  const hasOwnProfile = !!ownProfile;

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;
  // If admin has own profile (is themselves a nutritionist), filter to their sessions only
  if (hasOwnProfile) {
    where.nutritionistId = ownProfile.id;
  }

  const sessions = await db.nutritionSession.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      nutritionist: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sessions: sessions.map(formatSession), hasOwnProfile });
}

// POST /api/admin/nutrition — create/update nutritionist profile
export async function POST(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    profileId?: string;
    userId: string;
    name: string;
    bio?: string;
    image?: string;
    isActive?: boolean;
    showOnHome?: boolean;
    slots?: { label: string; day: string; time: string }[];
    consultationFee?: number;
    consultationFeeMember?: number;
    followupFee?: number;
    followupFeeMember?: number;
    commissionRate?: number;
    commissionType?: string;
    sessionCommissionRate?: number;
    sessionCommissionType?: string;
  };

  if (!body.userId || !body.name) {
    return NextResponse.json({ error: "userId و name مطلوبان" }, { status: 400 });
  }

  // Validation for sessionCommissionRate
  if (body.sessionCommissionRate !== undefined) {
    const rate = body.sessionCommissionRate;
    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      return NextResponse.json({ error: "sessionCommissionRate يجب أن يكون رقم صحيح" }, { status: 400 });
    }
    if (rate < 0) {
      return NextResponse.json({ error: "sessionCommissionRate لا يمكن أن يكون سالب" }, { status: 400 });
    }
  }

  // Validation for sessionCommissionType
  if (body.sessionCommissionType !== undefined) {
    const type = body.sessionCommissionType;
    if (type !== "percentage" && type !== "fixed") {
      return NextResponse.json({ error: "sessionCommissionType يجب أن يكون 'percentage' أو 'fixed'" }, { status: 400 });
    }

    // If percentage, rate must be between 0 and 100
    if (type === "percentage" && body.sessionCommissionRate !== undefined) {
      const rate = body.sessionCommissionRate;
      if (rate > 100) {
        return NextResponse.json({ error: "عمولة النسبة المئوية يجب ألا تتجاوز 100%" }, { status: 400 });
      }
    }
  }

  // Validation for commissionRate (existing referral commission - don't change its rules)
  if (body.commissionRate !== undefined) {
    const rate = body.commissionRate;
    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      return NextResponse.json({ error: "commissionRate يجب أن يكون رقم صحيح" }, { status: 400 });
    }
    if (rate < 0) {
      return NextResponse.json({ error: "commissionRate لا يمكن أن يكون سالب" }, { status: 400 });
    }
  }

  // Validation for commissionType
  if (body.commissionType !== undefined) {
    const type = body.commissionType;
    if (type !== "percentage" && type !== "fixed") {
      return NextResponse.json({ error: "commissionType يجب أن يكون 'percentage' أو 'fixed'" }, { status: 400 });
    }

    // If percentage, rate must be between 0 and 100
    if (type === "percentage" && body.commissionRate !== undefined) {
      const rate = body.commissionRate;
      if (rate > 100) {
        return NextResponse.json({ error: "عمولة النسبة المئوية يجب ألا تتجاوز 100%" }, { status: 400 });
      }
    }
  }

  const data = {
    userId: body.userId,
    name: body.name,
    bio: body.bio ?? null,
    image: body.image ?? null,
    isActive: body.isActive ?? true,
    showOnHome: body.showOnHome ?? true,
    slotsJson: body.slots ? JSON.stringify(body.slots) : null,
    consultationFee: body.consultationFee ?? 400,
    consultationFeeMember: body.consultationFeeMember ?? 300,
    followupFee: body.followupFee ?? 100,
    followupFeeMember: body.followupFeeMember ?? 50,
    commissionRate: body.commissionRate ?? 0,
    commissionType: body.commissionType === "fixed" ? "fixed" : "percentage",
    sessionCommissionRate: body.sessionCommissionRate ?? 0,
    sessionCommissionType: body.sessionCommissionType === "fixed" ? "fixed" : "percentage",
  } as any;

  const dbx = db as any;
  let profile;
  if (body.profileId) {
    profile = await dbx.nutritionistProfile.update({
      where: { id: body.profileId },
      data,
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    await logAudit({ action: "update_nutritionist_profile", targetType: "NutritionistProfile", targetId: profile.id });
  } else {
    profile = await dbx.nutritionistProfile.create({
      data,
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    await logAudit({ action: "create_nutritionist_profile", targetType: "NutritionistProfile", targetId: profile.id });
  }

  await clearPublicApiCache();
  return NextResponse.json({ profile: formatProfile(profile) });
}

// PATCH /api/admin/nutrition — manage sessions (approve, reject, propose slots, complete)
export async function PATCH(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    sessionId: string;
    action: "approve" | "reject" | "propose_slots" | "complete" | "cancel";
    proposedSlots?: string[];
    doctorNote?: string;
  };

  if (!body.sessionId || !body.action) {
    return NextResponse.json({ error: "sessionId و action مطلوبان" }, { status: 400 });
  }

  const session = await db.nutritionSession.findUnique({ where: { id: body.sessionId } });
  if (!session) return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });

  let updateData: Record<string, unknown> = {};

  if (body.action === "approve") {
    updateData = { status: "approved", doctorNote: body.doctorNote ?? session.doctorNote };
  } else if (body.action === "reject") {
    updateData = { status: "rejected", doctorNote: body.doctorNote ?? null };
  } else if (body.action === "propose_slots") {
    if (!body.proposedSlots?.length) return NextResponse.json({ error: "proposedSlots مطلوب" }, { status: 400 });
    updateData = {
      status: "awaiting_slot",
      proposedSlots: JSON.stringify(body.proposedSlots),
      doctorNote: body.doctorNote ?? session.doctorNote,
    };
  } else if (body.action === "complete") {
    updateData = { status: "completed" };
  } else if (body.action === "cancel") {
    updateData = { status: "cancelled" };
  }

  const updated = await db.nutritionSession.update({
    where: { id: body.sessionId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      nutritionist: { select: { id: true, name: true } },
    },
  });

  await logAudit({ action: `nutrition_${body.action}`, targetType: "NutritionSession", targetId: body.sessionId });
  return NextResponse.json({ session: formatSession(updated) });
}

// DELETE /api/admin/nutrition — delete profile or session
export async function DELETE(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const profileId = searchParams.get("profileId");

  if (sessionId) {
    await db.nutritionSession.delete({ where: { id: sessionId } });
    await logAudit({ action: "delete_nutrition_session", targetType: "NutritionSession", targetId: sessionId });
    return NextResponse.json({ ok: true });
  }

  if (!profileId) return NextResponse.json({ error: "profileId أو sessionId مطلوب" }, { status: 400 });

  await db.nutritionistProfile.delete({ where: { id: profileId } });
  await logAudit({ action: "delete_nutritionist_profile", targetType: "NutritionistProfile", targetId: profileId });
  await clearPublicApiCache();
  return NextResponse.json({ ok: true });
}
