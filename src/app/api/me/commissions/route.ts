import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

type CommissionRow = {
  id: string;
  amount: number;
  status: string;
  settledAt: string | null;
  createdAt: string;
  customerName: string;
  membershipName: string;
  source: string;
};

export async function GET() {
  const user = await getCurrentAppUser();

  if (!user?.id) {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول أولاً." },
      { status: 401 }
    );
  }

  const dbx = db as any;

  const [
    staff,
    trainer,
    nutrition,
    genericAgent,
    salesAgent,
    manager,
  ] = await Promise.all([
    db.staffCommission.findMany({
      where: { staffUserId: user.id },
      include: {
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

    db.trainerCommission.findMany({
      where: { trainerUserId: user.id },
      include: {
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

    dbx.nutritionCommission.findMany({
      where: { nutritionistUserId: user.id },
      include: {
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

    db.agentCommission.findMany({
      where: { agentUserId: user.id },
      include: {
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

    dbx.salesAgent.findUnique({
      where: { userId: user.id },
      include: {
        commissions: {
          include: {
            userMembership: {
              include: {
                user: { select: { name: true } },
                membership: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    }),

    dbx.contractsManager.findUnique({
      where: { userId: user.id },
      include: {
        commissions: {
          orderBy: { createdAt: "desc" },
          take: 200,
        },
        partnerCommissions: {
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    }),
  ]);

  const rows: CommissionRow[] = [];

  const addMembershipRows = (
    items: any[],
    source: string
  ) => {
    for (const c of items ?? []) {
      rows.push({
        id: `${source}:${c.id}`,
        amount: Number(c.amount || 0),
        status: c.status,
        settledAt: c.settledAt?.toISOString?.() ?? null,
        createdAt: c.createdAt.toISOString(),
        customerName: c.userMembership?.user?.name ?? "—",
        membershipName: c.userMembership?.membership?.name ?? "—",
        source,
      });
    }
  };

  addMembershipRows(staff, "staff");
  addMembershipRows(trainer, "trainer");
  addMembershipRows(nutrition, "nutrition");
  addMembershipRows(genericAgent, "agent");
  addMembershipRows(salesAgent?.commissions ?? [], "salesAgent");

  for (const c of manager?.commissions ?? []) {
    rows.push({
      id: `manager:${c.id}`,
      amount: Number(c.amount || 0),
      status: c.status,
      settledAt: c.settledAt?.toISOString?.() ?? null,
      createdAt: c.createdAt.toISOString(),
      customerName: "—",
      membershipName: "عمولة مدير عقود",
      source: "manager",
    });
  }

  for (const c of manager?.partnerCommissions ?? []) {
    rows.push({
      id: `managerPartner:${c.id}`,
      amount: Number(c.amount || 0),
      status: c.status,
      settledAt: c.settledAt?.toISOString?.() ?? null,
      createdAt: c.createdAt.toISOString(),
      customerName: "—",
      membershipName: "عمولة شريك مُدار",
      source: "managerPartner",
    });
  }

  rows.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );

  return NextResponse.json({
    commissions: rows,
    summary: {
      total: rows.reduce((s, c) => s + c.amount, 0),
      earned: rows
        .filter((c) => c.status === "earned" || c.status === "pending")
        .reduce((s, c) => s + c.amount, 0),
      settled: rows
        .filter((c) => c.status === "settled" || c.status === "withdrawn")
        .reduce((s, c) => s + c.amount, 0),
    },
  });
}
