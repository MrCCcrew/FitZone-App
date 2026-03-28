import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("customers");
  return "error" in guard ? guard.error : null;
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

function mapCustomer(user: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  createdAt: Date;
  memberships: { status: string; endDate: Date; membership: { name: string } }[];
  wallet: { balance: number } | null;
  rewardPoints: { points: number } | null;
}) {
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
  const err = await checkAdmin();
  if (err) return err;

  try {
    const users = await db.user.findMany({
      where: { role: "member" },
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

    return NextResponse.json(users.map(mapCustomer));
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

    return NextResponse.json(created ? mapCustomer(created) : null);
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

    return NextResponse.json(user ? mapCustomer(user) : null);
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

    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_CUSTOMERS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف العميل" }, { status: 500 });
  }
}
