import { Prisma } from "@prisma/client";
import { db, asDbTransactionClient } from "@/lib/db";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";

const NO_SUBSCRIPTION_PLAN = "\u0628\u062f\u0648\u0646 \u0627\u0634\u062a\u0631\u0627\u0643";

export type AdminMembershipRecoveryResult =
  | "recovered"
  | "already_active_same_plan"
  | "blocked_by_active_membership"
  | "plan_not_found"
  | "recoverable_membership_not_found"
  | "paid_transaction_not_found"
  | "recovery_lost_race";

type RecoveryInput = {
  userId: string;
  planName?: string;
};

export async function recoverPaidMembershipForAdminTx(
  tx: Prisma.TransactionClient,
  input: RecoveryInput,
): Promise<AdminMembershipRecoveryResult> {
  let nextPlanName = input.planName;

  if (!nextPlanName || nextPlanName === NO_SUBSCRIPTION_PLAN) {
    const latestMembership = await tx.userMembership.findFirst({
      where: { userId: input.userId },
      include: { membership: true },
      orderBy: { startDate: "desc" },
    });

    nextPlanName = latestMembership?.membership.name;
  }

  if (!nextPlanName || nextPlanName === NO_SUBSCRIPTION_PLAN) {
    return "plan_not_found";
  }

  const plan = await tx.membership.findFirst({
    where: {
      name: nextPlanName,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!plan) {
    return "plan_not_found";
  }

  // Serialize admin recovery with successful payment activation.
  await lockMembershipLifecycleUserTx(tx, input.userId);

  const activeMembership = await tx.userMembership.findFirst({
    where: {
      userId: input.userId,
      status: "active",
    },
    select: {
      id: true,
      membershipId: true,
    },
    orderBy: {
      startDate: "desc",
    },
  });

  if (activeMembership?.membershipId === plan.id) {
    return "already_active_same_plan";
  }

  if (activeMembership) {
    return "blocked_by_active_membership";
  }

  const recoverableMembership = await tx.userMembership.findFirst({
    where: {
      userId: input.userId,
      membershipId: plan.id,
      status: "expired",
      endDate: {
        gt: new Date(),
      },
    },
    orderBy: {
      startDate: "desc",
    },
    select: {
      id: true,
    },
  });

  if (!recoverableMembership) {
    return "recoverable_membership_not_found";
  }

  const paidTransaction = await tx.paymentTransaction.findFirst({
    where: {
      membershipId: recoverableMembership.id,
      status: "paid",
    },
    select: {
      id: true,
    },
  });

  if (!paidTransaction) {
    return "paid_transaction_not_found";
  }

  const recovered = await tx.userMembership.updateMany({
    where: {
      id: recoverableMembership.id,
      userId: input.userId,
      membershipId: plan.id,
      status: "expired",
    },
    data: {
      status: "active",
    },
  });

  return recovered.count === 1 ? "recovered" : "recovery_lost_race";
}

function isRetryableTransactionConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export async function recoverPaidMembershipForAdmin(
  input: RecoveryInput,
): Promise<AdminMembershipRecoveryResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await db.$transaction(
        (tx) =>
          recoverPaidMembershipForAdminTx(
            asDbTransactionClient(tx),
            input,
          ),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );
    } catch (error) {
      lastError = error;

      if (!isRetryableTransactionConflict(error) || attempt === 3) {
        throw error;
      }
    }
  }

  throw lastError;
}
