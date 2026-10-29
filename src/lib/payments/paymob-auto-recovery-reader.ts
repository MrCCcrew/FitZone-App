import type {
  PaymobRecoveryCandidateInput,
} from "./paymob-auto-recovery-candidate";

import {
  isPaymobReconciliationComplete,
} from "./paymob-auto-recovery-scanner";

type PaymentRow = {
  id: string;
  purpose: string;
  provider: string;
  status: string;
  membershipId: string | null;
  metadata: string | null;
};

type MembershipRow = {
  id: string;
  status: string;
};

export type RecoveryReaderDb = {
  paymentTransaction: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<PaymentRow | null>;
  };
  userMembership: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; status: true };
    }) => Promise<MembershipRow | null>;
  };
};

export async function readCurrentPaymobRecoveryCandidate(
  db: RecoveryReaderDb,
  paymentId: string,
): Promise<PaymobRecoveryCandidateInput | null> {
  if (!paymentId.trim()) {
    throw new Error("INVALID_RECOVERY_PAYMENT_ID");
  }

  const payment = await db.paymentTransaction.findUnique({
    where: { id: paymentId },
  });

  if (!payment) return null;

  const membership = payment.membershipId
    ? await db.userMembership.findUnique({
        where: { id: payment.membershipId },
        select: { id: true, status: true },
      })
    : null;

  return {
    purpose: payment.purpose,
    provider: payment.provider,
    paymentStatus: payment.status,
    membershipId: payment.membershipId,
    membershipStatus: membership?.status ?? null,
    reconciliationCompleted: isPaymobReconciliationComplete(
      payment.metadata,
      payment.membershipId,
    ) && membership?.status === "active",
  };
}
