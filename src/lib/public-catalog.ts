import type { Prisma } from "@prisma/client";

/** Single source of truth for customer-visible catalog records. */
export const visibleMembershipWhere = (): Prisma.MembershipWhereInput => ({ isActive: true });
export const visibleProductWhere = (): Prisma.ProductWhereInput => ({ isActive: true, deletedAt: null, OR: [{ trackInventory: false }, { stock: { gt: 0 } }] });
/** The public trainers page shows all active trainers; homepage placement is a separate concern. */
export const visibleTrainerWhere = (): Prisma.TrainerWhereInput => ({ isActive: true });

export const PUBLIC_TIME_ZONE = "Africa/Cairo";
const cairoFormatter = new Intl.DateTimeFormat("en-US", { timeZone: PUBLIC_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
type CivilParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond?: number };
function cairoParts(value: Date): CivilParts {
  const parts = Object.fromEntries(cairoFormatter.formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}
function cairoCivilToUtc(civil: CivilParts): Date {
  const desired = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second, 0);
  let guess = desired;
  for (let i = 0; i < 3; i += 1) {
    const actual = cairoParts(new Date(guess));
    guess += desired - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, 0);
  }
  return new Date(guess + (civil.millisecond ?? 0));
}
export function cairoDayWindow(now: Date, dayOffset = 0) {
  const today = cairoParts(now);
  const start = cairoCivilToUtc({ year: today.year, month: today.month, day: today.day + dayOffset, hour: 0, minute: 0, second: 0 });
  const end = cairoCivilToUtc({ year: today.year, month: today.month, day: today.day + dayOffset, hour: 23, minute: 59, second: 59, millisecond: 999 });
  return { from: start, to: end };
}
export function publicScheduleWindow(now = new Date()) {
  const today = cairoDayWindow(now);
  const endDay = cairoParts(now);
  const end = cairoCivilToUtc({ year: endDay.year, month: endDay.month, day: endDay.day + 14, hour: 23, minute: 59, second: 59, millisecond: 999 });
  return { from: new Date(today.from.getTime() - 6 * 60 * 60 * 1000), to: end };
}
export function visibleClassScheduleWhere(now = new Date()): Prisma.ClassWhereInput { const { from, to } = publicScheduleWindow(now); return { isActive: true, schedules: { some: { isActive: true, date: { gte: from, lte: to } } } }; }
export function visibleScheduleWhere(now = new Date()): Prisma.ScheduleWhereInput { const { from, to } = publicScheduleWindow(now); return { isActive: true, date: { gte: from, lte: to } }; }
