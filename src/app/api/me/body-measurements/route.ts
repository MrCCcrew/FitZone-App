import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const limits = {
  weightKg: [20, 400],
  heightCm: [80, 250],
  chestCm: [20, 250],
  waistCm: [20, 250],
  hipsCm: [20, 300],
  armCm: [10, 120],
  thighCm: [10, 160],
} as const;

type MeasurementField = keyof typeof limits;

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: privateHeaders },
    );
  }

  const measurements = await db.customerBodyMeasurement.findMany({
    where: { userId: user.id },
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json(
    { measurements },
    { headers: privateHeaders },
  );
}

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: privateHeaders },
    );
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: privateHeaders },
    );
  }

  const input = body as Record<string, unknown>;
  const allowed = new Set([
    ...Object.keys(limits),
    "notes",
  ]);

  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return NextResponse.json(
      { error: "Unexpected measurement field" },
      { status: 400, headers: privateHeaders },
    );
  }

  const data: Partial<Record<MeasurementField, number>> = {};

  for (const field of Object.keys(limits) as MeasurementField[]) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;

    const [min, max] = limits[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    ) {
      return NextResponse.json(
        { error: `Invalid ${field}` },
        { status: 400, headers: privateHeaders },
      );
    }
    data[field] = value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "At least one measurement is required" },
      { status: 400, headers: privateHeaders },
    );
  }

  const notes = input.notes;
  if (
    notes !== undefined &&
    notes !== null &&
    (typeof notes !== "string" || notes.length > 500)
  ) {
    return NextResponse.json(
      { error: "Invalid notes" },
      { status: 400, headers: privateHeaders },
    );
  }

  const measurement = await db.customerBodyMeasurement.create({
    data: {
      ...data,
      userId: user.id,
      notes: typeof notes === "string" ? notes.trim() || null : null,
    },
  });

  return NextResponse.json(
    { measurement },
    { status: 201, headers: privateHeaders },
  );
}