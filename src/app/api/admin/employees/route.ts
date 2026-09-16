import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import { normalizeOptionalText } from "@/lib/employees/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPLOYMENT_STATUSES = new Set([
  "active",
  "inactive",
  "on_leave",
  "terminated",
]);

function normalizeEmployeeCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "");
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDate(value: unknown, field: string) {
  if (value == null || value === "") return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`INVALID_DATE:${field}`);
  }

  return date;
}

function normalizeEmploymentStatus(value: unknown) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!EMPLOYMENT_STATUSES.has(status)) {
    throw new Error("INVALID_EMPLOYMENT_STATUS");
  }

  return status;
}

async function assertDepartmentExists(id: string | null) {
  if (!id) return;

  const row = await db.department.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!row) {
    throw new Error("DEPARTMENT_NOT_FOUND");
  }
}

async function assertPositionExists(id: string | null) {
  if (!id) return;

  const row = await db.position.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!row) {
    throw new Error("POSITION_NOT_FOUND");
  }
}

const includeEmployeeRelations = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      jobTitle: true,
      adminAccess: true,
      isActive: true,
      avatar: true,
    },
  },
  department: {
    select: {
      id: true,
      code: true,
      name: true,
      nameEn: true,
      isActive: true,
    },
  },
  position: {
    select: {
      id: true,
      code: true,
      name: true,
      nameEn: true,
      isActive: true,
    },
  },
} satisfies Prisma.EmployeeProfileInclude;

type EmployeeWithRelations = Prisma.EmployeeProfileGetPayload<{
  include: typeof includeEmployeeRelations;
}>;

function serializeEmployee(row: EmployeeWithRelations) {
  return {
    id: row.id,
    employeeCode: row.employeeCode,

    // HR identity is authoritative and does not depend on a login account.
    name: row.name,
    phone: row.phone,
    avatar: row.avatar,

    userId: row.userId,
    hasLoginAccount: Boolean(row.userId),

    departmentId: row.departmentId,
    positionId: row.positionId,

    hireDate: row.hireDate?.toISOString() ?? null,
    employmentEndDate: row.employmentEndDate?.toISOString() ?? null,
    employmentStatus: row.employmentStatus,
    payrollEnabled: row.payrollEnabled,
    notes: row.notes,

    user: row.user
      ? {
          id: row.user.id,
          name: row.user.name ?? "",
          email: row.user.email,
          phone: row.user.phone,
          role: row.user.role,
          jobTitle: row.user.jobTitle,
          adminAccess: row.user.adminAccess,
          isActive: row.user.isActive,
          avatar: row.user.avatar,
        }
      : null,

    department: row.department,
    position: row.position,

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function employeeError(error: unknown, operation: "create" | "update") {
  if (error instanceof Error) {
    if (error.message.startsWith("INVALID_DATE:")) {
      return NextResponse.json(
        { error: "أحد التواريخ المدخلة غير صالح." },
        { status: 400 },
      );
    }

    if (error.message === "INVALID_EMPLOYMENT_STATUS") {
      return NextResponse.json(
        { error: "حالة الموظف غير صالحة." },
        { status: 400 },
      );
    }

    if (error.message === "DEPARTMENT_NOT_FOUND") {
      return NextResponse.json(
        { error: "القسم المحدد غير موجود." },
        { status: 400 },
      );
    }

    if (error.message === "POSITION_NOT_FOUND") {
      return NextResponse.json(
        { error: "المسمى الوظيفي المحدد غير موجود." },
        { status: 400 },
      );
    }
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      {
        error: "كود الموظف مستخدم بالفعل أو حساب المستخدم مرتبط بموظف آخر.",
      },
      { status: 409 },
    );
  }

  console.error(
    operation === "create"
      ? "[ADMIN_EMPLOYEES_POST]"
      : "[ADMIN_EMPLOYEES_PATCH]",
    error,
  );

  return NextResponse.json(
    {
      error:
        operation === "create"
          ? "تعذر إنشاء ملف الموظف."
          : "تعذر تحديث ملف الموظف.",
    },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  const guard = await requireAdminPermission("employees_view");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);

  const search = String(searchParams.get("search") ?? "").trim();
  const status = String(searchParams.get("status") ?? "")
    .trim()
    .toLowerCase();
  const departmentId = String(searchParams.get("departmentId") ?? "").trim();
  const positionId = String(searchParams.get("positionId") ?? "").trim();

  const where: Prisma.EmployeeProfileWhereInput = {};

  if (status) {
    if (!EMPLOYMENT_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "حالة الموظف غير صالحة." },
        { status: 400 },
      );
    }

    where.employmentStatus = status;
  }

  if (departmentId) {
    where.departmentId = departmentId;
  }

  if (positionId) {
    where.positionId = positionId;
  }

  if (search) {
    where.OR = [
      { employeeCode: { contains: search } },
      { name: { contains: search } },
      { phone: { contains: search } },
      {
        user: {
          is: {
            name: { contains: search },
          },
        },
      },
      {
        user: {
          is: {
            email: { contains: search },
          },
        },
      },
      {
        user: {
          is: {
            phone: { contains: search },
          },
        },
      },
    ];
  }

  const rows = await db.employeeProfile.findMany({
    where,
    orderBy: [
      { employmentStatus: "asc" },
      { name: "asc" },
      { createdAt: "desc" },
    ],
    include: includeEmployeeRelations,
  });

  return NextResponse.json({
    employees: rows.map(serializeEmployee),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdminPermission("employees_manage");
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json();

    const employeeCode = normalizeEmployeeCode(body.employeeCode);
    const name = normalizeName(body.name);

    const userId = String(body.userId ?? "").trim() || null;
    const phone = normalizeOptionalText(body.phone);
    const avatar = normalizeOptionalText(body.avatar);

    const departmentId = String(body.departmentId ?? "").trim() || null;

    const positionId = String(body.positionId ?? "").trim() || null;

    const hireDate = normalizeDate(body.hireDate, "hireDate");
    const employmentEndDate = normalizeDate(
      body.employmentEndDate,
      "employmentEndDate",
    );

    const employmentStatus = body.employmentStatus
      ? normalizeEmploymentStatus(body.employmentStatus)
      : "active";

    const notes = normalizeOptionalText(body.notes);

    if (!employeeCode || !name) {
      return NextResponse.json(
        { error: "كود الموظف واسم الموظف مطلوبان." },
        { status: 400 },
      );
    }

    if (userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          employeeProfile: {
            select: { id: true },
          },
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: "حساب المستخدم المحدد غير موجود." },
          { status: 404 },
        );
      }

      if (user.employeeProfile) {
        return NextResponse.json(
          { error: "هذا المستخدم مرتبط بملف موظف بالفعل." },
          { status: 409 },
        );
      }
    }

    await assertDepartmentExists(departmentId);
    await assertPositionExists(positionId);

    const created = await db.employeeProfile.create({
      data: {
        employeeCode,
        name,
        phone,
        avatar,
        userId,
        departmentId,
        positionId,
        hireDate,
        employmentEndDate,
        employmentStatus,
        payrollEnabled: body.payrollEnabled !== false,
        notes,
      },
      include: includeEmployeeRelations,
    });

    return NextResponse.json(
      {
        success: true,
        employee: serializeEmployee(created),
      },
      { status: 201 },
    );
  } catch (error) {
    return employeeError(error, "create");
  }
}

export async function PATCH(req: Request) {
  const guard = await requireAdminPermission("employees_manage");
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "معرّف ملف الموظف مطلوب." },
        { status: 400 },
      );
    }

    const current = await db.employeeProfile.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        hireDate: true,
        employmentEndDate: true,
        employmentStatus: true,
      },
    });

    if (!current) {
      return NextResponse.json(
        { error: "ملف الموظف غير موجود." },
        { status: 404 },
      );
    }

    const data: Prisma.EmployeeProfileUpdateInput = {};

    if (body.name !== undefined) {
      const name = normalizeName(body.name);

      if (!name) {
        return NextResponse.json(
          { error: "اسم الموظف لا يمكن أن يكون فارغًا." },
          { status: 400 },
        );
      }

      data.name = name;
    }

    if (body.phone !== undefined) {
      data.phone = normalizeOptionalText(body.phone);
    }

    if (body.avatar !== undefined) {
      data.avatar = normalizeOptionalText(body.avatar);
    }

    if (body.departmentId !== undefined) {
      const departmentId = String(body.departmentId ?? "").trim() || null;

      await assertDepartmentExists(departmentId);

      data.department = departmentId
        ? { connect: { id: departmentId } }
        : { disconnect: true };
    }

    if (body.positionId !== undefined) {
      const positionId = String(body.positionId ?? "").trim() || null;

      await assertPositionExists(positionId);

      data.position = positionId
        ? { connect: { id: positionId } }
        : { disconnect: true };
    }

    if (body.hireDate !== undefined) {
      data.hireDate = normalizeDate(body.hireDate, "hireDate");
    }

    if (body.employmentEndDate !== undefined) {
      data.employmentEndDate = normalizeDate(
        body.employmentEndDate,
        "employmentEndDate",
      );
    }

    if (body.employmentStatus !== undefined) {
      data.employmentStatus = normalizeEmploymentStatus(body.employmentStatus);
    }

    if (body.payrollEnabled !== undefined) {
      data.payrollEnabled = Boolean(body.payrollEnabled);
    }

    if (body.notes !== undefined) {
      data.notes = normalizeOptionalText(body.notes);
    }

    /*
     * Identity boundaries:
     * - employeeCode is immutable.
     * - userId is immutable through HR PATCH.
     * - linking/unlinking login accounts must be a separate explicit workflow.
     */
    const updated = await db.employeeProfile.update({
      where: { id },
      data,
      include: includeEmployeeRelations,
    });

    return NextResponse.json({
      success: true,
      employee: serializeEmployee(updated),
    });
  } catch (error) {
    return employeeError(error, "update");
  }
}
