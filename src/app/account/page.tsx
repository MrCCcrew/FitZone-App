import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import AccountClient from "./AccountClient";

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
    const user = await db.user.findUnique({
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
    });

    if (!user) return null;

    const activeMembership = user.memberships.find((membership) => membership.status === "active") ?? user.memberships[0] ?? null;
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
          }
        : null,
      membershipHistory: user.memberships.map((membership) => {
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

        return {
          id: membership.id,
          plan: membership.membership.name,
          kind: membership.membership.kind,
          image: membership.membership.image ?? null,
          startDate: membership.startDate.toISOString(),
          endDate: membership.endDate.toISOString(),
          status: membership.status,
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
      },
      bookings: user.bookings.map((booking) => ({
        id: booking.id,
        scheduleId: booking.scheduleId,
        classId: booking.schedule.classId,
        className: booking.schedule.class.name,
        trainerName: booking.schedule.class.trainer.name,
        date: booking.schedule.date.toISOString(),
        time: booking.schedule.time,
        status: booking.status,
        type: booking.schedule.class.type,
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
