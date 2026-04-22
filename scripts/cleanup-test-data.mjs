import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--confirm");
const includeUsers = args.has("--include-users");

async function main() {
  const memberUsers = await prisma.user.findMany({
    where: { role: "member" },
    select: { id: true, email: true, name: true },
  });

  const memberUserIds = memberUsers.map((user) => user.id);

  if (memberUserIds.length === 0) {
    console.log("No member users found. Nothing to clean.");
    return;
  }

  const scopedWhere = { userId: { in: memberUserIds } };

  const counts = {
    users: memberUserIds.length,
    memberships: await prisma.userMembership.count({ where: scopedWhere }),
    bookings: await prisma.booking.count({ where: scopedWhere }),
    orders: await prisma.order.count({ where: scopedWhere }),
    paymentTransactions: await prisma.paymentTransaction.count({ where: scopedWhere }),
    privateSessionApplications: await prisma.privateSessionApplication.count({ where: scopedWhere }),
    notifications: await prisma.notification.count({ where: scopedWhere }),
    complaints: await prisma.complaint.count({ where: scopedWhere }),
    testimonials: await prisma.testimonial.count({ where: scopedWhere }),
    productReviews: await prisma.productReview.count({ where: scopedWhere }),
    wallets: await prisma.wallet.count({ where: scopedWhere }),
    walletTransactions: await prisma.walletTransaction.count({
      where: { wallet: scopedWhere },
    }),
    rewardPoints: await prisma.rewardPoints.count({ where: scopedWhere }),
    rewardHistory: await prisma.rewardHistory.count({
      where: { reward: scopedWhere },
    }),
    referrals: await prisma.referral.count({ where: scopedWhere }),
    referralUsages: await prisma.referralUsage.count({
      where: {
        OR: [
          { referral: scopedWhere },
          { referredUserId: { in: memberUserIds } },
        ],
      },
    }),
  };

  console.log("Cleanup scope: member users transactional data");
  console.table(counts);

  if (dryRun) {
    console.log("Dry run only. Re-run with --confirm to apply deletion.");
    console.log("Optional: add --include-users if you also want to delete member user accounts.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.referralUsage.deleteMany({
      where: {
        OR: [
          { referral: scopedWhere },
          { referredUserId: { in: memberUserIds } },
        ],
      },
    });

    await tx.notification.deleteMany({ where: scopedWhere });
    await tx.complaint.deleteMany({ where: scopedWhere });
    await tx.testimonial.deleteMany({ where: scopedWhere });
    await tx.productReview.deleteMany({ where: scopedWhere });
    await tx.privateSessionApplication.deleteMany({ where: scopedWhere });
    await tx.paymentTransaction.deleteMany({ where: scopedWhere });
    await tx.booking.deleteMany({ where: scopedWhere });
    await tx.userMembership.deleteMany({ where: scopedWhere });
    await tx.order.deleteMany({ where: scopedWhere });
    await tx.walletTransaction.deleteMany({ where: { wallet: scopedWhere } });
    await tx.rewardHistory.deleteMany({ where: { reward: scopedWhere } });

    await tx.wallet.updateMany({
      where: scopedWhere,
      data: { balance: 0 },
    });

    await tx.rewardPoints.updateMany({
      where: scopedWhere,
      data: { points: 0, tier: "bronze" },
    });

    await tx.referral.updateMany({
      where: scopedWhere,
      data: {
        totalEarned: 0,
        referredCount: 0,
        subscriptionActivatedCount: 0,
      },
    });

    if (includeUsers) {
      await tx.user.deleteMany({
        where: { id: { in: memberUserIds }, role: "member" },
      });
    }
  });

  console.log("Cleanup completed successfully.");
}

main()
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
