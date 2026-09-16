import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db, asDbTransactionClient } from "@/lib/db";
import {
  settleCommissionsTx,
  type CommissionType,
} from "@/lib/commissions/commission-settlement-service";

/* MARKETING_ADMIN_SETTLEMENT_SYSTEMIC */

export async function GET(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const agentUserId = searchParams.get("agentUserId") || undefined;
  const status = searchParams.get("status") || "all";

  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");

  const dateFrom = rawFrom
    ? (() => {
        const d = new Date(rawFrom);
        d.setHours(0, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
      })()
    : null;

  const dateTo = rawTo
    ? (() => {
        const d = new Date(rawTo);
        d.setHours(23, 59, 59, 999);
        return isNaN(d.getTime()) ? null : d;
      })()
    : null;

  const commonWhere: Record<string, unknown> = {};

  if (status !== "all") commonWhere.status = status;

  if (dateFrom || dateTo) {
    commonWhere.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const [
    agentCommissions,
    staffCommissions,
    trainerCommissions,
    marketingCommissions,
    agents,
  ] = await Promise.all([
      db.agentCommission.findMany({
        where: {
          ...commonWhere,
          ...(agentUserId ? { agentUserId } : {}),
        },
        include: {
          agentUser: {
            select: { id: true, name: true, email: true, role: true },
          },
          userMembership: {
            include: {
              user: { select: { name: true } },
              membership: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),

      db.staffCommission.findMany({
        where: {
          ...commonWhere,
          ...(agentUserId ? { staffUserId: agentUserId } : {}),
        },
        include: {
          staffUser: {
            select: { id: true, name: true, email: true, role: true },
          },
          userMembership: {
            include: {
              user: { select: { name: true } },
              membership: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),

      db.trainerCommission.findMany({
        where: {
          ...commonWhere,
          ...(agentUserId ? { trainerUserId: agentUserId } : {}),
        },
        include: {
          trainerUser: {
            select: { id: true, name: true, email: true, role: true },
          },
          userMembership: {
            include: {
              user: { select: { name: true } },
              membership: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),

      db.marketingCommission.findMany({
        where: {
          ...commonWhere,
          ...(agentUserId ? { staffUserId: agentUserId } : {}),
        },
        include: {
          staffUser: {
            select: { id: true, name: true, email: true, role: true },
          },
          userMembership: {
            include: {
              user: { select: { name: true } },
              membership: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),

      db.user.findMany({
        where: {
          OR: [
            {
              role: { in: ["staff", "trainer"] },
              commissionRate: { gt: 0 },
            },
            {
              role: "staff",
              marketingCommissionRate: { gt: 0 },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          commissionRate: true,
          commissionType: true,
          marketingCommissionRate: true,
          marketingCommissionType: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

  const commissions = [
    ...agentCommissions.map((c) => ({
      id: `agent:${c.id}`,
      sourceType: "agent" as const,
      amount: c.amount,
      paymentAmount: c.userMembership.paymentAmount,
      commissionTypeSnapshot: null,
      commissionRateSnapshot: null,
      commissionBaseSnapshot: null,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      agentUser: c.agentUser,
      customerName: c.userMembership.user.name ?? "—",
      membershipName: c.userMembership.membership.name,
      membershipId: c.userMembershipId,
    })),

    ...staffCommissions.map((c) => ({
      id: `staff:${c.id}`,
      sourceType: "staff" as const,
      amount: c.amount,
      paymentAmount: c.userMembership?.paymentAmount ?? null,
      commissionTypeSnapshot: null,
      commissionRateSnapshot: null,
      commissionBaseSnapshot: null,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      agentUser: c.staffUser,
      customerName: c.userMembership?.user?.name ?? "—",
      membershipName: c.userMembership?.membership?.name ?? "—",
      membershipId: c.userMembershipId,
    })),

    ...trainerCommissions.map((c) => ({
      id: `trainer:${c.id}`,
      sourceType: "trainer" as const,
      amount: c.amount,
      paymentAmount: c.userMembership?.paymentAmount ?? null,
      commissionTypeSnapshot: null,
      commissionRateSnapshot: null,
      commissionBaseSnapshot: null,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      agentUser: c.trainerUser,
      customerName: c.userMembership?.user?.name ?? "—",
      membershipName: c.userMembership?.membership?.name ?? "—",
      membershipId: c.userMembershipId,
    })),

    ...marketingCommissions.map((c) => ({
      id: `marketing:${c.id}`,
      sourceType: "marketing" as const,
      amount: c.amount,
      paymentAmount: c.userMembership.paymentAmount,
      commissionTypeSnapshot: c.commissionTypeSnapshot,
      commissionRateSnapshot: c.commissionRateSnapshot,
      commissionBaseSnapshot: c.commissionBaseSnapshot,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      agentUser: c.staffUser,
      customerName: c.userMembership.user.name ?? "—",
      membershipName: c.userMembership.membership.name,
      membershipId: c.userMembershipId,
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const totals = commissions.reduce(
    (acc, c) => {
      if (c.status === "earned") acc.earned += c.amount;
      if (c.status === "settled") acc.settled += c.amount;
      return acc;
    },
    { earned: 0, settled: 0 },
  );

  return NextResponse.json({
    commissions,
    agents,
    totals,
  });
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  if (guard.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  /* EMPLOYEE_COMMISSION_FINAL_HARDENING */
  const actorUserId = guard.session.user.id;

  try {
    const body = (await req.json()) as {
      ids?: string[];
      status?: string;
    };

    if (!body.ids?.length || body.status !== "settled") {
      return NextResponse.json(
        { error: "ids ومعرّف الحالة مطلوبان." },
        { status: 400 },
      );
    }

    const parsed = body.ids.map((value) => {
      const [source, id] = value.split(":", 2);

      if (
        !id ||
        !["agent", "staff", "trainer", "marketing"].includes(source)
      ) {
        throw new Error("INVALID_COMMISSION_IDENTIFIER");
      }

      return { source, id };
    });

    const sourceTypes = [...new Set(parsed.map((item) => item.source))];

    if (sourceTypes.length !== 1) {
      return NextResponse.json(
        {
          error:
            "يجب تسوية نوع واحد من العمولات في كل عملية. لا تخلط عمولة الإحالة مع عمولة إغلاق التسويق.",
        },
        { status: 409 },
      );
    }

    const source = sourceTypes[0];

    const commissionTypeMap: Record<string, CommissionType> = {
      agent: "agent_user",
      staff: "staff",
      trainer: "trainer",
      marketing: "marketing",
    };

    const commissionType = commissionTypeMap[source];
    const commissionIds = parsed.map((item) => item.id);

    let rows: Array<{ id: string; beneficiaryId: string }> = [];

    if (source === "agent") {
      rows = await db.agentCommission.findMany({
        where: { id: { in: commissionIds } },
        select: {
          id: true,
          agentUserId: true,
        },
      }).then((items) =>
        items.map((item) => ({
          id: item.id,
          beneficiaryId: item.agentUserId,
        })),
      );
    } else if (source === "staff") {
      rows = await db.staffCommission.findMany({
        where: { id: { in: commissionIds } },
        select: {
          id: true,
          staffUserId: true,
        },
      }).then((items) =>
        items.map((item) => ({
          id: item.id,
          beneficiaryId: item.staffUserId,
        })),
      );
    } else if (source === "trainer") {
      rows = await db.trainerCommission.findMany({
        where: { id: { in: commissionIds } },
        select: {
          id: true,
          trainerUserId: true,
        },
      }).then((items) =>
        items.map((item) => ({
          id: item.id,
          beneficiaryId: item.trainerUserId,
        })),
      );
    } else {
      rows = await db.marketingCommission.findMany({
        where: { id: { in: commissionIds } },
        select: {
          id: true,
          staffUserId: true,
        },
      }).then((items) =>
        items.map((item) => ({
          id: item.id,
          beneficiaryId: item.staffUserId,
        })),
      );
    }

    if (rows.length !== commissionIds.length) {
      return NextResponse.json(
        { error: "إحدى العمولات المحددة غير موجودة." },
        { status: 404 },
      );
    }

    const beneficiaryIds = [
      ...new Set(rows.map((row) => row.beneficiaryId)),
    ];

    if (beneficiaryIds.length !== 1) {
      return NextResponse.json(
        {
          error:
            "يجب تسوية عمولات موظف واحد فقط في كل عملية.",
        },
        { status: 409 },
      );
    }

    const beneficiaryId = beneficiaryIds[0];

    const result = await db.$transaction(async (tx) =>
      settleCommissionsTx(asDbTransactionClient(tx), {
        commissionType,
        beneficiaryId,
        commissionIds,
        paymentMethod: "admin_manual",
        notes: "تسوية يدوية من شاشة عمولات الموظفين",
        actorUserId,
      }),
    );

    return NextResponse.json({
      success: true,
      payoutId: result.payout.id,
      totalAmount: Number(result.payout.totalAmount),
      settledCount: result.payout.items.length,
      idempotent: result.idempotent,
    });
  } catch (error) {
    console.error("[ADMIN_EMPLOYEE_COMMISSIONS_SETTLEMENT]", error);

    const message =
      error instanceof Error ? error.message : "UNKNOWN_ERROR";

    if (message === "INVALID_COMMISSION_IDENTIFIER") {
      return NextResponse.json(
        { error: "معرّف العمولة غير صالح." },
        { status: 400 },
      );
    }

    if (
      message === "COMMISSION_SETTLEMENT_NOT_OPEN" ||
      message === "COMMISSION_SETTLEMENT_COMMISSION_NOT_FOUND" ||
      message === "COMMISSION_SETTLEMENT_BENEFICIARY_MISMATCH" ||
      message === "COMMISSION_SETTLEMENT_DUPLICATE_IDS"
    ) {
      return NextResponse.json(
        { error: "تعذر تنفيذ التسوية لأن حالة إحدى العمولات تغيرت. حدّث البيانات وحاول مرة أخرى." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "تعذر تسوية العمولات." },
      { status: 500 },
    );
  }
}
