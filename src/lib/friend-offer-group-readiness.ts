/**
 * Frozen friend-offer contract: every required seat must be occupied
 * before any new Paymob checkout can be created or reused.
 * Used for historic and newly created groups alike.
 */
export function assessFriendOfferGroupReadiness(group: {
  status: string;
  priceSnapshotMinor: number;
  config: { requiredMembers: number };
  participants: Array<{
    userId: string;
    status: string;
    shareAmountMinor: number;
  }>;
}) {
  const requiredMembers = group.config.requiredMembers;
  const active = group.participants.filter(
    (row) => row.status !== "cancelled",
  );

  const joinedMembers = active.length;
  const missingMembers = Number.isSafeInteger(requiredMembers)
    ? Math.max(0, requiredMembers - joinedMembers)
    : 0;

  const ready =
    group.status === "ready" &&
    Number.isSafeInteger(requiredMembers) &&
    requiredMembers >= 2 &&
    requiredMembers <= 10 &&
    joinedMembers === requiredMembers &&
    Number.isSafeInteger(group.priceSnapshotMinor) &&
    group.priceSnapshotMinor > 0 &&
    new Set(active.map((row) => row.userId)).size === requiredMembers &&
    active.every(
      (row) =>
        typeof row.userId === "string" &&
        row.userId.length > 0 &&
        [
          "joined",
          "checkout_claiming",
          "checkout_started",
          "paid",
          "activated",
        ].includes(row.status) &&
        Number.isSafeInteger(row.shareAmountMinor) &&
        row.shareAmountMinor > 0,
    ) &&
    active.reduce(
      (sum, row) => sum + row.shareAmountMinor,
      0,
    ) === group.priceSnapshotMinor;

  return {
    ready,
    requiredMembers,
    joinedMembers,
    missingMembers,
  };
}
