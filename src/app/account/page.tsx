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
        referral: { include: { usages: { select: { id: true } } } },
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

    const PENDING_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 h
    const now24 = new Date();

    // ── Step 1: Fetch payment transactions for ALL pending_payment memberships ──
    // We use TX.createdAt (when payment was initiated) — NOT startDate which can be a future membership date.
    const pendingMembershipIds = user.memberships
      .filter((m) => m.status === "pending_payment")
      .map((m) => m.id);

    const pendingTxList = pendingMembershipIds.length
      ? await db.paymentTransaction.findMany({
          where: {
            membershipId: { in: pendingMembershipIds },
            status: { in: ["pending", "requires_action"] },
          },
          select: { membershipId: true, id: true, checkoutUrl: true, createdAt: true },
          orderBy: { createdAt: "desc" }, // newest first
        })
      : [];

    // Build two maps from one pass (ordered DESC):
    //   pendingTxMap         → latest tx per membership (for checkout URL)
    //   pendingTxCreatedAtMap → oldest tx per membership (= when payment was first initiated)
    const pendingTxMap = new Map<string, { transactionId: string; checkoutUrl: string | null }>();
    const pendingTxCreatedAtMap = new Map<string, Date>();
    for (const tx of pendingTxList) {
      if (!tx.membershipId) continue;
      // latest checkout URL (only first hit since we iterate DESC)
      if (!pendingTxMap.has(tx.membershipId)) {
        pendingTxMap.set(tx.membershipId, { transactionId: tx.id, checkoutUrl: tx.checkoutUrl ?? null });
      }
      // oldest createdAt (always overwrite — last write in DESC iteration = oldest record)
      pendingTxCreatedAtMap.set(tx.membershipId, tx.createdAt);
    }

    // ── Step 2: Determine expired pending memberships ──
    // A pending_payment membership is "expired" when >= 24 h have passed since payment was initiated.
    // We use the TX createdAt as the reference; fall back to startDate only if no TX exists.
    const expiredPendingIds = new Set(
      user.memberships
        .filter((m) => {
          if (m.status !== "pending_payment") return false;
          const refTime = pendingTxCreatedAtMap.get(m.id) ?? new Date(m.startDate);
          return now24.getTime() - refTime.getTime() >= PENDING_EXPIRE_MS;
        })
        .map((m) => m.id),
    );

    // ── Step 3: Fire-and-forget DELETION of expired pending memberships ──
    if (expiredPendingIds.size > 0) {
      const expiredList = [...expiredPendingIds];
      // Cancel the payment transactions first (they reference membershipId as a plain string — no FK cascade)
      Promise.all([
        db.paymentTransaction.updateMany({
          where: { membershipId: { in: expiredList }, status: { in: ["pending", "requires_action"] } },
          data: { status: "cancelled" },
        }),
        // Delete all bookings tied to these memberships
        db.booking.deleteMany({
          where: { userMembershipId: { in: expiredList } },
        }),
      ])
        .then(() =>
          // Finally delete the memberships themselves (cascades commissions)
          db.userMembership.deleteMany({
            where: { id: { in: expiredList }, status: "pending_payment" },
          }),
        )
        .catch((err) => console.error("[AUTO_DELETE_EXPIRED_PENDING]", err));
    }

    const activeMembership = user.memberships.find((membership) => membership.status === "active") ?? null;

    // Only treat pending_payment as "live" if < 24 h have passed since payment initiation
    const pendingPaymentMembership =
      user.memberships.find((m) => {
        if (m.status !== "pending_payment") return false;
        const refTime = pendingTxCreatedAtMap.get(m.id) ?? new Date(m.startDate);
        return now24.getTime() - refTime.getTime() < PENDING_EXPIRE_MS;
      }) ?? null;

    // Reuse from pendingTxMap (already fetched above)
    const pendingPaymentTx = pendingPaymentMembership
      ? (pendingTxMap.get(pendingPaymentMembership.id) ?? null)
      : null;
    const pendingPaymentRefTime = pendingPaymentMembership
      ? (pendingTxCreatedAtMap.get(pendingPaymentMembership.id) ?? new Date(pendingPaymentMembership.startDate))
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
      },
      membership: activeMembership
        ? {
            id: activeMembership.id,
            plan: activeMembership.membership.name,
            kind: activeMembership.membership.kind,
            startDate: activeMembership.startDate.toISOString(),
            endDate: activeMembership.endDate.toISOString(),
            status: activeMembership.status,
            features: parseFeatures(activeMembership.membership.features),
            maxClasses: activeMembership.membership.maxClasses,
            classesUsed,
            paymentAmount: activeMembership.paymentAmount,
            paymentMethod: activeMembership.paymentMethod ?? "",
            offerTitle: activeMembership.offerTitle ?? null,
            classSessions: parseJsonArray<{ classId: string; classType?: string; className?: string; sessions: number }>(
              activeMembership.membership.classSessions,
            ),
          }
        : null,
      membershipHistory: user.memberships
        // Hide memberships that are still pending_payment but past the 24 h window —
        // they are being auto-cancelled in the background and are meaningless to the customer.
        // Also hide admin-cancelled memberships that were never paid (paymentMethod is empty).
        .filter((membership) => {
          if (expiredPendingIds.has(membership.id)) return false;
          // Admin cancelled a never-paid membership → remove from customer view entirely
          if (membership.status === "cancelled" && !membership.paymentMethod) return false;
          return true;
        })
        .map((membership) => {
        const features = parseFeatures(membership.membership.features);
        const attendedCount = membership.bookings.filter((booking) => booking.status === "attended").length;
        const totalSessions = membership.totalSessions ?? membership.membership.sessionsCount ?? membership.membership.maxClasses;
        const sessionsRemaining =
          totalSessions == null || totalSessions < 0 ? null : Math.max(0, totalSessions - membership.bookings.length);
        const productRewards = parseJsonArray<{ productId?: string; quantity?: number }>(membership.productRewardsUsed).map((reward) => ({
          productId: reward.productId ?? "",
          quantity: reward.quantity ?? 0,
          name: reward.productId ? rewardProductMap.get(reward.productId)?.name ?? reward.productId : "",
        }));

        const pendingTx = membership.status === "pending_payment"
          ? pendingTxMap.get(membership.id) ?? null
          : null;

        // If a pending_payment membership is older than 24 h from payment initiation, hide the payment CTA
        const membershipRefTime = pendingTxCreatedAtMap.get(membership.id) ?? new Date(membership.startDate);
        const isExpiredPending =
          membership.status === "pending_payment" &&
          now24.getTime() - membershipRefTime.getTime() >= PENDING_EXPIRE_MS;

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
          durationDays: membership.membership.duration,
          features,
          maxClasses: membership.membership.maxClasses,
          totalSessions,
          classesUsed: attendedCount,
          sessionsRemaining,
          bookedCount: membership.bookings.length,
          checkoutUrl: isExpiredPending ? null : (pendingTx?.checkoutUrl ?? null),
          transactionId: isExpiredPending ? null : (pendingTx?.transactionId ?? null),
          classSessions: parseJsonArray<{ classId: string; classType?: string; className?: string; sessions: number }>(
            membership.membership.classSessions,
          ),
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
      pendingPayment: pendingPaymentMembership
        ? {
            plan: pendingPaymentMembership.membership.name,
            amount: pendingPaymentMembership.paymentAmount,
            transactionId: pendingPaymentTx?.transactionId ?? null,
            checkoutUrl: pendingPaymentTx?.checkoutUrl ?? null,
            startDate: pendingPaymentMembership.startDate.toISOString(),
            // Use TX.createdAt (when payment was initiated) for the countdown — NOT startDate
            hoursRemaining: Math.max(
              1,
              Math.ceil(
                (PENDING_EXPIRE_MS - (now24.getTime() - (pendingPaymentRefTime?.getTime() ?? now24.getTime()))) /
                  (60 * 60 * 1000),
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
        hasReferral: (user.referral?.usages.length ?? 0) > 0,
        profileRewardClaimed: user.rewardPoints?.history.some(
          (h) => h.reason === "onboarding_profile_complete"
        ) ?? false,
        emailRewardClaimed: user.rewardPoints?.history.some(
          (h) => h.reason === "onboarding_email_verified"
        ) ?? false,
        profilePoints: rewardSettings.onboardingProfilePoints,
        emailPoints: rewardSettings.onboardingEmailPoints,
        referralRewardDisplay:
          rewardSettings.referralRewardType === "wallet"
            ? `${rewardSettings.referralRewardValue} ج.م`
            : `${rewardSettings.referralRewardValue} نقطة`,
      },
      bookings: user.bookings
        // Hide bookings tied to expired-pending memberships
        .filter((booking) => !booking.userMembershipId || !expiredPendingIds.has(booking.userMembershipId))
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
