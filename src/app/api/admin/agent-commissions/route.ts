import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const agentUserId = searchParams.get("agentUserId") || undefined;
  const status = searchParams.get("status") || "all";

  const where: Record<string, unknown> = {};
  if (agentUserId) where.agentUserId = agentUserId;
  if (status !== "all") where.status = status;

  const [commissions, agents] = await Promise.all([
    db.agentCommission.findMany({
      where,
      include: {
        agentUser: { select: { id: true, name: true, email: true, role: true } },
        userMembership: {
          include: {
            user: { select: { name: true } },
            membership: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.user.findMany({
      where: {
        OR: [
          { role: "staff" },
          { role: "trainer" },
        ],
        agentCommissions: { some: {} },
      },
      select: { id: true, name: true, role: true, commissionRate: true, commissionType: true },
    }),
  ]);

  const totals = commissions.reduce(
    (acc, c) => {
      if (c.status === "earned") acc.earned += c.amount;
      if (c.status === "settled") acc.settled += c.amount;
      return acc;
    },
    { earned: 0, settled: 0 },
  );

  return NextResponse.json({
    commissions: commissions.map((c) => ({
      id: c.id,
      amount: c.amount,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      agentUser: c.agentUser,
      customerName: c.userMembership.user.name ?? "—",
      membershipName: c.userMembership.membership.name,
      membershipId: c.userMembershipId,
    })),
    agents,
    totals,
  });
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;
  if (guard.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = (await req.json()) as { ids?: string[]; status?: string };
    if (!body.ids?.length || body.status !== "settled") {
      return NextResponse.json({ error: "ids ومعرّف الحالة مطلوبان." }, { status: 400 });
    }

    await db.agentCommission.updateMany({
      where: { id: { in: body.ids }, status: "earned" },
      data: { status: "settled", settledAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_AGENT_COMMISSIONS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث العمولات." }, { status: 500 });
  }
}
