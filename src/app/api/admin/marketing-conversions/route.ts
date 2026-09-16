import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { logAudit } from "@/lib/audit-context";
import {
  assignMarketingConversion,
  cancelMarketingConversion,
  MarketingConversionError,
  reassignMarketingConversion,
} from "@/lib/marketing-conversion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (!(error instanceof MarketingConversionError)) {
    console.error("[MARKETING_CONVERSIONS]", error);
    return NextResponse.json(
      { error: "تعذر تنفيذ عملية متابعة التسويق." },
      { status: 500 },
    );
  }

  switch (error.code) {
    case "CUSTOMER_NOT_FOUND":
      return NextResponse.json(
        { error: "العميل غير موجود." },
        { status: 404 },
      );

    case "STAFF_NOT_FOUND":
      return NextResponse.json(
        { error: "موظفة التسويق غير موجودة أو الحساب غير نشط." },
        { status: 400 },
      );

    case "ACTIVE_CONVERSION_EXISTS":
      return NextResponse.json(
        { error: "يوجد بالفعل متابعة تسويق نشطة لهذا العميل." },
        { status: 409 },
      );

    case "CONVERSION_NOT_FOUND":
      return NextResponse.json(
        { error: "متابعة التسويق غير موجودة أو انتهت بالفعل." },
        { status: 404 },
      );

    case "CONVERSION_LOCKED":
      return NextResponse.json(
        {
          error:
            "لا يمكن تغيير موظفة التسويق بعد دخول المتابعة في مرحلة الشراء.",
        },
        { status: 409 },
      );
  }
}

export async function GET() {
  const guard = await requireAdminPermission("marketing_conversions_manage");
  if ("error" in guard) return guard.error;

  const employees = await db.user.findMany({
    where: {
      role: "staff",
      isActive: true,
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      jobTitle: true,
      marketingCommissionRate: true,
      marketingCommissionType: true,
    },
  });

  return NextResponse.json({ employees });
}

export async function POST(req: Request) {
  const guard = await requireAdminPermission("marketing_conversions_manage");
  if ("error" in guard) return guard.error;

  try {
    const payload = await req.json();

    const customerId = String(payload.customerId ?? "").trim();
    const assignedStaffUserId = String(
      payload.assignedStaffUserId ?? "",
    ).trim();

    if (!customerId || !assignedStaffUserId) {
      return NextResponse.json(
        { error: "العميل وموظفة التسويق مطلوبان." },
        { status: 400 },
      );
    }

    const conversion = await assignMarketingConversion({
      customerId,
      assignedStaffUserId,
      createdByUserId: guard.session.id,
      notes:
        typeof payload.notes === "string"
          ? payload.notes
          : null,
    });

    await logAudit({
      action: "marketing_conversion_assign",
      targetType: "MarketingConversion",
      targetId: conversion.id,
      details: {
        customerId,
        assignedStaffUserId,
      },
    });

    return NextResponse.json(
      { success: true, conversion },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  const guard = await requireAdminPermission("marketing_conversions_manage");
  if ("error" in guard) return guard.error;

  try {
    const payload = await req.json();

    const conversionId = String(payload.conversionId ?? "").trim();
    const action = String(payload.action ?? "").trim();

    if (!conversionId) {
      return NextResponse.json(
        { error: "معرف متابعة التسويق مطلوب." },
        { status: 400 },
      );
    }

    if (action === "reassign") {
      const assignedStaffUserId = String(
        payload.assignedStaffUserId ?? "",
      ).trim();

      if (!assignedStaffUserId) {
        return NextResponse.json(
          { error: "موظفة التسويق الجديدة مطلوبة." },
          { status: 400 },
        );
      }

      const conversion = await reassignMarketingConversion({
        conversionId,
        assignedStaffUserId,
      });

      await logAudit({
        action: "marketing_conversion_reassign",
        targetType: "MarketingConversion",
        targetId: conversion.id,
        details: {
          assignedStaffUserId,
        },
      });

      return NextResponse.json({
        success: true,
        conversion,
      });
    }

    if (action === "cancel") {
      const conversion = await cancelMarketingConversion({
        conversionId,
      });

      await logAudit({
        action: "marketing_conversion_cancel",
        targetType: "MarketingConversion",
        targetId: conversion.id,
      });

      return NextResponse.json({
        success: true,
        conversion,
      });
    }

    return NextResponse.json(
      { error: "الإجراء غير صحيح." },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
