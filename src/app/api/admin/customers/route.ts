import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function checkAdmin() {
  const guard = await requireAdminFeature("customers");
  return "error" in guard ? guard.error : null;
}

async function getTrainerProfileId(userId: string): Promise<string | null> {
  const t = await db.trainer.findFirst({ where: { userId }, select: { id: true } });
  return t?.id ?? null;
}

type CustomerPayload = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  plan?: string;
  status?: "active" | "suspended" | "expired";
  points?: number;
  balance?: number;
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
    const tier =
      nextPoints >= 5000 ? "platinum" :
      nextPoints >= 3000 ? "gold" :
      nextPoints >= 1000 ? "silver" :
      "bronze";

    await db.rewardPoints.update({
      where: { id: rewards.id },
      data: { points: Number(nextPoints), tier },
    });

    if (delta !== 0) {
      await db.rewardHistory.create({
        data: {
          rewardId: rewards.id,
          points: delta,
          reason: delta > 0 ? "إضافة نقاط من الإدارة" : "خصم نقاط من الإدارة",
        },
      });
    }
  }
}

export async function GET() {
  const guard = await requireAdminFeature("customers");
  if ("error" in guard) return guard.error;

  // Trainer sees only clients linked to their schedules/bookings
  let trainerBookingFilter: { bookings: { some: { schedule: { class: { trainerId: string } } } } } | undefined;
  if (guard.role === "trainer") {
    const trainerId = await getTrainerProfileId(guard.session.user.id);
    if (!trainerId) return NextResponse.json([]);
    trainerBookingFilter = {
      bookings: { some: { schedule: { class: { trainerId } } } },
    };
  }

  try {
    const users = await db.user.findMany({
      where: { role: "member", ...trainerBookingFilter },
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

    return NextResponse.json(users.map((user) => mapCustomer(user, bookingCounts, productNames)));
  } catch (error) {
    console.error("[ADMIN_CUSTOMERS_GET]", error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const payload = (await req.json()) as CustomerPayload;
    const { name, email, phone, password, plan, status, points, balance } = payload;

    if (!email || !name) {
      return NextResponse.json({ error: "الاسم والبريد الإلكتروني مطلوبان" }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "البريد الإلكتروني مسجل بالفعل" }, { status: 409 });
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
      },
    });

    await db.wallet.create({ data: { userId: user.id, balance: 0 } });
    await db.rewardPoints.create({ data: { userId: user.id, points: 0, tier: "bronze" } });
    await db.referral.create({
      data: {
        userId: user.id,
        code: `FZ-${user.id.slice(-6).toUpperCase()}`,
      },
    });

    await applyWalletAndRewards(user.id, balance ?? 0, points ?? 0);
    await applyMembership(user.id, plan, status ?? "expired");

    await db.notification.create({
      data: {
        userId: user.id,
        title: "تم إنشاء حسابك",
        body: "تم إنشاء حسابك من إدارة FitZone ويمكنك الآن تسجيل الدخول واستخدام خدمات الموقع.",
        type: "success",
      },
    });

    const created = await db.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: { include: { membership: true }, orderBy: { startDate: "desc" } },
        wallet: true,
        rewardPoints: true,
      },
    });

    return NextResponse.json(created ? mapCustomer(created, new Map(), new Map()) : null);
  } catch (error) {
    console.error("[ADMIN_CUSTOMERS_POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء العميل" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const payload = (await req.json()) as CustomerPayload;
    const { id, name, email, phone, status, plan, points, balance } = payload;

    if (!id) {
      return NextResponse.json({ error: "معرّف العميل مطلوب" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (name !== undefined && name.length > 0) data.avatar = name[0].toUpperCase();

    await db.user.update({ where: { id }, data });
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
