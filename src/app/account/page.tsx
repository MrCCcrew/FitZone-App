import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import AccountClient from "./AccountClient";
import { getRewardSettings } from "@/lib/reward-settings";

export const dynamic = "force-dynamic";

function parseFeatures(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonArray<T>(value: string | null | undefined) {
  if (!value) return [] as T[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [] as T[];
  }
}

function offerSnapshot(value: string | null | undefined) {
  try { return value ? JSON.parse(value) as { features?: string[]; durationDays?: number; allowedClassTypes?: string[] } : null; } catch { return null; }
}

function snapshotClassSessions(value: string | null | undefined) {
  return offerSnapshot(value)?.allowedClassTypes?.map((classType) => ({ classId: classType, classType, sessions: 0 })) ?? null;
}

async function getAccountData(userId: string) {
  try {
    const [user, rewardSettings] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            membership: true,
            offer: true,
            bookings: {
              include: { schedule: { include: { class: { include: { trainer: true } } } } },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { startDate: "desc" },
          take: 30,
        },
        wallet: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } } },
        rewardPoints: { include: { history: { orderBy: { createdAt: "desc" }, take: 20 } } },
        referral: { include: { usages: { select: { id: true, rewardGiven: true } } } },
        bookings: {
          include: { schedule: { include: { class: { include: { trainer: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        orders: {
          include: {
            items: { include: { product: true } },
            paymentTransactions: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        privateApplications: {
          include: {
            trainer: { select: { id: true, name: true, specialty: true, image: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        notifications: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    }),
    getRewardSettings(),
    ]);

    if (!user) return null;

    const now24 = new Date();

    // ── Step 1: Fetch payment transactions for pending_payment memberships ──
    const pendingMembershipIds = user.memberships
      .filter((m) => m.status === "pending_payment" && m.pendingExpiresAt !== null)
      .map((m) => m.id);

    const pendingTxList = pendingMembershipIds.length
      ? await db.paymentTransaction.findMany({
          where: {
            membershipId: { in: pendingMembershipIds },
            status: { in: ["pending", "requires_action"] },
          },
          select: { membershipId: true, id: true, checkoutUrl: true },
          orderBy: { createdAt: "desc" }, // newest first
        })
      : [];

    // Build map: membershipId → latest checkout URL
    const pendingTxMap = new Map<string, { transactionId: string; checkoutUrl: string | null }>();
    for (const tx of pendingTxList) {
      if (!tx.membershipId || pendingTxMap.has(tx.membershipId)) continue;
      pendingTxMap.set(tx.membershipId, { transactionId: tx.id, checkoutUrl: tx.checkoutUrl ?? null });
    }

    // ── Step 2: Determine expired pending memberships (pendingExpiresAt <= now) ──
    const expiredPendingIds = new Set(
      user.memberships
        .filter((m) => {
          if (m.status !== "pending_payment" || !m.pendingExpiresAt) return false;
          return new Date(m.pendingExpiresAt) <= now24;
        })
        .map((m) => m.id),
    );

    const activeMembership = user.memberships.find((membership) => membership.status === "active") ?? null;

    // Only treat pending_payment as "live" if < 60 min have passed since creation
    const pendingPaymentMembership =
      user.memberships.find((m) => {
        if (m.status !== "pending_payment" || !m.pendingExpiresAt) return false;
        return new Date(m.pendingExpiresAt) > now24; // Not expired yet
      }) ?? null;

    // Reuse from pendingTxMap (already fetched above)
    const pendingPaymentTx = pendingPaymentMembership
      ? (pendingTxMap.get(pendingPaymentMembership.id) ?? null)
      : null;
    const classesUsed = user.bookings.filter(
      (booking) =>
        booking.status === "attended" &&
        activeMembership &&
        new Date(booking.createdAt) >= new Date(activeMembership.startDate),
    ).length;

    const productRewardIds = Array.from(
      new Set(
        user.memberships.flatMap((membership) =>
          parseJsonArray<{ productId?: string }>(membership.productRewardsUsed).map((reward) => reward.productId).filter(Boolean) as string[],
        ),
      ),
    );

    const rewardProducts = productRewardIds.length
      ? await db.product.findMany({
          where: { id: { in: productRewardIds } },
          select: { id: true, name: true, nameEn: true },
        })
      : [];

    const rewardProductMap = new Map(rewardProducts.map((product) => [product.id, product]));

    return {
      user: {
        id: user.id,
        name: user.name ?? "عضو",
        email: user.email ?? "",
        phone: user.phone ?? "",
        gender: user.gender ?? "",
        birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : "",
        governorate: user.governorate ?? "",
        address: user.address ?? "",
        role: user.role,
        adminPermissions: (() => { try { return user.adminPermissions ? JSON.parse(user.adminPermissions) : []; } catch { return []; } })(),
        createdAt: user.createdAt.toISOString(),
        emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
        hasPassword: !!user.password,
        avatar: user.avatar ?? null,
      },
      membership: activeMembership
        ? {
            id: activeMembership.id,
            plan: activeMembership.membership.name,
            kind: activeMembership.membership.kind,
            startDate: activeMembership.startDate.toISOString(),
            endDate: activeMembership.endDate.toISOString(),
            status: activeMembership.status,
            features: offerSnapshot(activeMembership.offerSnapshot)?.features ?? parseFeatures(activeMembership.membership.features),
            maxClasses: activeMembership.membership.maxClasses,
            classesUsed,
            paymentAmount: activeMembership.paymentAmount,
            paymentMethod: activeMembership.paymentMethod ?? "",
            offerTitle: activeMembership.offerTitle ?? null,
            classSessions: snapshotClassSessions(activeMembership.offerSnapshot) ?? parseJsonArray<{ classId: string; classType?: string; className?: string; sessions: number }>(activeMembership.membership.classSessions),
          }
        : null,
      membershipHistory: user.memberships
        // Hide memberships that are still pending_payment but past the 60 min window —
        // they are being auto-cancelled in the background and are meaningless to the customer.
        // Also hide admin-cancelled memberships that were never paid (paymentMethod is empty).
        .filter((membership) => {
          if (expiredPendingIds.has(membership.id)) return false;
          // Admin cancelled a never-paid membership → remove from customer view entirely
          if (membership.status === "cancelled" && !membership.paymentMethod) return false;
          return true;
        })
        .map((membership) => {
        const snapshot = offerSnapshot(membership.offerSnapshot);
        const features = snapshot?.features ?? parseFeatures(membership.membership.features);
        const attendedCount = membership.bookings.filter((booking) => booking.status === "attended").length;
        const totalSessions = membership.totalSessions ?? membership.membership.sessionsCount ?? membership.membership.maxClasses;
        const sessionsRemaining =
          totalSessions == null || totalSessions < 0 ? null : Math.max(0, totalSessions - attendedCount);
        const productRewards = parseJsonArray<{ productId?: string; quantity?: number }>(membership.productRewardsUsed).map((reward) => ({
          productId: reward.productId ?? "",
          quantity: reward.quantity ?? 0,
          name: reward.productId ? rewardProductMap.get(reward.productId)?.name ?? reward.productId : "",
        }));

        const pendingTx = membership.status === "pending_payment"
          ? pendingTxMap.get(membership.id) ?? null
          : null;

        // Check if pending_payment has expired (pendingExpiresAt <= now)
        const isExpiredPending =
          membership.status === "pending_payment" &&
          membership.pendingExpiresAt &&
          new Date(membership.pendingExpiresAt) <= now24;

        return {
          id: membership.id,
          plan: membership.membership.name,
          kind: membership.membership.kind,
          image: membership.membership.image ?? null,
          startDate: membership.startDate.toISOString(),
          endDate: membership.endDate.toISOString(),
          // expose as "cancelled" so the UI never shows a "متابعة الدفع" button for stale pending rows
          status: isExpiredPending ? "cancelled" : membership.status,
          paymentAmount: membership.paymentAmount,
          paymentMethod: membership.paymentMethod ?? "",
          offerTitle: membership.offerTitle ?? membership.offer?.title ?? null,
          durationDays: snapshot?.durationDays ?? membership.snapshotDurationDays ?? membership.membership.duration,
          features,
          maxClasses: membership.membership.maxClasses,
          totalSessions,
          classesUsed: attendedCount,
          sessionsRemaining,
          bookedCount: membership.bookings.length,
          checkoutUrl: isExpiredPending ? null : (pendingTx?.checkoutUrl ?? null),
          transactionId: isExpiredPending ? null : (pendingTx?.transactionId ?? null),
          classSessions: snapshotClassSessions(membership.offerSnapshot) ?? parseJsonArray<{ classId: string; classType?: string; className?: string; sessions: number }>(membership.membership.classSessions),
          bookings: membership.bookings.map((booking) => ({
            id: booking.id,
            className: booking.schedule.class.name,
            trainerName: booking.schedule.class.trainer.name,
            date: booking.schedule.date.toISOString(),
            time: booking.schedule.time,
            status: booking.status,
          })),
          productRewards: productRewards.filter((reward) => reward.productId && reward.quantity > 0),
        };
      }),
      pendingPayment: pendingPaymentMembership && pendingPaymentMembership.pendingExpiresAt
        ? {
            plan: pendingPaymentMembership.membership.name,
            amount: pendingPaymentMembership.paymentAmount,
            transactionId: pendingPaymentTx?.transactionId ?? null,
            checkoutUrl: pendingPaymentTx?.checkoutUrl ?? null,
            startDate: pendingPaymentMembership.startDate.toISOString(),
            pendingExpiresAt: pendingPaymentMembership.pendingExpiresAt.toISOString(),
            minutesRemaining: Math.max(
              1,
              Math.ceil(
                (new Date(pendingPaymentMembership.pendingExpiresAt).getTime() - now24.getTime()) / (60 * 1000),
              ),
            ),
          }
        : null,
      wallet: {
        balance: user.wallet?.balance ?? 0,
        transactions: (user.wallet?.transactions ?? []).map((tx) => ({
          id: tx.id,
          amount: tx.amount,
          type: tx.type,
          description: tx.description ?? "",
          createdAt: tx.createdAt.toISOString(),
        })),
      },
      rewards: {
        points: user.rewardPoints?.points ?? 0,
        tier: user.rewardPoints?.tier ?? "bronze",
        history: (user.rewardPoints?.history ?? []).map((entry) => ({
          id: entry.id,
          points: entry.points,
          reason: entry.reason,
          createdAt: entry.createdAt.toISOString(),
        })),
      },
      referral: user.referral
        ? {
            code: user.referral.code,
            totalEarned: user.referral.totalEarned,
            referredCount: user.referral.usages.length,
          }
        : null,
      onboarding: {
        profileComplete: !!(user.phone && user.gender && user.birthDate && user.governorate),
        emailVerified: !!user.emailVerified,
        hasReferral: (user.referral?.usages ?? []).some((u) => u.rewardGiven),
        hasPendingReferral: (user.referral?.usages ?? []).some((u) => !u.rewardGiven),
        profileRewardClaimed: user.rewardPoints?.history.some(
          (h) => h.reason === "onboarding_profile_complete"
        ) ?? false,
        emailRewardClaimed: user.rewardPoints?.history.some(
          (h) => h.reason === "onboarding_email_verified"
        ) ?? false,
        profilePoints: rewardSettings.onboardingProfilePoints,
        emailPoints: rewardSettings.onboardingEmailPoints,
      },
      bookings: user.bookings
        // Hide bookings tied to expired-pending or non-active memberships
        .filter((booking) => {
          if (!booking.userMembershipId) return true; // standalone booking
          if (expiredPendingIds.has(booking.userMembershipId)) return false;
          // Find the membership
          const membership = user.memberships.find((m) => m.id === booking.userMembershipId);
          return membership?.status === "active"; // only show if membership is active
        })
        .map((booking) => ({
          id: booking.id,
          scheduleId: booking.scheduleId,
          classId: booking.schedule.classId,
          className: booking.schedule.class.name,
          trainerName: booking.schedule.class.trainer.name,
          date: booking.schedule.date.toISOString(),
          time: booking.schedule.time,
          status: booking.status,
          type: booking.schedule.class.type,
          userMembershipId: booking.userMembershipId ?? null,
        })),
      orders: user.orders.map((order) => ({
        id: order.id,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        shippingFee: order.shippingFee,
        total: order.total,
        status: order.status,
        paymentMethod: order.paymentMethod,
        recipientName: order.recipientName ?? "",
        recipientPhone: order.recipientPhone ?? "",
        address: order.address ?? "",
        deliveryLabel: order.deliveryLabel ?? "",
        estimatedDeliveryDays: order.estimatedDeliveryDays ?? null,
        isClubPickup: order.isClubPickup,
        paymentStatus: order.paymentTransactions[0]?.status ?? null,
        checkoutUrl: order.paymentTransactions[0]?.checkoutUrl ?? null,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          size: item.size ?? "",
        })),
      })),
      privateApplications: user.privateApplications.map((application) => ({
        id: application.id,
        type: application.type,
        status: application.status,
        trainerName: application.trainer.name,
        trainerSpecialty: application.trainer.specialty,
        trainerImage: application.trainer.image ?? null,
        trainerNote: application.trainerNote ?? null,
        trainerPrice: application.trainerPrice ?? null,
        goals: parseJsonArray<string>(application.goalsJson),
        notes: application.notes ?? "",
        injuries: application.injuries ?? "",
        paidAt: application.paidAt ? application.paidAt.toISOString() : null,
        createdAt: application.createdAt.toISOString(),
      })),
      notifications: user.notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[ACCOUNT_PAGE]", error);
    return null;
  }
}

export default async function AccountPage() {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login?callbackUrl=%2Faccount");
  }

  const data = await getAccountData(user.id);

  if (!data) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-black text-center text-white">
        <div>
          <div className="mb-4 text-5xl">!</div>
          <h2 className="mb-2 text-xl font-black">لا توجد بيانات متاحة</h2>
          <p className="mb-6 text-gray-400">تعذر تحميل بيانات حسابك الآن. يمكنك المحاولة مرة أخرى بعد قليل.</p>
          <a href="/" className="rounded-xl bg-red-600 px-6 py-3 font-bold text-white">
            العودة إلى الرئيسية
          </a>
        </div>
      </div>
    );
  }

  return <AccountClient data={data} />;
}
