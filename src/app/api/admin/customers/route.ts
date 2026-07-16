import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";

async function checkAdmin() {
  const guard = await requireAdminFeature("customers");
  return "error" in guard ? guard.error : null;
}

function isApprover(role: string) {
  return role === "admin" || role === "head_coach";
}

async function getTrainerProfileId(userId: string): Promise<string | null> {
  const t = await db.trainer.findFirst({ where: { userId }, select: { id: true } });
  return t?.id ?? null;
}

type CustomerPayload = {
  id?: string;
  action?: "approve" | "reject";
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  plan?: string;
  status?: "active" | "suspended" | "expired";
  points?: number;
  balance?: number;
  trainerRefToken?: string; // trainer referral link token to attach to this customer
};

function buildStatus(user: {
  memberships: { status: string; endDate: Date }[];
}): "active" | "expired" | "suspended" {
  const latest = user.memberships[0];
  if (!latest) return "expired";
  if (latest.status === "cancelled") return "suspended";

  const active = user.memberships.find((membership) => membership.status === "active");
  if (!active) return "expired";
  if (active.endDate < new Date()) return "expired";
  return "active";
}

type CustomerMembershipRow = {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
  paymentAmount: number;
  paymentMethod: string | null;
  offerTitle: string | null;
  totalSessions: number | null;
  productRewardsUsed: string | null;
  membership: { name: string; kind: string; sessionsCount: number | null };
};

type CustomerSummary = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  pendingApproval: boolean;
  createdAt: Date;
  memberships: CustomerMembershipRow[];
  wallet: { balance: number } | null;
  rewardPoints: { points: number } | null;
};

function mapCustomer(
  user: CustomerSummary,
  bookingCounts: Map<string, { used: number }>,
  productNames: Map<string, string>,
) {
  const latestMembership = user.memberships[0];

  return {
    id: user.id,
    name: user.name ?? "—",
    email: user.email ?? "—",
    phone: user.phone ?? "—",
    avatar: user.avatar ?? "ع",
    pendingApproval: user.pendingApproval,
    plan: latestMembership?.membership.name ?? "بدون اشتراك",
    status: buildStatus(user),
    joinDate: user.createdAt.toISOString().slice(0, 10),
    points: user.rewardPoints?.points ?? 0,
    balance: user.wallet?.balance ?? 0,
    memberships: user.memberships.map((membership) => {
      const totalSessions = membership.totalSessions ?? membership.membership.sessionsCount ?? null;
      const usedSessions = bookingCounts.get(membership.id)?.used ?? 0;
      const remainingSessions =
        totalSessions !== null ? Math.max(totalSessions - usedSessions, 0) : null;

      let productRewards: Array<{ productId: string; productName?: string; quantity: number }> = [];
      if (membership.productRewardsUsed) {
        try {
          const parsed = JSON.parse(membership.productRewardsUsed) as Array<{
            productId: string;
            quantity: number;
          }>;
          if (Array.isArray(parsed)) {
            productRewards = parsed
              .filter((item) => item?.productId && item?.quantity)
              .map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                productName: productNames.get(item.productId),
              }));
          }
        } catch {
          productRewards = [];
        }
      }

      return {
        id: membership.id,
        name: membership.membership.name,
        kind: membership.membership.kind === "package" ? "package" : "subscription",
        status: membership.status,
        startDate: membership.startDate.toISOString(),
        endDate: membership.endDate.toISOString(),
        sessionsTotal: totalSessions,
        sessionsUsed: usedSessions,
        sessionsRemaining: remainingSessions,
        paymentAmount: membership.paymentAmount ?? 0,
        paymentMethod: membership.paymentMethod ?? null,
        offerTitle: membership.offerTitle ?? null,
        productRewards,
      };
    }),
  };
}

async function applyMembership(userId: string, planName?: string, status?: CustomerPayload["status"]) {
  if (status === "suspended") {
    await db.userMembership.updateMany({
      where: { userId, status: "active" },
      data: { status: "cancelled" },
    });
    return;
  }

  if (status === "expired") {
    await db.userMembership.updateMany({
      where: { userId, status: "active" },
      data: { status: "expired" },
    });
    return;
  }

  let nextPlanName = planName;

  if ((!nextPlanName || nextPlanName === "بدون اشتراك") && status === "active") {
    const latestMembership = await db.userMembership.findFirst({
      where: { userId },
      include: { membership: true },
      orderBy: { startDate: "desc" },
    });

    nextPlanName = latestMembership?.membership.name;
  }

  if (!nextPlanName || nextPlanName === "بدون اشتراك") {
    return;
  }

  const plan = await db.membership.findFirst({
    where: { name: nextPlanName, isActive: true },
  });

  if (!plan) return;

  const activeMembership = await db.userMembership.findFirst({
    where: { userId, status: "active" },
    include: { membership: true },
    orderBy: { startDate: "desc" },
  });

  if (activeMembership?.membershipId === plan.id) {
    return;
  }

  await db.userMembership.updateMany({
    where: { userId, status: "active" },
    data: { status: "expired" },
  });

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.duration);

  await db.userMembership.create({
    data: {
      userId,
      membershipId: plan.id,
      startDate,
      endDate,
      status: "active",
    },
  });

  if (plan.walletBonus > 0) {
    const wallet = await db.wallet.upsert({
      where: { userId },
      update: { balance: { increment: plan.walletBonus } },
      create: { userId, balance: plan.walletBonus },
    });

    await db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: plan.walletBonus,
        type: "credit",
        description: `مكافأة تفعيل باقة ${plan.name} من الإدارة`,
      },
    });
  }
}

async function applyWalletAndRewards(userId: string, nextBalance?: number, nextPoints?: number) {
  if (nextBalance !== undefined) {
    const wallet = await db.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });

    const delta = Number(nextBalance) - wallet.balance;

    await db.wallet.update({
      where: { id: wallet.id },
      data: { balance: Number(nextBalance) },
    });

    if (delta !== 0) {
      await db.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: Math.abs(delta),
          type: delta > 0 ? "credit" : "debit",
          description: delta > 0 ? "إضافة رصيد من الإدارة" : "خصم رصيد من الإدارة",
        },
      });
    }
  }

  if (nextPoints !== undefined) {
    const rewards = await db.rewardPoints.upsert({
      where: { userId },
      update: {},
      create: { userId, points: 0, tier: "bronze" },
    });

    const delta = Number(nextPoints) - rewards.points;
    const rewardCfg = await getRewardSettings();
    const tier = calcTier(Number(nextPoints), rewardCfg.tierThresholds);

    await db.rewardPoints.update({
      where: { id: rewards.id },
      data: { points: Number(nextPoints), tier },
    });

    if (delta !== 0) {
      await db.rewardHistory.create({
        data: {
          rewardId: rewards.id,
          points: delta,
          reason: delta > 0 ? "إضافة فيتزونات من الإدارة" : "خصم فيتزونات من الإدارة",
        },
      });
    }
  }
}

export async function GET() {
  const guard = await requireAdminFeature("customers");
  if ("error" in guard) return guard.error;

  const userRole = guard.role;

  // Trainer sees only clients booked in their classes (never pending-approval accounts)
  let extraFilter: Record<string, unknown> = {};
  if (userRole === "trainer") {
    const trainerId = await getTrainerProfileId(guard.session.user.id);
    if (!trainerId) return NextResponse.json({ customers: [], userRole });
    extraFilter = {
      pendingApproval: false,
      bookings: { some: { schedule: { class: { trainerId } } } },
    };
  }

  try {
    const users = await db.user.findMany({
      where: { role: "member", ...extraFilter },
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          include: { membership: true },
          orderBy: { startDate: "desc" },
        },
        wallet: true,
        rewardPoints: true,
      },
    });

    const membershipIds = users.flatMap((user) => user.memberships.map((membership) => membership.id));

    const bookingCountsRaw = membershipIds.length
      ? await db.booking.groupBy({
          by: ["userMembershipId", "status"],
          where: { userMembershipId: { in: membershipIds } },
          _count: { _all: true },
        })
      : [];

    const bookingCounts = new Map<string, { used: number }>();
    for (const row of bookingCountsRaw) {
      const membershipId = row.userMembershipId ?? "";
      if (!membershipId) continue;
      const used = row.status === "confirmed" || row.status === "attended" ? row._count._all : 0;
      const current = bookingCounts.get(membershipId) ?? { used: 0 };
      bookingCounts.set(membershipId, { used: current.used + used });
    }

    const rewardsIds = new Set<string>();
    for (const user of users) {
      for (const membership of user.memberships) {
        if (!membership.productRewardsUsed) continue;
        try {
          const parsed = JSON.parse(membership.productRewardsUsed) as Array<{ productId: string }>;
          parsed.forEach((item) => item?.productId && rewardsIds.add(item.productId));
        } catch {
          continue;
        }
      }
    }

    const products = rewardsIds.size
      ? await db.product.findMany({ where: { id: { in: Array.from(rewardsIds) } } })
      : [];
    const productNames = new Map(products.map((product) => [product.id, product.name]));

    return NextResponse.json({
      customers: users.map((user) => mapCustomer(user, bookingCounts, productNames)),
      userRole,
    });
  } catch (error) {
    console.error("[ADMIN_CUSTOMERS_GET]", error);
    return NextResponse.json({ customers: [], userRole }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("customers");
  if ("error" in guard) return guard.error;

  const { role } = guard;

  try {
    const payload = (await req.json()) as CustomerPayload;
    const { name, email, phone, password, plan, status, points, balance, trainerRefToken } = payload;

    if (!email || !name) {
      return NextResponse.json({ error: "الاسم والبريد الإلكتروني مطلوبان" }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "البريد الإلكتروني مسجل بالفعل" }, { status: 409 });
    }

    const isTrainer = role === "trainer";

    // Validate trainer referral token: must belong to this trainer's own links
    let validatedTrainerRef: string | null = null;
    if (isTrainer && trainerRefToken) {
      const dbx = db as any;
      const trainerUserId = guard.session.user.id;
      const link = await dbx.trainerReferralLink.findUnique({
        where: { token: trainerRefToken.trim().toUpperCase() },
        select: { id: true, userId: true, isActive: true },
      });
      if (link?.isActive && link.userId === trainerUserId) {
        validatedTrainerRef = trainerRefToken.trim().toUpperCase();
      }
    }

    const hashed = await bcryptjs.hash(password ?? "FitZone123!", 12);
    const user = await db.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        password: hashed,
        role: "member",
        avatar: (name[0] ?? "ع").toUpperCase(),
        // Trainer-created accounts are pending until admin approves
        pendingApproval: isTrainer,
        emailVerified: isTrainer ? null : new Date(),
        ...(validatedTrainerRef ? { pendingTrainerRef: validatedTrainerRef } : {}),
      },
    } as Parameters<typeof db.user.create>[0]);

    await db.wallet.create({ data: { userId: user.id, balance: 0 } });
    const rewardRecord = await db.rewardPoints.create({ data: { userId: user.id, points: 0, tier: "bronze" } });
    await db.referral.create({
      data: { userId: user.id, code: `FZ-${user.id.slice(-6).toUpperCase()}` },
    });

    if (!isTrainer) {
      // Admin/staff creation: give signup bonus immediately
      const SIGNUP_BONUS = 20;
      const bonusPoints = SIGNUP_BONUS + (points ?? 0);
      const bonusTier =
        bonusPoints >= 5000 ? "platinum" :
        bonusPoints >= 3000 ? "gold" :
        bonusPoints >= 1000 ? "silver" : "bronze";
      await db.rewardPoints.update({
        where: { id: rewardRecord.id },
        data: { points: bonusPoints, tier: bonusTier },
      });
      await db.rewardHistory.create({
        data: { rewardId: rewardRecord.id, points: SIGNUP_BONUS, reason: "onboarding_email_verified" },
      });
      await applyWalletAndRewards(user.id, balance ?? 0, undefined);
      await applyMembership(user.id, plan, status ?? "expired");
      await db.notification.create({
        data: {
          userId: user.id,
          title: "تم إنشاء حسابك",
          body: "تم إنشاء حسابك من إدارة FitZone ويمكنك الآن تسجيل الدخول واستخدام خدمات الموقع.",
          type: "success",
        },
      });
    } else {
      // Trainer-created: notify all admins and head_coaches for approval
      const approvers = await db.user.findMany({
        where: { role: { in: ["admin", "head_coach"] }, isActive: true },
        select: { id: true },
      });
      if (approvers.length > 0) {
        await db.notification.createMany({
          data: approvers.map((a) => ({
            userId: a.id,
            title: "طلب إنشاء حساب عميل جديد",
            body: `المدربة طلبت إنشاء حساب لـ ${name} (${email}). يرجى المراجعة والموافقة من قسم العملاء.`,
            type: "info",
          })),
        });
      }
    }

    const created = await db.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: { include: { membership: true }, orderBy: { startDate: "desc" } },
        wallet: true,
        rewardPoints: true,
      },
    });

    return NextResponse.json(
      created ? mapCustomer(created, new Map(), new Map()) : null,
      { status: isTrainer ? 202 : 200 },
    );
  } catch (error) {
    console.error("[ADMIN_CUSTOMERS_POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء العميل" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("customers");
  if ("error" in guard) return guard.error;

  const { role } = guard;

  try {
    const payload = (await req.json()) as CustomerPayload;
    const { id, action, name, email, phone, password, status, plan, points, balance } = payload;

    if (!id) {
      return NextResponse.json({ error: "معرّف العميل مطلوب" }, { status: 400 });
    }

    // Approve / Reject — admin and head_coach only
    if (action === "approve" || action === "reject") {
      if (!isApprover(role)) {
        return NextResponse.json({ error: "صلاحية الموافقة للأدمن وهيد كوتش فقط." }, { status: 403 });
      }

      if (action === "reject") {
        await db.user.delete({ where: { id } });
        void logAudit({ action: "delete", targetType: "customer", targetId: id, details: { reason: "rejected_by_approver" } });
        return NextResponse.json({ success: true });
      }

      // Approve: activate account + give signup bonus
      const SIGNUP_BONUS = 20;
      const [rewards, approveRewardCfg] = await Promise.all([
        db.rewardPoints.findFirst({ where: { userId: id } }),
        getRewardSettings(),
      ]);
      await db.user.update({
        where: { id },
        data: { pendingApproval: false, emailVerified: new Date() },
      });
      if (rewards) {
        const newBonusPts = rewards.points + SIGNUP_BONUS;
        await db.rewardPoints.update({
          where: { id: rewards.id },
          data: { points: { increment: SIGNUP_BONUS }, tier: calcTier(newBonusPts, approveRewardCfg.tierThresholds) },
        });
        await db.rewardHistory.create({
          data: { rewardId: rewards.id, points: SIGNUP_BONUS, reason: "onboarding_email_verified" },
        });
      }
      await db.notification.create({
        data: {
          userId: id,
          title: "تم تفعيل حسابك ✅",
          body: "تمت الموافقة على حسابك من الإدارة. يمكنك الآن تسجيل الدخول واستخدام خدمات الموقع.",
          type: "success",
        },
      });
      void logAudit({ action: "update", targetType: "customer", targetId: id, details: { action: "approved" } });

      const approved = await db.user.findUnique({
        where: { id },
        include: {
          memberships: { include: { membership: true }, orderBy: { startDate: "desc" } },
          wallet: true,
          rewardPoints: true,
        },
      });
      return NextResponse.json(approved ? mapCustomer(approved, new Map(), new Map()) : null);
    }

    // Trainers cannot edit customer profiles
    if (role === "trainer") {
      return NextResponse.json({ error: "ليس لديك صلاحية تعديل بيانات العملاء." }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    // never overwrite a real avatar (URL or preset) when only editing the name
    if (password?.trim()) data.password = await bcryptjs.hash(password.trim(), 12);

    if (Object.keys(data).length > 0) {
      await db.user.update({ where: { id }, data });
    }
    await applyWalletAndRewards(id, balance, points);
    await applyMembership(id, plan, status);

    await db.notification.create({
      data: {
        userId: id,
        title: "تم تحديث بيانات حسابك",
        body: "تم تحديث بيانات حسابك أو اشتراكك من الإدارة.",
        type: "info",
      },
    });

    const user = await db.user.findUnique({
      where: { id },
      include: {
        memberships: { include: { membership: true }, orderBy: { startDate: "desc" } },
        wallet: true,
        rewardPoints: true,
      },
    });

    void logAudit({ action: "update", targetType: "customer", targetId: id, details: { changes: Object.keys(data) } });
    return NextResponse.json(user ? mapCustomer(user, new Map(), new Map()) : null);
  } catch (error) {
    console.error("[ADMIN_CUSTOMERS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث العميل" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) {
      return NextResponse.json({ error: "معرّف العميل مطلوب" }, { status: 400 });
    }

    const u = await db.user.findUnique({ where: { id }, select: { name: true, email: true } });
    await db.user.delete({ where: { id } });
    void logAudit({ action: "delete", targetType: "customer", targetId: id, details: { name: u?.name, email: u?.email } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_CUSTOMERS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف العميل" }, { status: 500 });
  }
}
