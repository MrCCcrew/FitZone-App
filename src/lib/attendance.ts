import { randomBytes } from "crypto";
import type { Membership, PrivateSessionApplication, UserMembership } from "@prisma/client";
import { db } from "@/lib/db";

export const ATTENDANCE_QR_PREFIX = "FZATT";
export const PRIVATE_SESSION_TOTAL_SESSIONS = 12;

type MembershipWithPlan = UserMembership & {
  membership: Membership;
};

type PrivateApplicationWithTrainer = PrivateSessionApplication & {
  trainer?: { name: string } | null;
};

export function parseJsonStringArray(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isOpenTimeMembership(membership: Pick<Membership, "name" | "nameEn" | "features" | "featuresEn">) {
  const haystack = [
    normalizeText(membership.name),
    normalizeText(membership.nameEn),
    ...parseJsonStringArray(membership.features).map(normalizeText),
    ...parseJsonStringArray(membership.featuresEn).map(normalizeText),
  ].join(" ");

  return (
    haystack.includes("اوبن تايم") ||
    haystack.includes("أوبن تايم") ||
    haystack.includes("open time") ||
    haystack.includes("open-time")
  );
}

export function isMembershipEligibleForAttendance(membership: MembershipWithPlan) {
  return membership.status === "active" && !isOpenTimeMembership(membership.membership);
}

export function isPrivateApplicationEligibleForAttendance(application: { status: string; paidAt: Date | null; expiresAt?: Date | null }) {
  if (application.status !== "paid" && !application.paidAt) return false;
  if (application.expiresAt && new Date() > application.expiresAt) return false;
  return true;
}

export function buildAttendancePayload(code: string) {
  return `${ATTENDANCE_QR_PREFIX}:${code}`;
}

export function extractAttendanceCode(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith(`${ATTENDANCE_QR_PREFIX}:`)) {
    return raw.slice(`${ATTENDANCE_QR_PREFIX}:`.length).trim();
  }
  return raw;
}

function createAttendanceCode() {
  return randomBytes(18).toString("base64url");
}

function buildMembershipPassLabel(membership: MembershipWithPlan) {
  return membership.offerTitle?.trim() || membership.membership.name;
}

function buildPrivatePassLabel(application: PrivateApplicationWithTrainer) {
  const typeLabel = application.type === "mini_private" ? "Mini Private" : "Private";
  return application.trainer?.name ? `${typeLabel} - ${application.trainer.name}` : typeLabel;
}

export async function ensureMembershipAttendancePass(userMembershipId: string) {
  const existing = await db.attendancePass.findUnique({
    where: { userMembershipId },
    include: { userMembership: { include: { membership: true } } },
  });

  if (existing) return existing;

  const membership = await db.userMembership.findUnique({
    where: { id: userMembershipId },
    include: { membership: true },
  });

  if (!membership || !isMembershipEligibleForAttendance(membership)) {
    return null;
  }

  return db.attendancePass.create({
    data: {
      userId: membership.userId,
      userMembershipId: membership.id,
      code: createAttendanceCode(),
      kind: "membership",
      status: "active",
      label: buildMembershipPassLabel(membership),
    },
    include: { userMembership: { include: { membership: true } } },
  });
}

export async function ensurePrivateAttendancePass(privateSessionApplicationId: string) {
  const existing = await db.attendancePass.findUnique({
    where: { privateSessionApplicationId },
    include: { privateSessionApplication: true },
  });

  if (existing) return existing;

  const application = await db.privateSessionApplication.findUnique({
    where: { id: privateSessionApplicationId },
    include: { trainer: { select: { name: true } } },
  });

  if (!application || !isPrivateApplicationEligibleForAttendance(application)) {
    return null;
  }

  return db.attendancePass.create({
    data: {
      userId: application.userId,
      privateSessionApplicationId: application.id,
      code: createAttendanceCode(),
      kind: "private_session",
      status: "active",
      label: buildPrivatePassLabel(application),
    },
    include: { privateSessionApplication: true },
  });
}

export function getPrivateSessionsRemaining(checkInCount: number, totalSessions?: number | null) {
  const cap = totalSessions ?? PRIVATE_SESSION_TOTAL_SESSIONS;
  return Math.max(0, cap - checkInCount);
}
