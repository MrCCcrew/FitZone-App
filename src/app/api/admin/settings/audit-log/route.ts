import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "100"), 1), 300);
  const actorUserId = searchParams.get("actorUserId") || undefined;
  const targetType = searchParams.get("targetType") || undefined;
  const action = searchParams.get("action") || undefined;
  const search = searchParams.get("search") || undefined;

  const logs = await db.auditLog.findMany({
    where: {
      actorUserId,
      targetType,
      action,
      OR: search
        ? [
            { actorName: { contains: search } },
            { actorEmail: { contains: search } },
            { actorRole: { contains: search } },
            { targetType: { contains: search } },
            { targetId: { contains: search } },
          ]
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      actorUserId: true,
      actorName: true,
      actorEmail: true,
      actorRole: true,
      action: true,
      targetType: true,
      targetId: true,
      details: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    logs: logs.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}
