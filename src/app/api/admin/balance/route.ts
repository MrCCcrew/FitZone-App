import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import {
  AdminWalletAdjustmentError,
  canonicalizeAdminWalletAmount,
  resolveAdminWalletAdjustment,
} from "@/lib/admin-wallet-adjustment";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";

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
    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return NextResponse.json(
        { error: "قيمة الرصيد غير صالحة" },
        { status: 400 },
      );
    }

    const canonicalAmount =
      canonicalizeAdminWalletAmount(
        numericAmount,
      );

    if (canonicalAmount <= 0) {
      return NextResponse.json(
        { error: "قيمة الرصيد يجب ألا تقل عن 0.01" },
        { status: 400 },
      );
    }

    try {
      const adjustment =
        await db.$transaction(async (tx) => {
          const wallet =
            await tx.wallet.upsert({
              where: { userId },
              update: {},
              create: {
                userId,
                balance: 0,
                referralBalance: 0,
              },
            });

          const delta =
            type === "topup"
              ? canonicalAmount
              : -canonicalAmount;

          const resolved =
            resolveAdminWalletAdjustment({
              balance: wallet.balance,
              referralBalance:
                wallet.referralBalance,
              delta,
            });

          const updated =
            await tx.wallet.updateMany({
              where: {
                id: wallet.id,
                balance: wallet.balance,
                referralBalance:
                  wallet.referralBalance,
              },
              data: {
                balance:
                  resolved.nextBalance,
                referralBalance:
                  resolved.nextReferralBalance,
              },
            });

          if (updated.count !== 1) {
            throw new AdminWalletAdjustmentError(
              "تم تعديل الرصيد بالتوازي. أعد المحاولة.",
              409,
            );
          }

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount:   canonicalAmount,
              type:     type === "topup" ? "credit" : "debit",
              source:   "admin_adjustment",
              description: reason ?? (type === "topup" ? "شحن رصيد" : "خصم رصيد"),
            },
          });

          return resolved;
        });

      return NextResponse.json({
        success: true,
        balance:
          adjustment.nextBalance,
        referralBalance:
          adjustment.nextReferralBalance,
      });
    } catch (error) {
      if (
        error instanceof
        AdminWalletAdjustmentError
      ) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }

      throw error;
    }
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
        reason:   reason ?? (type === "earn" ? "منح فيتزونات" : "استبدال فيتزونات"),
      },
    });
    // Update tier
    const balanceCfg = await getRewardSettings();
    const tier = calcTier(rp.points, balanceCfg.tierThresholds);
    await db.rewardPoints.update({ where: { id: rp.id }, data: { tier } });
    return NextResponse.json({ success: true, points: rp.points });
  }

  return NextResponse.json({ error: "نوع غير معروف" }, { status: 400 });
}
