import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("memberships");
  return "error" in guard ? guard.error : null;
}

const cycleFromDays = (d: number) =>
  d <= 31 ? "monthly" : d <= 100 ? "quarterly" : d <= 200 ? "semi_annual" : "annual";
const labelToDays = (l: string) =>
  l === "monthly" ? 30 : l === "quarterly" ? 90 : l === "semi_annual" ? 180 : 365;

export async function GET(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || undefined;

  const rows = await db.membership.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { name: "asc" },
    include: { goals: { select: { goalId: true } } },
  });

  const plans = await Promise.all(
    rows.map(async (m) => {
      const membersCount = await db.userMembership.count({
        where: { membershipId: m.id, status: "active" },
      });
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        price: m.price,
        priceBefore: m.priceBefore ?? null,
        priceAfter: m.priceAfter ?? null,
        duration: m.duration,
        cycle: m.cycle ?? cycleFromDays(m.duration),
        sessionsCount: m.sessionsCount ?? null,
        classSessions: (() => {
          try {
            return m.classSessions ? JSON.parse(m.classSessions) : [];
          } catch {
            return [];
          }
        })(),
        productRewards: (() => {
          try {
            return m.productRewards ? JSON.parse(m.productRewards) : [];
          } catch {
            return [];
          }
        })(),
        features: (() => {
          try {
            return JSON.parse(m.features);
          } catch {
            return [];
          }
        })(),
        active: m.isActive,
        membersCount,
        goalIds: m.goals.map((goal) => goal.goalId),
      };
    }),
  );

  return NextResponse.json(plans);
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;
  const body = await req.json();
  const {
    name,
    price,
    priceBefore,
    priceAfter,
    duration,
    durationDays,
    features,
    kind,
    cycle,
    sessionsCount,
    classSessions,
    productRewards,
    goalIds,
  } = body;
  if (!name || price == null) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const days =
    typeof durationDays === "number"
      ? durationDays
      : typeof duration === "number"
        ? duration
        : typeof duration === "string"
          ? labelToDays(duration)
          : 30;

  const goals = Array.isArray(goalIds) ? goalIds.filter((id) => typeof id === "string" && id.trim()) : [];

  const m = await db.membership.create({
    data: {
      name,
      kind: typeof kind === "string" ? kind : "subscription",
      price: Number(price),
      priceBefore: priceBefore == null || priceBefore === "" ? null : Number(priceBefore),
      priceAfter: priceAfter == null || priceAfter === "" ? null : Number(priceAfter),
      duration: Math.max(1, Number(days)),
      cycle: typeof cycle === "string" ? cycle : typeof duration === "string" ? duration : null,
      sessionsCount: sessionsCount == null ? null : Number(sessionsCount),
      classSessions: JSON.stringify(classSessions ?? []),
      productRewards: JSON.stringify(productRewards ?? []),
      features: JSON.stringify(features ?? []),
      isActive: true,
      goals: goals.length
        ? {
            createMany: {
              data: goals.map((goalId) => ({ goalId })),
            },
          }
        : undefined,
    },
  });

  return NextResponse.json({
    id: m.id,
    name: m.name,
    kind: m.kind,
    price: m.price,
    priceBefore: m.priceBefore ?? null,
    priceAfter: m.priceAfter ?? null,
    duration: m.duration,
    cycle: m.cycle ?? cycleFromDays(m.duration),
    sessionsCount: m.sessionsCount ?? null,
    classSessions: classSessions ?? [],
    productRewards: productRewards ?? [],
    features: features ?? [],
    active: true,
    membersCount: 0,
    goalIds: goals,
  });
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;
  const body = await req.json();
  const {
    id,
    name,
    price,
    priceBefore,
    priceAfter,
    duration,
    durationDays,
    features,
    active,
    kind,
    cycle,
    sessionsCount,
    classSessions,
    productRewards,
    goalIds,
  } = body;
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (kind !== undefined && typeof kind === "string") data.kind = kind;
  if (price !== undefined) data.price = Number(price);
  if (priceBefore !== undefined) data.priceBefore = priceBefore == null || priceBefore === "" ? null : Number(priceBefore);
  if (priceAfter !== undefined) data.priceAfter = priceAfter == null || priceAfter === "" ? null : Number(priceAfter);
  if (durationDays !== undefined) data.duration = Math.max(1, Number(durationDays));
  if (duration !== undefined && durationDays === undefined) {
    data.duration = typeof duration === "number" ? Math.max(1, Number(duration)) : labelToDays(String(duration));
  }
  if (cycle !== undefined) data.cycle = cycle ? String(cycle) : null;
  if (sessionsCount !== undefined) data.sessionsCount = sessionsCount == null ? null : Number(sessionsCount);
  if (classSessions !== undefined) data.classSessions = JSON.stringify(classSessions ?? []);
  if (productRewards !== undefined) data.productRewards = JSON.stringify(productRewards ?? []);
  if (features !== undefined) data.features = JSON.stringify(features);
  if (active !== undefined) data.isActive = active;
  if (Array.isArray(goalIds)) {
    data.goals = {
      deleteMany: {},
      createMany: {
        data: goalIds
          .filter((goalId: unknown) => typeof goalId === "string" && goalId.trim())
          .map((goalId: string) => ({ goalId })),
      },
    };
  }

  const m = await db.membership.update({
    where: { id },
    data,
    include: { goals: { select: { goalId: true } } },
  });
  const membersCount = await db.userMembership.count({ where: { membershipId: id, status: "active" } });
  return NextResponse.json({
    id: m.id,
    name: m.name,
    kind: m.kind,
    price: m.price,
    priceBefore: m.priceBefore ?? null,
    priceAfter: m.priceAfter ?? null,
    duration: m.duration,
    cycle: m.cycle ?? cycleFromDays(m.duration),
    sessionsCount: m.sessionsCount ?? null,
    classSessions: (() => {
      try {
        return m.classSessions ? JSON.parse(m.classSessions) : [];
      } catch {
        return [];
      }
    })(),
    productRewards: (() => {
      try {
        return m.productRewards ? JSON.parse(m.productRewards) : [];
      } catch {
        return [];
      }
    })(),
    features: (() => {
      try {
        return JSON.parse(m.features);
      } catch {
        return [];
      }
    })(),
    active: m.isActive,
    membersCount,
    goalIds: m.goals.map((goal) => goal.goalId),
  });
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  await db.membership.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
