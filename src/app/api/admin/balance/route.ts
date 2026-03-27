import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("balance");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  const err = await checkAdmin(); if (err) return err;

  const users = await db.user.findMany({
    where: { role: "member" },
    orderBy: { name: "asc" },
    include: {
      wallet: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 5 } } },
      rewardPoints: { include: { history: { orderBy: { createdAt: "desc" }, take: 5 } } },
    },
  });

  const customers = users.map(u => ({
    id:      u.id,
    name:    u.name    ?? "—",
    email:   u.email   ?? "—",
    avatar:  u.avatar  ?? "ع",
    points:  u.rewardPoints?.points  ?? 0,
    tier:    u.rewardPoints?.tier    ?? "bronze",
    balance: u.wallet?.balance       ?? 0,
  }));

  // Recent transactions merged
  const transactions: {
    id: string; customerId: string; customerName: string;
    type: string; points: number; amount: number; reason: string; date: string;
  }[] = [];

  for (const u of users) {
    u.wallet?.transactions.forEach(t => {
      transactions.push({
        id: t.id, customerId: u.id, customerName: u.name ?? "—",
        type: t.type === "credit" ? "topup" : "deduct",
        points: 0, amount: t.amount,
        reason: t.description ?? "—",
        date: t.createdAt.toISOString().slice(0, 10),
      });
    });
    u.rewardPoints?.history.forEach(h => {
      transactions.push({
        id: h.id, customerId: u.id, customerName: u.name ?? "—",
        type: h.points > 0 ? "earn" : "redeem",
        points: Math.abs(h.points), amount: 0,
        reason: h.reason,
        date: h.createdAt.toISOString().slice(0, 10),
      });
    });
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ customers, transactions: transactions.slice(0, 50) });
}

export async function POST(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const body = await req.json();
  const { userId, type, amount, points, reason } = body;
  if (!userId || !type) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  if (type === "topup" || type === "deduct") {
    const wallet = await db.wallet.upsert({
      where:  { userId },
      update: { balance: { increment: type === "topup" ? Number(amount) : -Number(amount) } },
      create: { userId, balance: type === "topup" ? Number(amount) : 0 },
    });
    await db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount:   Number(amount),
        type:     type === "topup" ? "credit" : "debit",
        description: reason ?? (type === "topup" ? "شحن رصيد" : "خصم رصيد"),
      },
    });
    return NextResponse.json({ success: true, balance: wallet.balance });
  }

  if (type === "earn" || type === "redeem") {
    const rp = await db.rewardPoints.upsert({
      where:  { userId },
      update: { points: { increment: type === "earn" ? Number(points) : -Number(points) } },
      create: { userId, points: type === "earn" ? Number(points) : 0, tier: "bronze" },
    });
    await db.rewardHistory.create({
      data: {
        rewardId: rp.id,
        points:   type === "earn" ? Number(points) : -Number(points),
        reason:   reason ?? (type === "earn" ? "منح نقاط" : "استبدال نقاط"),
      },
    });
    // Update tier
    const p = rp.points;
    const tier = p >= 5000 ? "platinum" : p >= 3000 ? "gold" : p >= 1000 ? "silver" : "bronze";
    await db.rewardPoints.update({ where: { id: rp.id }, data: { tier } });
    return NextResponse.json({ success: true, points: rp.points });
  }

  return NextResponse.json({ error: "نوع غير معروف" }, { status: 400 });
}
