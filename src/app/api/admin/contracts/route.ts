import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

// Cast until `prisma db push` regenerates the client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbx = db as any;

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FZ-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function checkAccess() {
  const guard = await requireAdminFeature("contracts");
  if ("error" in guard) return { error: guard.error, role: null, userId: null };
  return { error: null, role: guard.role, userId: guard.session.user.id };
}

type CommRow = { amount: number; status: string };
type RefRow = { convertedAt: Date | null };

// GET: list agents with stats (admin + contracts_manager) OR own profile (agent)
export async function GET(req: Request) {
  const { error, role, userId } = await checkAccess();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");
  const agentId = searchParams.get("agentId");

  // Agent role: return their own data only
  if (role === "agent") {
    const agent = await dbx.salesAgent.findFirst({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        referrals: {
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
          orderBy: { createdAt: "desc" },
        },
        commissions: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!agent) return NextResponse.json({ error: "لم يتم العثور على حساب المندوب." }, { status: 404 });

    return NextResponse.json({ agent: formatAgentDetail(agent) });
  }

  // Manager/Admin: single agent detail
  if (agentId) {
    const agent = await dbx.salesAgent.findUnique({
      where: { id: agentId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        referrals: {
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
          orderBy: { createdAt: "desc" },
        },
        commissions: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!agent) return NextResponse.json({ error: "المندوب غير موجود." }, { status: 404 });
    return NextResponse.json({ agent: formatAgentDetail(agent) });
  }

  // Commissions list
  if (view === "commissions") {
    const commissions = await dbx.salesAgentCommission.findMany({
      include: {
        agent: { select: { id: true, name: true } },
        userMembership: {
          include: {
            user: { select: { name: true, email: true } },
            membership: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      commissions: commissions.map((c: {
        id: string; agentId: string; agent: { name: string };
        amount: number; status: string; settledAt: Date | null; createdAt: Date;
        userMembership: { user: { name: string | null; email: string | null }; membership: { name: string }; id: string };
        userMembershipId: string;
      }) => ({
        id: c.id,
        agentId: c.agentId,
        agentName: c.agent.name,
        amount: c.amount,
        status: c.status,
        settledAt: c.settledAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        customerName: c.userMembership.user.name ?? "",
        customerEmail: c.userMembership.user.email ?? "",
        membershipName: c.userMembership.membership.name,
        userMembershipId: c.userMembershipId,
      })),
    });
  }

  // All agents list
  const agents = await dbx.salesAgent.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      _count: { select: { referrals: true, commissions: true } },
      referrals: { select: { convertedAt: true } },
      commissions: { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    agents: agents.map((a: {
      id: string; userId: string; name: string; referralCode: string;
      commissionRate: number; commissionType: string;
      clientDiscountType: string; clientDiscountValue: number; maxClientDiscount: number | null;
      isActive: boolean; notes: string | null; createdAt: Date;
      user: { id: string; name: string | null; email: string | null; phone: string | null };
      referrals: RefRow[]; commissions: CommRow[];
    }) => ({
      id: a.id,
      userId: a.userId,
      name: a.name,
      referralCode: a.referralCode,
      commissionRate: a.commissionRate,
      commissionType: a.commissionType,
      clientDiscountType: a.clientDiscountType,
      clientDiscountValue: a.clientDiscountValue,
      maxClientDiscount: a.maxClientDiscount,
      isActive: a.isActive,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
      user: a.user,
      referralsCount: a.referrals.length,
      convertedCount: a.referrals.filter((r: RefRow) => r.convertedAt !== null).length,
      totalEarned: a.commissions.reduce((s: number, c: CommRow) => s + c.amount, 0),
      pendingCommission: a.commissions.filter((c: CommRow) => c.status === "earned").reduce((s: number, c: CommRow) => s + c.amount, 0),
      settledCommission: a.commissions.filter((c: CommRow) => c.status === "settled").reduce((s: number, c: CommRow) => s + c.amount, 0),
    })),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatAgentDetail(agent: any) {
  const comms = agent.commissions as CommRow[];
  return {
    id: agent.id,
    name: agent.name,
    referralCode: agent.referralCode,
    commissionRate: agent.commissionRate,
    commissionType: agent.commissionType,
    clientDiscountType: agent.clientDiscountType,
    clientDiscountValue: agent.clientDiscountValue,
    user: agent.user,
    referrals: agent.referrals.map((r: {
      id: string; user: { id: string; name: string | null; email: string | null; phone: string | null };
      convertedAt: Date | null; totalSpent: number; createdAt: Date;
    }) => ({
      id: r.id, user: r.user,
      convertedAt: r.convertedAt?.toISOString() ?? null,
      totalSpent: r.totalSpent, createdAt: r.createdAt.toISOString(),
    })),
    commissions: agent.commissions.map((c: {
      id: string; amount: number; status: string; settledAt: Date | null; createdAt: Date;
    }) => ({
      id: c.id, amount: c.amount, status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    totalEarned: comms.reduce((s: number, c: CommRow) => s + c.amount, 0),
    pendingCommission: comms.filter((c: CommRow) => c.status === "earned").reduce((s: number, c: CommRow) => s + c.amount, 0),
    settledCommission: comms.filter((c: CommRow) => c.status === "settled").reduce((s: number, c: CommRow) => s + c.amount, 0),
  };
}

// POST: create agent account + user
export async function POST(req: Request) {
  const { error, role } = await checkAccess();
  if (error) return error;

  const body = (await req.json()) as {
    name?: string; email?: string; phone?: string; password?: string;
    commissionRate?: number; commissionType?: string;
    clientDiscountType?: string; clientDiscountValue?: number;
    maxClientDiscount?: number | null; notes?: string;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: "الاسم مطلوب." }, { status: 400 });
  if (!body.email?.trim()) return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
  if (!body.password?.trim() || body.password.length < 6)
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });

  const existing = await db.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
  if (existing) return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل." }, { status: 400 });

  let referralCode = generateReferralCode();
  while (await dbx.salesAgent.findUnique({ where: { referralCode } })) {
    referralCode = generateReferralCode();
  }

  const { hashSync } = await import("bcryptjs");
  const hashedPassword = hashSync(body.password.trim(), 10);

  const user = await db.user.create({
    data: {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      password: hashedPassword,
      role: "agent",
      adminAccess: true,
      emailVerified: new Date(),
    },
  });

  const agent = await dbx.salesAgent.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      referralCode,
      commissionRate: Number(body.commissionRate ?? 0),
      commissionType: body.commissionType ?? "percentage",
      clientDiscountType: body.clientDiscountType ?? "percentage",
      clientDiscountValue: Number(body.clientDiscountValue ?? 0),
      maxClientDiscount: body.maxClientDiscount != null ? Number(body.maxClientDiscount) : null,
      notes: body.notes?.trim() || null,
    },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });

  void logAudit({ action: "create_agent", targetType: "sales_agent", targetId: agent.id as string, details: { name: agent.name, role } });

  return NextResponse.json({ success: true, agent }, { status: 201 });
}

// PATCH: update agent or settle commissions
export async function PATCH(req: Request) {
  const { error, role } = await checkAccess();
  if (error) return error;

  const body = (await req.json()) as {
    agentId?: string; action?: "settle_commissions"; commissionIds?: string[];
    commissionRate?: number; commissionType?: string;
    clientDiscountType?: string; clientDiscountValue?: number;
    maxClientDiscount?: number | null; isActive?: boolean; notes?: string;
  };

  if (!body.agentId) return NextResponse.json({ error: "معرّف المندوب مطلوب." }, { status: 400 });

  const agent = await dbx.salesAgent.findUnique({ where: { id: body.agentId } });
  if (!agent) return NextResponse.json({ error: "المندوب غير موجود." }, { status: 404 });

  if (body.action === "settle_commissions") {
    if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const ids = Array.isArray(body.commissionIds) ? body.commissionIds : [];
    await dbx.salesAgentCommission.updateMany({
      where: { agentId: agent.id, ...(ids.length ? { id: { in: ids } } : { status: "earned" }) },
      data: { status: "settled", settledAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }

  const updateData: Record<string, unknown> = {};
  if (body.commissionRate !== undefined && role === "admin") updateData.commissionRate = Number(body.commissionRate);
  if (body.commissionType !== undefined && role === "admin") updateData.commissionType = body.commissionType;
  if (body.clientDiscountType !== undefined && role === "admin") updateData.clientDiscountType = body.clientDiscountType;
  if (body.clientDiscountValue !== undefined && role === "admin") updateData.clientDiscountValue = Number(body.clientDiscountValue);
  if (body.maxClientDiscount !== undefined && role === "admin") updateData.maxClientDiscount = body.maxClientDiscount != null ? Number(body.maxClientDiscount) : null;
  if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
  if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;

  await dbx.salesAgent.update({ where: { id: agent.id }, data: updateData });
  return NextResponse.json({ success: true });
}

// DELETE: remove agent (admin only)
export async function DELETE(req: Request) {
  const { error, role } = await checkAccess();
  if (error) return error;
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { agentId } = (await req.json()) as { agentId?: string };
  if (!agentId) return NextResponse.json({ error: "معرّف المندوب مطلوب." }, { status: 400 });

  const agent = await dbx.salesAgent.findUnique({ where: { id: agentId } });
  if (!agent) return NextResponse.json({ error: "المندوب غير موجود." }, { status: 404 });

  await dbx.salesAgent.delete({ where: { id: agentId } });
  await db.user.update({ where: { id: agent.userId as string }, data: { adminAccess: false, role: "member" } });

  return NextResponse.json({ success: true });
}
