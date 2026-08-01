import type { Prisma } from "@prisma/client";

/** The single definition of an offer visible to public customers. */
export function activePublicOfferWhere(now = new Date()): Prisma.OfferWhereInput {
  return { isActive: true, expiresAt: { gt: now } };
}
