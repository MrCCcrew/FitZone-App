import type { Prisma } from "@prisma/client";

/** Single source of truth for customer-visible catalog records. */
export const visibleMembershipWhere = (): Prisma.MembershipWhereInput => ({ isActive: true });
export const visibleProductWhere = (): Prisma.ProductWhereInput => ({ isActive: true, deletedAt: null, OR: [{ trackInventory: false }, { stock: { gt: 0 } }] });
/** The public trainers page shows all active trainers; homepage placement is a separate concern. */
export const visibleTrainerWhere = (): Prisma.TrainerWhereInput => ({ isActive: true });

export function publicScheduleWindow(now = new Date()) {
  const from = new Date(now); from.setHours(0, 0, 0, 0); from.setTime(from.getTime() - 6 * 60 * 60 * 1000);
  const to = new Date(now); to.setDate(to.getDate() + 14); to.setHours(23, 59, 59, 999);
  return { from, to };
}
export function visibleClassScheduleWhere(now = new Date()): Prisma.ClassWhereInput { const { from, to } = publicScheduleWindow(now); return { isActive: true, schedules: { some: { isActive: true, date: { gte: from, lte: to } } } }; }
export function visibleScheduleWhere(now = new Date()): Prisma.ScheduleWhereInput { const { from, to } = publicScheduleWindow(now); return { isActive: true, date: { gte: from, lte: to } }; }
