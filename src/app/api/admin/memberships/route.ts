import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("memberships");
  return "error" in guard ? guard.error : null;
}

const daysToLabel = (d: number) => (d <= 31 ? "monthly" : d <= 100 ? "quarterly" : "annual");
const labelToDays = (l: string) => (l === "monthly" ? 30 : l === "quarterly" ? 90 : 365);

export async function GET(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || undefined;

  const rows = await db.membership.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { name: "asc" },
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
        duration: daysToLabel(m.duration),
        features: (() => {
          try {
            return JSON.parse(m.features);
          } catch {
            return [];
          }
        })(),
        active: m.isActive,
        membersCount,
      };
    }),
  );

  return NextResponse.json(plans);
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;
  const body = await req.json();
  const { name, price, duration, features, kind } = body;
  if (!name || price == null) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const m = await db.membership.create({
    data: {
      name,
      kind: typeof kind === "string" ? kind : "subscription",
      price: Number(price),
      duration: labelToDays(duration ?? "monthly"),
      features: JSON.stringify(features ?? []),
      isActive: true,
    },
  });

  return NextResponse.json({
    id: m.id,
    name: m.name,
    kind: m.kind,
    price: m.price,
    duration: daysToLabel(m.duration),
    features: features ?? [],
    active: true,
    membersCount: 0,
  });
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;
  const body = await req.json();
  const { id, name, price, duration, features, active, kind } = body;
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (kind !== undefined && typeof kind === "string") data.kind = kind;
  if (price !== undefined) data.price = Number(price);
  if (duration !== undefined) data.duration = labelToDays(duration);
  if (features !== undefined) data.features = JSON.stringify(features);
  if (active !== undefined) data.isActive = active;

  const m = await db.membership.update({ where: { id }, data });
  const membersCount = await db.userMembership.count({ where: { membershipId: id, status: "active" } });
  return NextResponse.json({
    id: m.id,
    name: m.name,
    kind: m.kind,
    price: m.price,
    duration: daysToLabel(m.duration),
    features: (() => {
      try {
        return JSON.parse(m.features);
      } catch {
        return [];
      }
    })(),
    active: m.isActive,
    membersCount,
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
