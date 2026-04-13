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

async function getAccountData(userId: string) {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "active" },
          include: { membership: true },
          orderBy: { startDate: "desc" },
          take: 1,
        },
        wallet: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } } },
        rewardPoints: { include: { history: { orderBy: { createdAt: "desc" }, take: 10 } } },
        referral: true,
        bookings: {
          include: { schedule: { include: { class: { include: { trainer: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        orders: {
          include: { items: { include: { product: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        notifications: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });

    if (!user) return null;

    const activeMembership = user.memberships[0];
    const classesUsed = user.bookings.filter(
      (booking) =>
        booking.status === "attended" &&
        activeMembership &&
        new Date(booking.createdAt) >= new Date(activeMembership.startDate),
    ).length;

    return {
      user: {
        id: user.id,
        name: user.name ?? "عضو",
        email: user.email ?? "",
        phone: user.phone ?? "",
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
        hasPassword: !!user.password,
      },
      membership: activeMembership
        ? {
            plan: activeMembership.membership.name,
            startDate: activeMembership.startDate.toISOString(),
            endDate: activeMembership.endDate.toISOString(),
            status: activeMembership.status,
            features: parseFeatures(activeMembership.membership.features),
            maxClasses: activeMembership.membership.maxClasses,
            classesUsed,
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
          }
        : null,
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
        total: order.total,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
        })),
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
