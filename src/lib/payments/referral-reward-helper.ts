/**
 * CLI-safe referral reward helper.
 * Unlocks pending referral rewards when a referred user subscribes.
 */

import { db } from "@/lib/db";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";

export async function unlockPendingReferralReward(subscribedUserId: string) {
  const usage = await db.referralUsage.findUnique({
    where: { referredUserId: subscribedUserId },
    include: { referral: { select: { id: true, userId: true } } },
  });

  if (!usage || usage.subscriptionActivated) return;

  // Mark this referred user as having subscribed
  await db.referralUsage.update({
    where: { id: usage.id },
    data: { subscriptionActivated: true, subscriptionActivatedAt: new Date() },
  });

  // Always increment the referrer's subscriptionActivatedCount
  await db.referral.update({
    where: { id: usage.referral.id },
    data: { subscriptionActivatedCount: { increment: 1 } },
  });

  // If the reward was not yet given, give it now using admin-configured settings
  if (!usage.rewardGiven) {
    const cfg = await getRewardSettings();
    const rType  = cfg.referralRewardType;
    const rValue = cfg.referralRewardValue;
    const referrerUserId = usage.referral.userId;

    if (rType === "wallet") {
      const referrerWallet = await db.wallet.upsert({
        where: { userId: referrerUserId },
        update: {},
        create: { userId: referrerUserId, balance: 0 },
      });
      await db.wallet.update({
        where: { id: referrerWallet.id },
        data: { balance: { increment: rValue } },
      });
      await db.walletTransaction.create({
        data: {
          walletId: referrerWallet.id,
          amount: rValue,
          type: "credit",
          description: "مكافأة إحالة — اشترك العضو المُحال بنجاح",
        },
      });
    } else {
      const rp = await db.rewardPoints.findUnique({ where: { userId: referrerUserId } });
      if (rp) {
        const newPts = rp.points + rValue;
        await db.rewardPoints.update({
          where: { id: rp.id },
          data: { points: { increment: rValue }, tier: calcTier(newPts, cfg.tierThresholds) },
        });
        await db.rewardHistory.create({
          data: { rewardId: rp.id, points: rValue, reason: "referral_bonus" },
        });
      }
    }

    await db.referralUsage.update({
      where: { id: usage.id },
      data: { rewardGiven: true, rewardType: rType, rewardValue: rValue },
    });

    await db.referral.update({
      where: { id: usage.referral.id },
      data: { totalEarned: { increment: rValue } },
    });

    await db.notification.create({
      data: {
        userId: referrerUserId,
        title: "🎉 مكافأة إحالة!",
        body: rType === "wallet"
          ? `اشترك أحد أعضائك المُحالين بنجاح وحصلتِ على ${rValue} ج.م في محفظتك!`
          : `اشترك أحد أعضائك المُحالين بنجاح وحصلتِ على ${rValue} فيتزونة في رصيد مكافآتك!`,
        type: "success",
      },
    });
  }
}
