import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");

  if (
    process.env.APP_ENV !== "staging" ||
    url.pathname.replace(/^\//, "") !== "fitzone_staging"
  ) {
    throw new Error("REFUSING: this audit must run only against fitzone_staging");
  }

  const x = db as any;

  const [
    partnerCommissions,
    agentCommissions,
    salesAgentCommissions,
    staffCommissions,
    trainerCommissions,
    nutritionCommissions,
    managerCommissions,
    managerPartnerCommissions,
  ] = await Promise.all([
    x.partnerCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        status: true,
        withdrawnAt: true,
      },
    }),
    x.agentCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        status: true,
        settledAt: true,
      },
    }),
    x.salesAgentCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        status: true,
        settledAt: true,
      },
    }),
    x.staffCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        status: true,
        settledAt: true,
      },
    }),
    x.trainerCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        status: true,
        settledAt: true,
      },
    }),
    x.nutritionCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        nutritionSessionId: true,
        status: true,
        settledAt: true,
      },
    }),
    x.managerCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        status: true,
        settledAt: true,
      },
    }),
    x.managerPartnerCommission.findMany({
      select: {
        id: true,
        userMembershipId: true,
        status: true,
        settledAt: true,
      },
    }),
  ]);

  function summarize(
    name: string,
    rows: any[],
    paidStatus: string,
    paidAtField: string,
  ) {
    const paidWithoutTimestamp = rows.filter(
      (r) => r.status === paidStatus && !r[paidAtField],
    );

    const unpaidWithTimestamp = rows.filter(
      (r) => r.status !== paidStatus && r[paidAtField],
    );

    console.log(`\n=== ${name} ===`);
    console.log("count:", rows.length);
    console.log(
      "statuses:",
      rows.reduce((m: Record<string, number>, r) => {
        m[r.status] = (m[r.status] ?? 0) + 1;
        return m;
      }, {}),
    );
    console.log(
      `${paidStatus} without ${paidAtField}:`,
      paidWithoutTimestamp.length,
    );
    console.log(
      `non-${paidStatus} with ${paidAtField}:`,
      unpaidWithTimestamp.length,
    );
  }

  summarize(
    "PartnerCommission",
    partnerCommissions,
    "withdrawn",
    "withdrawnAt",
  );
  summarize(
    "AgentCommission",
    agentCommissions,
    "settled",
    "settledAt",
  );
  summarize(
    "SalesAgentCommission",
    salesAgentCommissions,
    "settled",
    "settledAt",
  );
  summarize(
    "StaffCommission",
    staffCommissions,
    "settled",
    "settledAt",
  );
  summarize(
    "TrainerCommission",
    trainerCommissions,
    "settled",
    "settledAt",
  );
  summarize(
    "NutritionCommission",
    nutritionCommissions,
    "settled",
    "settledAt",
  );
  summarize(
    "ManagerCommission",
    managerCommissions,
    "settled",
    "settledAt",
  );
  summarize(
    "ManagerPartnerCommission",
    managerPartnerCommissions,
    "settled",
    "settledAt",
  );

  const memberships = await x.userMembership.findMany({
    where: {
      OR: [
        { partnerId: { not: null } },
        { salesAgentUserId: { not: null } },
        { salesAgentId: { not: null } },
        { staffReferralLinkId: { not: null } },
        { trainerReferralLinkId: { not: null } },
        { nutritionReferralLinkId: { not: null } },
      ],
    },
    select: {
      id: true,
      status: true,
      paymentAmount: true,
      partnerId: true,
      partnerCodeId: true,
      affiliateLinkId: true,
      salesAgentUserId: true,
      salesAgentId: true,
      staffReferralLinkId: true,
      trainerReferralLinkId: true,
      nutritionReferralLinkId: true,
    },
  });

  const paidLike = memberships.filter((m: any) =>
    ["active", "expired", "cancelled"].includes(m.status),
  );

  const sets = {
    partner: new Set(
      partnerCommissions.map((x: any) => x.userMembershipId),
    ),
    agent: new Set(
      agentCommissions.map((x: any) => x.userMembershipId),
    ),
    salesAgent: new Set(
      salesAgentCommissions.map((x: any) => x.userMembershipId),
    ),
    staff: new Set(
      staffCommissions.map((x: any) => x.userMembershipId),
    ),
    trainer: new Set(
      trainerCommissions.map((x: any) => x.userMembershipId),
    ),
    nutrition: new Set(
      nutritionCommissions
        .map((x: any) => x.userMembershipId)
        .filter(Boolean),
    ),
  };

  const missing = {
    partner: paidLike.filter(
      (m: any) =>
        m.partnerId &&
        (m.partnerCodeId || m.affiliateLinkId) &&
        !sets.partner.has(m.id),
    ),
    agent: paidLike.filter(
      (m: any) =>
        m.salesAgentUserId &&
        !sets.agent.has(m.id),
    ),
    salesAgent: paidLike.filter(
      (m: any) =>
        m.salesAgentId &&
        !sets.salesAgent.has(m.id),
    ),
    staff: paidLike.filter(
      (m: any) =>
        m.staffReferralLinkId &&
        !sets.staff.has(m.id),
    ),
    trainer: paidLike.filter(
      (m: any) =>
        m.trainerReferralLinkId &&
        !sets.trainer.has(m.id),
    ),
    nutrition: paidLike.filter(
      (m: any) =>
        m.nutritionReferralLinkId &&
        !sets.nutrition.has(m.id),
    ),
  };

  console.log("\n=== ATTRIBUTED MEMBERSHIPS ===");
  console.log("attributed total:", memberships.length);
  console.log("paid-like attributed:", paidLike.length);

  console.log("\n=== ATTRIBUTION WITH NO COMMISSION ROW ===");
  for (const [type, rows] of Object.entries(missing)) {
    console.log(type, ":", (rows as any[]).length);

    for (const row of (rows as any[]).slice(0, 10)) {
      console.log(
        " ",
        row.id,
        "status=",
        row.status,
        "amount=",
        row.paymentAmount,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
