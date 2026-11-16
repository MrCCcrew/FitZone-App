import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const guard = await requireAdminFeature("customers");

  if ("error" in guard) return guard.error;

  // Customer-list permissions do not grant access to body measurements.
  if (guard.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: privateHeaders },
    );
  }

  const userId = new URL(req.url).searchParams.get("userId")?.trim();

  if (!userId || userId.length > 191) {
    return NextResponse.json(
      { error: "Valid userId is required" },
      { status: 400, headers: privateHeaders },
    );
  }

  const customer = await db.user.findFirst({
    where: { id: userId, role: "member" },
    select: { id: true },
  });

  if (!customer) {
    return NextResponse.json(
      { error: "Customer not found" },
      { status: 404, headers: privateHeaders },
    );
  }

  const measurements = await db.customerBodyMeasurement.findMany({
    where: { userId: customer.id },
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json(
    { measurements },
    { headers: privateHeaders },
  );
}