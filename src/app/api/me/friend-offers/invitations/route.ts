import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const makeToken = () => randomBytes(24).toString("base64url");

type EconomicParticipant = {
  status: string;
  paymentTransactionId: string | null;
  userMembershipId: string | null;
  paymentTransaction: { status: string } | null;
};
function economicLock(rows: EconomicParticipant[]) {
  return rows.some(row =>
    ["checkout_claiming", "checkout_started", "paid", "activated"].includes(row.status) ||
    row.paymentTransactionId != null || row.userMembershipId != null ||
    ["pending", "requires_action", "paid"].includes(row.paymentTransaction?.status ?? "")
  );
}

async function mutate(req: Request, action: "create" | "cancel") {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول." }, { status: 401 });
  const body = await req.json().catch(() => null) as { groupId?: string; invitationId?: string } | null;
  const groupId = typeof body?.groupId === "string" ? body.groupId.trim() : "";
  const invitationId = typeof body?.invitationId === "string" ? body.invitationId.trim() : "";
  if (!groupId || (action === "cancel" && !invitationId)) {
    return NextResponse.json({ error: "بيانات الدعوة غير مكتملة." }, { status: 400 });
  }
  try {
    const result = await db.$transaction(async tx => {
      const lock = await tx.$queryRaw<Array<{id: string}>>`
        SELECT id FROM FriendOfferGroup WHERE id=${groupId} FOR UPDATE
      `;
      if (lock.length !== 1) return { kind: "NOT_FOUND" as const };
      const group = await tx.friendOfferGroup.findUnique({
        where: { id: groupId },
        include: {
          config: { select: { requiredMembers: true } },
          participants: {
            select: { status: true, paymentTransactionId: true,
              userMembershipId: true,
              paymentTransaction: { select: { status: true } } },
          },
          individualInvites: {
            where: { status: "pending", expiresAt: { gt: new Date() } },
            select: { id: true },
          },
        },
      });
      if (!group || group.creatorUserId !== user.id || !group.individualInvitesEnabled) {
        return { kind: "NOT_FOUND" as const };
      }
      if (economicLock(group.participants) ||
          group.expiresAt <= new Date() || group.status !== "waiting") {
        return { kind: "LOCKED" as const };
      }
      if (action === "cancel") {
        const cancelled = await tx.friendOfferInviteLink.updateMany({
          where: { id: invitationId, groupId: group.id, status: "pending" },
          data: { status: "cancelled", cancelledAt: new Date() },
        });
        return cancelled.count === 1 ? {kind: "CANCELLED" as const} : {kind: "NOT_FOUND" as const};
      }
      const joined = group.participants.filter(p => p.status !== "cancelled").length;
      if (joined + group.individualInvites.length >= group.config.requiredMembers) {
        return { kind: "FULL" as const };
      }
      const link = await tx.friendOfferInviteLink.create({
        data: { groupId: group.id, token: makeToken(), expiresAt: group.expiresAt },
        select: { id: true, token: true, expiresAt: true },
      });
      return { kind: "CREATED" as const, link };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "CREATED") {
      return NextResponse.json({ success: true, invitation: result.link });
    }
    if (result.kind === "CANCELLED") return NextResponse.json({success: true, cancelled: true});
    return NextResponse.json({
      error: result.kind === "FULL" ? "لا توجد أماكن دعوة جديدة. ألغِي دعوة معلقة أولًا." :
             result.kind === "LOCKED" ? "لا يمكن تغيير الدعوات بعد بدء الدفع أو انتهاء المجموعة." :
             "الدعوة غير موجودة أو ليست ملكك.",
    }, {status: result.kind === "NOT_FOUND" ? 404 : 409});
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({error:"حدث تعارض، حدّثي الصفحة وأعيدي المحاولة."},{status:409});
    }
    console.error("[FRIEND_INVITE_MUTATION]", error);
    return NextResponse.json({error:"تعذر تحديث الدعوة."},{status:500});
  }
}

export async function POST(req: Request) { return mutate(req, "create"); }
export async function DELETE(req: Request) { return mutate(req, "cancel"); }
