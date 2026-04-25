import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";
import { clearPublicApiCache } from "@/lib/public-cache";
import { deleteMembershipAndLinkedClientData } from "@/lib/admin-linked-cleanup";

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
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
        nameEn: m.nameEn ?? "",
        kind: m.kind,
        price: m.price,
        priceBefore: m.priceBefore ?? null,
        priceAfter: m.priceAfter ?? null,
        image: m.image ?? null,
        sortOrder: m.sortOrder ?? 0,
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
        featuresEn: (() => {
          try {
            return m.featuresEn ? JSON.parse(m.featuresEn) : [];
          } catch {
            return [];
          }
        })(),
        gift: m.gift ?? null,
        giftEn: m.giftEn ?? null,
        isFeatured: m.isFeatured ?? false,
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
    nameEn,
    price,
    priceBefore,
    priceAfter,
    duration,
    durationDays,
    features,
    featuresEn,
    kind,
    cycle,
    sessionsCount,
    classSessions,
    productRewards,
    goalIds,
    image,
    sortOrder,
    gift,
    giftEn,
    isFeatured,
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
      nameEn: nameEn == null ? "" : String(nameEn),
      kind: typeof kind === "string" ? kind : "subscription",
      price: Number(price),
      priceBefore: priceBefore == null || priceBefore === "" ? null : Number(priceBefore),
      priceAfter: priceAfter == null || priceAfter === "" ? null : Number(priceAfter),
      image: image == null || image === "" ? null : String(image),
      sortOrder: typeof sortOrder === "number" ? sortOrder : Number(sortOrder ?? 0) || 0,
      duration: Math.max(1, Number(days)),
      cycle: typeof cycle === "string" ? cycle : typeof duration === "string" ? duration : null,
      sessionsCount: sessionsCount == null ? null : Number(sessionsCount),
      classSessions: JSON.stringify(classSessions ?? []),
      productRewards: JSON.stringify(productRewards ?? []),
      features: JSON.stringify(features ?? []),
      featuresEn: JSON.stringify(featuresEn ?? []),
      gift: gift == null || gift === "" ? null : String(gift),
      giftEn: giftEn == null || giftEn === "" ? null : String(giftEn),
      isFeatured: isFeatured === true,
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

  void logAudit({ action: "create", targetType: "membership", targetId: m.id, details: { name: m.name, price: m.price } });
  clearPublicApiCache();
  return NextResponse.json({
    id: m.id,
    name: m.name,
    nameEn: m.nameEn ?? "",
    kind: m.kind,
    price: m.price,
    priceBefore: m.priceBefore ?? null,
    priceAfter: m.priceAfter ?? null,
    image: m.image ?? null,
    sortOrder: m.sortOrder ?? 0,
    duration: m.duration,
    cycle: m.cycle ?? cycleFromDays(m.duration),
    sessionsCount: m.sessionsCount ?? null,
    classSessions: classSessions ?? [],
    productRewards: productRewards ?? [],
    features: features ?? [],
    featuresEn: featuresEn ?? [],
    gift: m.gift ?? null,
    giftEn: m.giftEn ?? null,
    isFeatured: m.isFeatured ?? false,
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
    nameEn,
    price,
    priceBefore,
    priceAfter,
    duration,
    durationDays,
    features,
    featuresEn,
    active,
    kind,
    cycle,
    sessionsCount,
    classSessions,
    productRewards,
    goalIds,
    image,
    sortOrder,
    gift,
    giftEn,
    isFeatured,
  } = body;
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (nameEn !== undefined) data.nameEn = nameEn == null ? "" : String(nameEn);
  if (kind !== undefined && typeof kind === "string") data.kind = kind;
  if (price !== undefined) data.price = Number(price);
  if (priceBefore !== undefined) data.priceBefore = priceBefore == null || priceBefore === "" ? null : Number(priceBefore);
  if (priceAfter !== undefined) data.priceAfter = priceAfter == null || priceAfter === "" ? null : Number(priceAfter);
  if (image !== undefined) data.image = image == null || image === "" ? null : String(image);
  if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
  if (durationDays !== undefined) data.duration = Math.max(1, Number(durationDays));
  if (duration !== undefined && durationDays === undefined) {
    data.duration = typeof duration === "number" ? Math.max(1, Number(duration)) : labelToDays(String(duration));
  }
  if (cycle !== undefined) data.cycle = cycle ? String(cycle) : null;
  if (sessionsCount !== undefined) data.sessionsCount = sessionsCount == null ? null : Number(sessionsCount);
  if (classSessions !== undefined) data.classSessions = JSON.stringify(classSessions ?? []);
  if (productRewards !== undefined) data.productRewards = JSON.stringify(productRewards ?? []);
  if (features !== undefined) data.features = JSON.stringify(features);
  if (featuresEn !== undefined) data.featuresEn = JSON.stringify(featuresEn ?? []);
  if (gift !== undefined) data.gift = gift == null || gift === "" ? null : String(gift);
  if (giftEn !== undefined) data.giftEn = giftEn == null || giftEn === "" ? null : String(giftEn);
  if (isFeatured !== undefined) data.isFeatured = isFeatured === true;
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
  void logAudit({ action: "update", targetType: "membership", targetId: id, details: { name: m.name, changes: Object.keys(data) } });
  clearPublicApiCache();
  const membersCount = await db.userMembership.count({ where: { membershipId: id, status: "active" } });
  return NextResponse.json({
    id: m.id,
    name: m.name,
    nameEn: m.nameEn ?? "",
    kind: m.kind,
    price: m.price,
    priceBefore: m.priceBefore ?? null,
    priceAfter: m.priceAfter ?? null,
    image: m.image ?? null,
    sortOrder: m.sortOrder ?? 0,
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
    featuresEn: (() => {
      try {
        return m.featuresEn ? JSON.parse(m.featuresEn) : [];
      } catch {
        return [];
      }
    })(),
    gift: m.gift ?? null,
    giftEn: m.giftEn ?? null,
    isFeatured: m.isFeatured ?? false,
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
  const m = await db.membership.findUnique({ where: { id }, select: { name: true } });
  if (!m) return NextResponse.json({ error: "الاشتراك غير موجود." }, { status: 404 });
  const cleanup = await db.$transaction((tx) => deleteMembershipAndLinkedClientData(tx, id));
  void logAudit({
    action: "delete",
    targetType: "membership",
    targetId: id,
    details: {
      name: m.name,
      deletedOffers: cleanup.deletedOffers,
      deletedMemberships: cleanup.deletedMemberships,
      deletedBookings: cleanup.deletedBookings,
    },
  });
  clearPublicApiCache();
  return NextResponse.json({ success: true });
}
