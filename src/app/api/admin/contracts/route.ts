import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbx = db as any;

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FZ-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePartnerToken(): string {
  return randomBytes(6).toString("base64url").toUpperCase().slice(0, 8);
}

async function checkAccess() {
  const guard = await requireAdminFeature("contracts");
  if ("error" in guard) return { error: guard.error, role: null, userId: null };
  return { error: null, role: guard.role, userId: guard.session.user.id };
}

type CommRow = { amount: number; status: string };
type RefRow = { convertedAt: Date | null };

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { error, role, userId } = await checkAccess();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");
  const agentId = searchParams.get("agentId");
  const managerId = searchParams.get("managerId");

  // ── Agent: own dashboard ──
  if (role === "agent") {
    const agent = await dbx.salesAgent.findFirst({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        manager: { select: { id: true, name: true } },
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

  // ── ContractsManager: own dashboard ──
  if (role === "contracts_manager") {
    // Single agent detail for manager
    if (agentId) {
      const myMgrId = await getManagerId(userId!);
      const agent = await dbx.salesAgent.findFirst({
        where: { id: agentId, managerId: myMgrId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          manager: { select: { id: true, name: true } },
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

    // Manager's agents commissions only
    if (view === "commissions") {
      const mid = await getManagerId(userId!);
      if (!mid) return NextResponse.json({ commissions: [] });
      const commissions = await dbx.salesAgentCommission.findMany({
        where: { agent: { managerId: mid } },
        include: {
          agent: { select: { id: true, name: true } },
          userMembership: {
            include: { user: { select: { name: true, email: true } }, membership: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({
        commissions: (commissions as {
          id: string; agentId: string; agent: { name: string }; amount: number; status: string;
          settledAt: Date | null; createdAt: Date; userMembershipId: string;
          userMembership: { user: { name: string | null; email: string | null }; membership: { name: string } };
        }[]).map((c) => ({
          id: c.id, agentId: c.agentId, agentName: c.agent.name, amount: c.amount,
          status: c.status, settledAt: c.settledAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(), userMembershipId: c.userMembershipId,
          customerName: c.userMembership.user.name ?? "", customerEmail: c.userMembership.user.email ?? "",
          membershipName: c.userMembership.membership.name,
        })),
      });
    }

    // Manager's own commissions
    if (view === "manager_commissions") {
      const mid = await getManagerId(userId!);
      if (!mid) return NextResponse.json({ managerCommissions: [] });
      const comms = await dbx.managerCommission.findMany({
        where: { managerId: mid },
        include: {
          agentCommission: {
            include: {
              agent: { select: { name: true } },
              userMembership: { include: { user: { select: { name: true, email: true } }, membership: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ managerCommissions: comms.map(formatManagerCommission) });
    }

    // Manager's managed partners
    if (view === "partners") {
      const mid = await getManagerId(userId!);
      if (!mid) return NextResponse.json({ partners: [] });
      const partners = await dbx.partner.findMany({
        where: { managerId: mid },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          affiliateLinks: { select: { token: true, label: true }, where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { codes: true, affiliateLinks: true } },
          commissions: { select: { amount: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ partners: formatPartnerList(partners) });
    }

    if (view === "partner_commissions") {
      const mid = await getManagerId(userId!);
      if (!mid) return NextResponse.json({ partnerCommissions: [] });
      const comms = await dbx.managerPartnerCommission.findMany({
        where: { managerId: mid },
        include: {
          manager: { select: { id: true, name: true } },
          partnerCommission: {
            include: {
              partner: { select: { name: true } },
              userMembership: { include: { user: { select: { name: true, email: true } }, membership: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ partnerCommissions: comms.map(formatPartnerCommission) });
    }

    // Manager's own profile + their agents
    const manager = await dbx.contractsManager.findFirst({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        commissions: { orderBy: { createdAt: "desc" } },
        agents: {
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            referrals: { select: { convertedAt: true } },
            commissions: { select: { amount: true, status: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!manager) return NextResponse.json({ error: "لم يتم العثور على حساب المدير." }, { status: 404 });
    const mgrComms = manager.commissions as CommRow[];
    return NextResponse.json({
      manager: {
        id: manager.id, name: manager.name,
        commissionType: manager.commissionType, commissionRate: manager.commissionRate,
        isActive: manager.isActive, user: manager.user,
        pendingCommission: mgrComms.filter((c: CommRow) => c.status === "earned").reduce((s: number, c: CommRow) => s + c.amount, 0),
        settledCommission: mgrComms.filter((c: CommRow) => c.status === "settled").reduce((s: number, c: CommRow) => s + c.amount, 0),
        totalEarned: mgrComms.reduce((s: number, c: CommRow) => s + c.amount, 0),
        agents: formatAgentList(manager.agents, manager.name as string),
      },
    });
  }

  // ── Admin ──

  if (agentId) {
    const agent = await dbx.salesAgent.findUnique({
      where: { id: agentId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        manager: { select: { id: true, name: true } },
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

  if (managerId) {
    const manager = await dbx.contractsManager.findUnique({
      where: { id: managerId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        commissions: { orderBy: { createdAt: "desc" } },
        agents: {
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            referrals: { select: { convertedAt: true } },
            commissions: { select: { amount: true, status: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!manager) return NextResponse.json({ error: "المدير غير موجود." }, { status: 404 });
    const mgrComms = manager.commissions as CommRow[];
    return NextResponse.json({
      manager: {
        id: manager.id, name: manager.name,
        commissionType: manager.commissionType, commissionRate: manager.commissionRate,
        isActive: manager.isActive, notes: manager.notes, user: manager.user,
        createdAt: (manager.createdAt as Date).toISOString(),
        pendingCommission: mgrComms.filter((c: CommRow) => c.status === "earned").reduce((s: number, c: CommRow) => s + c.amount, 0),
        settledCommission: mgrComms.filter((c: CommRow) => c.status === "settled").reduce((s: number, c: CommRow) => s + c.amount, 0),
        totalEarned: mgrComms.reduce((s: number, c: CommRow) => s + c.amount, 0),
        agents: formatAgentList(manager.agents, manager.name as string),
      },
    });
  }

  if (view === "managers") {
    const managers = await dbx.contractsManager.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        agents: { select: { id: true } },
        commissions: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      managers: (managers as {
        id: string; userId: string; name: string; commissionType: string;
        commissionRate: number; isActive: boolean; notes: string | null; createdAt: Date;
        user: { id: string; name: string | null; email: string | null; phone: string | null };
        agents: { id: string }[]; commissions: CommRow[];
      }[]).map((m) => ({
        id: m.id, userId: m.userId, name: m.name,
        commissionType: m.commissionType, commissionRate: m.commissionRate,
        isActive: m.isActive, notes: m.notes, createdAt: m.createdAt.toISOString(),
        user: m.user, agentsCount: m.agents.length,
        totalEarned: m.commissions.reduce((s: number, c: CommRow) => s + c.amount, 0),
        pendingCommission: m.commissions.filter((c: CommRow) => c.status === "earned").reduce((s: number, c: CommRow) => s + c.amount, 0),
        settledCommission: m.commissions.filter((c: CommRow) => c.status === "settled").reduce((s: number, c: CommRow) => s + c.amount, 0),
      })),
    });
  }

  if (view === "commissions") {
    const commissions = await dbx.salesAgentCommission.findMany({
      include: {
        agent: { select: { id: true, name: true } },
        userMembership: {
          include: { user: { select: { name: true, email: true } }, membership: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      commissions: (commissions as {
        id: string; agentId: string; agent: { name: string }; amount: number; status: string;
        settledAt: Date | null; createdAt: Date; userMembershipId: string;
        userMembership: { user: { name: string | null; email: string | null }; membership: { name: string } };
      }[]).map((c) => ({
        id: c.id, agentId: c.agentId, agentName: c.agent.name, amount: c.amount,
        status: c.status, settledAt: c.settledAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(), userMembershipId: c.userMembershipId,
        customerName: c.userMembership.user.name ?? "",
        customerEmail: c.userMembership.user.email ?? "",
        membershipName: c.userMembership.membership.name,
      })),
    });
  }

  if (view === "manager_commissions") {
    const comms = await dbx.managerCommission.findMany({
      include: {
        manager: { select: { id: true, name: true } },
        agentCommission: {
          include: {
            agent: { select: { name: true } },
            userMembership: { include: { user: { select: { name: true, email: true } }, membership: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ managerCommissions: comms.map(formatManagerCommission) });
  }

  if (view === "partners") {
    const partners = await dbx.partner.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        manager: { select: { id: true, name: true } },
        affiliateLinks: { select: { token: true, label: true }, where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { codes: true, affiliateLinks: true } },
        commissions: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ partners: formatPartnerList(partners, true) });
  }

  if (view === "partner_commissions") {
    const comms = await dbx.managerPartnerCommission.findMany({
      include: {
        manager: { select: { id: true, name: true } },
        partnerCommission: {
          include: {
            partner: { select: { name: true } },
            userMembership: { include: { user: { select: { name: true, email: true } }, membership: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ partnerCommissions: comms.map(formatPartnerCommission) });
  }

  // All agents list
  const agents = await dbx.salesAgent.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true } },
      referrals: { select: { convertedAt: true } },
      commissions: { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    agents: (agents as {
      id: string; userId: string; name: string; referralCode: string;
      commissionRate: number; commissionType: string; clientDiscountType: string;
      clientDiscountValue: number; maxClientDiscount: number | null; isActive: boolean;
      notes: string | null; createdAt: Date; managerId: string | null;
      user: { id: string; name: string | null; email: string | null; phone: string | null };
      manager: { id: string; name: string } | null;
      referrals: RefRow[]; commissions: CommRow[];
    }[]).map((a) => formatAgentRow(a, a.manager?.name ?? null)),
  });
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { error, role, userId } = await checkAccess();
  if (error) return error;

  const body = (await req.json()) as {
    type?: "manager" | "agent" | "partner";
    name?: string; email?: string; phone?: string; password?: string;
    commissionRate?: number; commissionType?: string;
    clientDiscountType?: string; clientDiscountValue?: number;
    maxClientDiscount?: number | null; notes?: string; managerId?: string;
    // partner-specific
    category?: string; nameEn?: string; logoUrl?: string; websiteUrl?: string; contactPhone?: string;
    contractStartDate?: string; contractEndDate?: string;
    referralDiscountRate?: number | null | string; memberBenefitCode?: string; memberBenefitRate?: number | null | string;
    managerCommissionType?: string; managerCommissionRate?: number;
  };

  // ── Create ContractsManager (admin only) ──
  if (body.type === "manager") {
    if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!body.name?.trim()) return NextResponse.json({ error: "الاسم مطلوب." }, { status: 400 });
    if (!body.email?.trim()) return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
    if (!body.password?.trim() || body.password.length < 6)
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });

    const existingMgr = await db.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (existingMgr) return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل." }, { status: 400 });

    const { hashSync } = await import("bcryptjs");
    const mgrUser = await db.user.create({
      data: {
        name: body.name.trim(), email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim() || null, password: hashSync(body.password.trim(), 10),
        role: "contracts_manager", adminAccess: true, emailVerified: new Date(),
      },
    });

    const manager = await dbx.contractsManager.create({
      data: {
        userId: mgrUser.id, name: body.name.trim(),
        commissionType: body.commissionType ?? "percentage_of_agents",
        commissionRate: Number(body.commissionRate ?? 0),
        notes: body.notes?.trim() || null,
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });

    void logAudit({ action: "create_contracts_manager", targetType: "contracts_manager", targetId: manager.id as string, details: { name: manager.name, role } });
    return NextResponse.json({ success: true, manager }, { status: 201 });
  }

  // ── Create Partner (admin or contracts_manager) ──
  if (body.type === "partner") {
    if (role !== "admin" && role !== "contracts_manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!body.name?.trim()) return NextResponse.json({ error: "الاسم مطلوب." }, { status: 400 });
    if (!body.email?.trim()) return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
    if (!body.category?.trim()) return NextResponse.json({ error: "الفئة مطلوبة." }, { status: 400 });

    const existingP = await db.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (existingP) return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل." }, { status: 400 });

    const { hashSync } = await import("bcryptjs");
    const pw = body.password?.trim() || "FitZone@Partner!";
    const pUser = await db.user.create({
      data: {
        name: body.name.trim(), email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim() || null, password: hashSync(pw, 10),
        role: "partner", adminAccess: true, emailVerified: new Date(),
        adminPermissions: JSON.stringify(["partners"]),
      },
    });

    // Resolve managerId: contracts_manager uses their own, admin can pass one
    let resolvedManagerId: string | null = null;
    if (role === "contracts_manager") {
      resolvedManagerId = await getManagerId(userId!);
    } else if (body.managerId) {
      resolvedManagerId = body.managerId;
    }

    let linkToken = generatePartnerToken();
    while (await dbx.partnerAffiliateLink.findUnique({ where: { token: linkToken } })) linkToken = generatePartnerToken();

    const isPendingApproval = role === "contracts_manager";
    const rawNotes = body.notes?.trim() || null;
    const notesValue = isPendingApproval
      ? "[PENDING_APPROVAL]" + (rawNotes ? " " + rawNotes : "")
      : rawNotes;

    const partner = await dbx.partner.create({
      data: {
        userId: pUser.id, name: body.name.trim(),
        nameEn: body.nameEn?.trim() || null,
        category: body.category.trim(),
        logoUrl: body.logoUrl?.trim() || null,
        websiteUrl: body.websiteUrl?.trim() || null,
        contactPhone: body.contactPhone?.trim() || null,
        commissionRate: Number(body.commissionRate ?? 10),
        commissionType: body.commissionType === "fixed" ? "fixed" : "percentage",
        contractStartDate: body.contractStartDate ? new Date(body.contractStartDate) : null,
        contractEndDate: body.contractEndDate ? new Date(body.contractEndDate) : null,
        referralDiscountRate: body.referralDiscountRate != null && body.referralDiscountRate !== "" ? Number(body.referralDiscountRate) : null,
        memberBenefitCode: body.memberBenefitCode?.trim() || null,
        memberBenefitRate: body.memberBenefitRate != null && body.memberBenefitRate !== "" ? Number(body.memberBenefitRate) : null,
        isActive: !isPendingApproval, showOnPublicPage: false, notes: notesValue,
        managerId: resolvedManagerId,
        managerCommissionType: body.managerCommissionType ?? null,
        managerCommissionRate: body.managerCommissionRate != null ? Number(body.managerCommissionRate) : null,
        affiliateLinks: { create: { token: linkToken, label: "لينك الشريك" } },
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        manager: { select: { id: true, name: true } },
        affiliateLinks: { select: { token: true, label: true }, where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { codes: true, affiliateLinks: true } },
        commissions: { select: { amount: true, status: true } },
      },
    });

    void logAudit({ action: "create_partner", targetType: "partner", targetId: partner.id as string, details: { name: partner.name } });
    return NextResponse.json({ success: true, partner: formatPartnerList([partner], true)[0] }, { status: 201 });
  }

  // ── Create SalesAgent (admin or contracts_manager) ──
  if (!body.name?.trim()) return NextResponse.json({ error: "الاسم مطلوب." }, { status: 400 });
  if (!body.email?.trim()) return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
  if (!body.password?.trim() || body.password.length < 6)
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });

  const existingAgent = await db.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
  if (existingAgent) return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل." }, { status: 400 });

  let resolvedManagerId: string | null = null;
  if (role === "contracts_manager") {
    resolvedManagerId = await getManagerId(userId!);
  } else if (body.managerId) {
    const mgr = await dbx.contractsManager.findUnique({ where: { id: body.managerId }, select: { id: true } });
    if (mgr) resolvedManagerId = mgr.id as string;
  }

  let referralCode = generateReferralCode();
  while (await dbx.salesAgent.findUnique({ where: { referralCode } })) referralCode = generateReferralCode();

  const { hashSync } = await import("bcryptjs");
  const agentUser = await db.user.create({
    data: {
      name: body.name.trim(), email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() || null, password: hashSync(body.password.trim(), 10),
      role: "agent", adminAccess: true, emailVerified: new Date(),
    },
  });

  const agent = await dbx.salesAgent.create({
    data: {
      userId: agentUser.id, name: body.name.trim(), referralCode,
      commissionRate: Number(body.commissionRate ?? 0),
      commissionType: body.commissionType ?? "percentage",
      clientDiscountType: body.clientDiscountType ?? "percentage",
      clientDiscountValue: Number(body.clientDiscountValue ?? 0),
      maxClientDiscount: body.maxClientDiscount != null ? Number(body.maxClientDiscount) : null,
      managerId: resolvedManagerId,
      notes: body.notes?.trim() || null,
    },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });

  void logAudit({ action: "create_agent", targetType: "sales_agent", targetId: agent.id as string, details: { name: agent.name, role } });
  return NextResponse.json({ success: true, agent }, { status: 201 });
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const { error, role } = await checkAccess();
  if (error) return error;

  const body = (await req.json()) as {
    agentId?: string; managerId?: string; partnerId?: string; action?: string;
    commissionIds?: string[]; managerCommissionIds?: string[];
    name?: string; email?: string; phone?: string; password?: string;
    category?: string; logoUrl?: string | null; websiteUrl?: string | null; contactPhone?: string | null;
    commissionRate?: number; commissionType?: string;
    clientDiscountType?: string; clientDiscountValue?: number;
    maxClientDiscount?: number | null; isActive?: boolean; showOnPublicPage?: boolean; notes?: string;
    managerCommissionType?: string | null; managerCommissionRate?: number | null;
  };

  const buildUserUpdate = async () => {
    const userUpd: Record<string, unknown> = {};
    if (body.name !== undefined) userUpd.name = body.name.trim();
    if (body.email !== undefined) userUpd.email = body.email.trim().toLowerCase();
    if (body.phone !== undefined) userUpd.phone = body.phone.trim() || null;
    if (body.password?.trim()) {
      if (body.password.trim().length < 6) {
        throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      }
      const { hashSync } = await import("bcryptjs");
      userUpd.password = hashSync(body.password.trim(), 10);
    }
    return userUpd;
  };

  // Settle manager commissions
  if (body.action === "settle_manager_commissions") {
    if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!body.managerId) return NextResponse.json({ error: "معرّف المدير مطلوب." }, { status: 400 });
    const ids = Array.isArray(body.managerCommissionIds) ? body.managerCommissionIds : [];
    await dbx.managerCommission.updateMany({
      where: { managerId: body.managerId, ...(ids.length ? { id: { in: ids } } : { status: "earned" }) },
      data: { status: "settled", settledAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }

  // Update partner
  if (body.partnerId) {
    if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const partner = await dbx.partner.findUnique({ where: { id: body.partnerId } });
    if (!partner) return NextResponse.json({ error: "الشريك غير موجود." }, { status: 404 });

    try {
      const partnerUpd: Record<string, unknown> = {};
      if (body.name !== undefined) partnerUpd.name = body.name.trim();
      if (body.category !== undefined) partnerUpd.category = body.category.trim();
      if (body.logoUrl !== undefined) partnerUpd.logoUrl = body.logoUrl?.trim() || null;
      if (body.websiteUrl !== undefined) partnerUpd.websiteUrl = body.websiteUrl?.trim() || null;
      if (body.contactPhone !== undefined) partnerUpd.contactPhone = body.contactPhone?.trim() || null;
      if (body.commissionRate !== undefined) partnerUpd.commissionRate = Number(body.commissionRate);
      if (body.commissionType !== undefined) partnerUpd.commissionType = body.commissionType === "fixed" ? "fixed" : "percentage";
      if (body.managerCommissionType !== undefined) partnerUpd.managerCommissionType = body.managerCommissionType || null;
      if (body.managerCommissionRate !== undefined) partnerUpd.managerCommissionRate = body.managerCommissionRate != null ? Number(body.managerCommissionRate) : null;
      if (body.managerId !== undefined) partnerUpd.managerId = body.managerId || null;
      if (body.isActive !== undefined) partnerUpd.isActive = Boolean(body.isActive);
      if (body.showOnPublicPage !== undefined) partnerUpd.showOnPublicPage = Boolean(body.showOnPublicPage);
      if (body.notes !== undefined) partnerUpd.notes = body.notes?.trim() || null;

      const userUpd = await buildUserUpdate();
      await db.$transaction([
        ...(Object.keys(userUpd).length ? [db.user.update({ where: { id: partner.userId as string }, data: userUpd })] : []),
        ...(Object.keys(partnerUpd).length ? [dbx.partner.update({ where: { id: partner.id }, data: partnerUpd })] : []),
      ]);
      return NextResponse.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر تعديل الشريك.";
      if (msg.includes("Unique constraint")) return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل." }, { status: 400 });
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // Update/settle manager
  if (body.managerId && !body.agentId) {
    if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const manager = await dbx.contractsManager.findUnique({ where: { id: body.managerId } });
    if (!manager) return NextResponse.json({ error: "المدير غير موجود." }, { status: 404 });

    if (body.action === "settle_commissions") {
      await dbx.managerCommission.updateMany({
        where: { managerId: manager.id, status: "earned" },
        data: { status: "settled", settledAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    const upd: Record<string, unknown> = {};
    if (body.name !== undefined) upd.name = body.name.trim();
    if (body.commissionRate !== undefined) upd.commissionRate = Number(body.commissionRate);
    if (body.commissionType !== undefined) upd.commissionType = body.commissionType;
    if (body.isActive !== undefined) upd.isActive = Boolean(body.isActive);
    if (body.notes !== undefined) upd.notes = body.notes?.trim() || null;
    try {
      const userUpd = await buildUserUpdate();
      await db.$transaction([
        ...(Object.keys(userUpd).length ? [db.user.update({ where: { id: manager.userId as string }, data: userUpd })] : []),
        ...(Object.keys(upd).length ? [dbx.contractsManager.update({ where: { id: manager.id }, data: upd })] : []),
      ]);
      return NextResponse.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر تعديل المدير.";
      if (msg.includes("Unique constraint")) return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل." }, { status: 400 });
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // Update/settle agent
  if (!body.agentId) return NextResponse.json({ error: "معرّف المندوب أو المدير مطلوب." }, { status: 400 });
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

  const upd: Record<string, unknown> = {};
  if (body.name !== undefined) upd.name = body.name.trim();
  if (body.commissionRate !== undefined && role === "admin") upd.commissionRate = Number(body.commissionRate);
  if (body.commissionType !== undefined && role === "admin") upd.commissionType = body.commissionType;
  if (body.clientDiscountType !== undefined && role === "admin") upd.clientDiscountType = body.clientDiscountType;
  if (body.clientDiscountValue !== undefined && role === "admin") upd.clientDiscountValue = Number(body.clientDiscountValue);
  if (body.maxClientDiscount !== undefined && role === "admin") upd.maxClientDiscount = body.maxClientDiscount != null ? Number(body.maxClientDiscount) : null;
  if (body.managerId !== undefined && role === "admin") upd.managerId = body.managerId || null;
  if (body.isActive !== undefined) upd.isActive = Boolean(body.isActive);
  if (body.notes !== undefined) upd.notes = body.notes?.trim() || null;
  try {
    const userUpd = await buildUserUpdate();
    await db.$transaction([
      ...(Object.keys(userUpd).length ? [db.user.update({ where: { id: agent.userId as string }, data: userUpd })] : []),
      ...(Object.keys(upd).length ? [dbx.salesAgent.update({ where: { id: agent.id }, data: upd })] : []),
    ]);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "تعذر تعديل المندوب.";
    if (msg.includes("Unique constraint")) return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل." }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const { error, role } = await checkAccess();
  if (error) return error;
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as { agentId?: string; managerId?: string };

  if (body.managerId) {
    const manager = await dbx.contractsManager.findUnique({ where: { id: body.managerId } });
    if (!manager) return NextResponse.json({ error: "المدير غير موجود." }, { status: 404 });
    await dbx.contractsManager.delete({ where: { id: body.managerId } });
    await db.user.update({ where: { id: manager.userId as string }, data: { adminAccess: false, role: "member" } });
    return NextResponse.json({ success: true });
  }

  if (body.agentId) {
    const agent = await dbx.salesAgent.findUnique({ where: { id: body.agentId } });
    if (!agent) return NextResponse.json({ error: "المندوب غير موجود." }, { status: 404 });
    await dbx.salesAgent.delete({ where: { id: body.agentId } });
    await db.user.update({ where: { id: agent.userId as string }, data: { adminAccess: false, role: "member" } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "معرّف المندوب أو المدير مطلوب." }, { status: 400 });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getManagerId(userId: string): Promise<string | null> {
  const m = await dbx.contractsManager.findFirst({ where: { userId }, select: { id: true } });
  return (m?.id as string) ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatAgentDetail(agent: any) {
  const comms = agent.commissions as CommRow[];
  return {
    id: agent.id, name: agent.name, referralCode: agent.referralCode,
    commissionRate: agent.commissionRate, commissionType: agent.commissionType,
    clientDiscountType: agent.clientDiscountType, clientDiscountValue: agent.clientDiscountValue,
    managerId: agent.managerId ?? null, managerName: agent.manager?.name ?? null,
    user: agent.user,
    referrals: (agent.referrals as { id: string; user: { id: string; name: string | null; email: string | null; phone: string | null }; convertedAt: Date | null; totalSpent: number; createdAt: Date }[]).map((r) => ({
      id: r.id, user: r.user,
      convertedAt: r.convertedAt?.toISOString() ?? null,
      totalSpent: r.totalSpent, createdAt: r.createdAt.toISOString(),
    })),
    commissions: (agent.commissions as { id: string; amount: number; status: string; settledAt: Date | null; createdAt: Date }[]).map((c) => ({
      id: c.id, amount: c.amount, status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    totalEarned: comms.reduce((s: number, c: CommRow) => s + c.amount, 0),
    pendingCommission: comms.filter((c: CommRow) => c.status === "earned").reduce((s: number, c: CommRow) => s + c.amount, 0),
    settledCommission: comms.filter((c: CommRow) => c.status === "settled").reduce((s: number, c: CommRow) => s + c.amount, 0),
  };
}

function formatAgentRow(a: {
  id: string; userId: string; name: string; referralCode: string;
  commissionRate: number; commissionType: string; clientDiscountType: string;
  clientDiscountValue: number; maxClientDiscount: number | null; isActive: boolean;
  notes: string | null; createdAt: Date; managerId: string | null;
  user: { id: string; name: string | null; email: string | null; phone: string | null };
  referrals: RefRow[]; commissions: CommRow[];
}, managerName: string | null) {
  return {
    id: a.id, userId: a.userId, name: a.name, referralCode: a.referralCode,
    commissionRate: a.commissionRate, commissionType: a.commissionType,
    clientDiscountType: a.clientDiscountType, clientDiscountValue: a.clientDiscountValue,
    maxClientDiscount: a.maxClientDiscount, isActive: a.isActive,
    notes: a.notes, createdAt: a.createdAt.toISOString(),
    managerId: a.managerId, managerName,
    user: a.user,
    referralsCount: a.referrals.length,
    convertedCount: a.referrals.filter((r: RefRow) => r.convertedAt !== null).length,
    totalEarned: a.commissions.reduce((s: number, c: CommRow) => s + c.amount, 0),
    pendingCommission: a.commissions.filter((c: CommRow) => c.status === "earned").reduce((s: number, c: CommRow) => s + c.amount, 0),
    settledCommission: a.commissions.filter((c: CommRow) => c.status === "settled").reduce((s: number, c: CommRow) => s + c.amount, 0),
  };
}

function formatAgentList(agents: {
  id: string; userId: string; name: string; referralCode: string;
  commissionRate: number; commissionType: string; clientDiscountType: string;
  clientDiscountValue: number; maxClientDiscount: number | null; isActive: boolean;
  notes: string | null; createdAt: Date; managerId: string | null;
  user: { id: string; name: string | null; email: string | null; phone: string | null };
  referrals: RefRow[]; commissions: CommRow[];
}[], managerName: string) {
  return agents.map((a) => formatAgentRow(a, managerName));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPartnerList(partners: any[], includeManager = false) {
  return partners.map((p: any) => {
    const pending = (p.commissions as { amount: number; status: string }[]).filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
    const paid = (p.commissions as { amount: number; status: string }[]).filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);
    return {
      id: p.id, userId: p.userId, name: p.name, nameEn: p.nameEn,
      category: p.category, logoUrl: p.logoUrl, websiteUrl: p.websiteUrl,
      contactPhone: p.contactPhone, commissionRate: p.commissionRate, commissionType: p.commissionType,
      isActive: p.isActive, showOnPublicPage: p.showOnPublicPage, notes: p.notes,
      createdAt: (p.createdAt as Date).toISOString(),
      linkedUser: { id: p.user.id, name: p.user.name ?? "", email: p.user.email ?? "", phone: p.user.phone ?? null },
      codesCount: p._count?.codes ?? 0, linksCount: p._count?.affiliateLinks ?? 0,
      totalCommissionPending: pending, totalCommissionPaid: paid,
      managerId: p.managerId ?? null,
      managerName: includeManager ? (p.manager?.name ?? null) : undefined,
      managerCommissionType: p.managerCommissionType ?? null,
      managerCommissionRate: p.managerCommissionRate ?? null,
      referralToken: p.affiliateLinks?.[0]?.token ?? null,
      referralLinkLabel: p.affiliateLinks?.[0]?.label ?? null,
    };
  });
}

function formatPartnerCommission(c: any) {
  return {
    id: c.id, managerId: c.managerId, managerName: c.manager?.name ?? "",
    partnerName: c.partnerCommission?.partner?.name ?? null,
    customerName: c.partnerCommission?.userMembership?.user?.name ?? null,
    customerEmail: c.partnerCommission?.userMembership?.user?.email ?? null,
    membershipName: c.partnerCommission?.userMembership?.membership?.name ?? null,
    amount: c.amount, status: c.status,
    settledAt: c.settledAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

function formatManagerCommission(c: any) {
  return {
    id: c.id, managerId: c.managerId,
    managerName: c.manager?.name ?? "",
    agentName: c.agentCommission?.agent?.name ?? null,
    customerName: c.agentCommission?.userMembership?.user?.name ?? null,
    customerEmail: c.agentCommission?.userMembership?.user?.email ?? null,
    membershipName: c.agentCommission?.userMembership?.membership?.name ?? null,
    userMembershipId: c.userMembershipId ?? null,
    amount: c.amount, status: c.status,
    settledAt: c.settledAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}
