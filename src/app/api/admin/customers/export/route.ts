import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { hasAdminPermission } from "@/lib/admin-authorization";
import { buildXlsx, type CellValue } from "@/lib/xlsx-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdminFeature("customers");
  if ("error" in guard) return guard.error;

  const userRole = guard.role;

  let where: Record<string, unknown> = {
    role: "member",
  };

  if (userRole === "trainer") {
    const trainer = await db.trainer.findFirst({
      where: {
        userId: guard.session.user.id,
      },
      select: {
        id: true,
      },
    });

    if (!trainer) {
      where = {
        role: "member",
        id: "__NO_CUSTOMERS__",
      };
    } else {
      where = {
        role: "member",
        pendingApproval: false,
        bookings: {
          some: {
            schedule: {
              class: {
                trainerId: trainer.id,
              },
            },
          },
        },
      };
    }
  } else if (
    userRole === "staff" &&
    hasAdminPermission(
      {
        role: guard.role,
        permissions: guard.permissions,
      },
      "customer_followup_assigned_only",
    )
  ) {
    where = {
      role: "member",
      pendingApproval: false,
      marketingConversionsAsCustomer: {
        some: {
          assignedStaffUserId: guard.session.user.id,
          activeKey: { not: null },
        },
      },
    };
  }

  const users = await db.user.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      name: true,
      email: true,
      phone: true,
      isActive: true,
      marketingConversionsAsCustomer: {
        where:
          userRole === "staff" &&
          hasAdminPermission(
            {
              role: guard.role,
              permissions: guard.permissions,
            },
            "customer_followup_assigned_only",
          )
            ? {
                assignedStaffUserId: guard.session.user.id,
                activeKey: { not: null },
              }
            : {
                activeKey: { not: null },
              },
        orderBy: {
          assignedAt: "desc",
        },
        take: 1,
        select: {
          status: true,
          assignedAt: true,
          assignedStaff: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  const rows: CellValue[][] = [
    [
      "اسم العميل",
      "رقم الهاتف",
      "البريد الإلكتروني",
      "حالة الحساب",
      "حالة المتابعة",
      "موظف/موظفة المتابعة",
      "تاريخ الإسناد",
    ],
  ];

  for (const user of users) {
    const followup =
      user.marketingConversionsAsCustomer[0] ?? null;

    rows.push([
      user.name ?? "—",
      user.phone ?? "—",
      user.email ?? "—",
      user.isActive ? "نشط" : "غير نشط",
      followup?.status ?? "—",
      followup?.assignedStaff.name ??
        followup?.assignedStaff.email ??
        "—",
      followup?.assignedAt
        ? followup.assignedAt.toISOString().slice(0, 10)
        : "—",
    ]);
  }

  const buffer = buildXlsx([
    {
      name: "عملاء المتابعة",
      rows,
    },
  ]);

  const date =
    new Date().toISOString().slice(0, 10);

  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="customer-follow-up-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
