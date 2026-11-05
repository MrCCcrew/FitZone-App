import "server-only";

import { asDbTransactionClient, db } from "@/lib/db";
import {
  isBlockingMembershipCarryoverReason,
  previewMembershipSessionCarryoverTx,
} from "@/lib/membership-session-carryover";

type FrozenFriendOfferTerms = {
  offerId: string;
  membershipId: string;
  sessionsCount?: number | null;
  durationDays?: number | null;
};

export type FriendOfferCarryoverCustomerPreview = {
  eligible: boolean;
  reason: string;
  baseSessions: number | null;
  freeCarryoverSessions: number;
  transferredReservedUnits: number;
  carryoverSessions: number;
  expectedTotalSessions: number | null;
  blocking: boolean;
  targetMembershipId: string;
  targetOfferId: string;
  previewedAt: string;
};

export class FriendOfferCarryoverPreviewError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FriendOfferCarryoverPreviewError";
  }
}

function parseFrozenTerms(value: string | null): FrozenFriendOfferTerms {
  if (!value) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "بيانات عرض الصحاب المجمدة غير متاحة.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "بيانات عرض الصحاب المجمدة غير صالحة.",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "بيانات عرض الصحاب المجمدة غير صالحة.",
    );
  }

  const record = parsed as Record<string, unknown>;
  const offerId = typeof record.offerId === "string" ? record.offerId.trim() : "";
  const membershipId =
    typeof record.membershipId === "string" ? record.membershipId.trim() : "";

  if (!offerId || !membershipId) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "بيانات عرض الصحاب المجمدة غير مكتملة.",
    );
  }

  const sessionsCount =
    record.sessionsCount === null
      ? null
      : typeof record.sessionsCount === "number"
        ? record.sessionsCount
        : undefined;

  if (
    sessionsCount !== undefined &&
    sessionsCount !== null &&
    (!Number.isInteger(sessionsCount) || sessionsCount < 0)
  ) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "عدد جلسات عرض الصحاب المجمد غير صالح.",
    );
  }

  const durationDays =
    record.durationDays === null
      ? null
      : typeof record.durationDays === "number"
        ? record.durationDays
        : undefined;

  if (
    durationDays !== undefined &&
    durationDays !== null &&
    (!Number.isInteger(durationDays) || durationDays <= 0)
  ) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "مدة عرض الصحاب المجمدة غير صالحة.",
    );
  }

  return {
    offerId,
    membershipId,
    sessionsCount,
    durationDays,
  };
}

function addUtcCalendarDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function previewFriendOfferCarryoverForCustomer(
  userId: string,
  token: string,
  now = new Date(),
): Promise<FriendOfferCarryoverCustomerPreview> {
  const normalizedToken = String(token ?? "").trim();

  if (!normalizedToken) {
    throw new FriendOfferCarryoverPreviewError(
      400,
      "رمز مجموعة عرض الصحاب مطلوب.",
    );
  }

  const group = await db.friendOfferGroup.findUnique({
    where: { inviteToken: normalizedToken },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      offerTermsSnapshot: true,
      eligibilitySnapshot: true,
      config: {
        select: {
          isActive: true,
          offer: {
            select: {
              id: true,
              isActive: true,
              expiresAt: true,
            },
          },
        },
      },
      participants: {
        select: {
          userId: true,
          status: true,
        },
      },
    },
  });

  if (!group) {
    throw new FriendOfferCarryoverPreviewError(
      404,
      "مجموعة عرض الصحاب غير موجودة.",
    );
  }

  const hasEconomicCommitment = group.participants.some(
    (participant) =>
      participant.status === "paid" || participant.status === "activated",
  );

  const mutableTermsUnavailable =
    group.status === "expired" ||
    group.expiresAt.getTime() <= now.getTime() ||
    !group.config.isActive ||
    !group.config.offer.isActive ||
    group.config.offer.expiresAt.getTime() <= now.getTime();

  if (
    group.status === "cancelled" ||
    group.status === "completed" ||
    (!hasEconomicCommitment && mutableTermsUnavailable)
  ) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "مجموعة عرض الصحاب غير متاحة للدفع حاليًا.",
    );
  }

  const participant = group.participants.find(
    (row) => row.userId === userId,
  );

  if (!participant || participant.status === "cancelled") {
    throw new FriendOfferCarryoverPreviewError(
      403,
      "أنتِ لستِ مشاركة فعالة في هذه المجموعة.",
    );
  }

  const terms = parseFrozenTerms(group.offerTermsSnapshot);

  if (terms.offerId !== group.config.offer.id) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "هوية عرض الصحاب المجمدة لا تطابق المجموعة.",
    );
  }

  const membership = await db.membership.findUnique({
    where: { id: terms.membershipId },
    select: { kind: true },
  });

  if (!membership) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "خطة الاشتراك المجمدة لعرض الصحاب غير متاحة.",
    );
  }

  const durationDays = Number(terms.durationDays ?? 30);

  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new FriendOfferCarryoverPreviewError(
      409,
      "مدة عرض الصحاب المجمدة غير صالحة.",
    );
  }

  const baseSessions = terms.sessionsCount ?? null;
  const startDate = new Date(now);
  const endDate = addUtcCalendarDays(startDate, durationDays);

  const preview = await db.$transaction((tx) =>
    previewMembershipSessionCarryoverTx(asDbTransactionClient(tx), {
      userId,
      target: {
        membershipId: terms.membershipId,
        offerId: terms.offerId,
        eligibilitySnapshot: group.eligibilitySnapshot,
        allowedClassTypesSnapshot: null,
        baseSessions,
        startDate,
        endDate,
        kind: membership.kind,
      },
    }),
  );

  return {
    eligible: preview.eligible,
    reason: preview.reason,
    baseSessions: preview.baseSessions,
    freeCarryoverSessions: preview.freeCarryoverSessions,
    transferredReservedUnits: preview.transferredReservedUnits,
    carryoverSessions: preview.carryoverSessions,
    expectedTotalSessions: preview.expectedTotalSessions,
    blocking: isBlockingMembershipCarryoverReason(preview.reason),
    targetMembershipId: terms.membershipId,
    targetOfferId: terms.offerId,
    previewedAt: startDate.toISOString(),
  };
}
