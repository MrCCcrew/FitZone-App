import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import {
  normalizeCatalogCode,
  normalizeOptionalText,
  normalizeRequiredName,
  normalizeSortOrder,
} from "@/lib/employees/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializePosition(row: {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { employees: number };
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameEn: row.nameEn,
    description: row.description,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    employeesCount: row._count?.employees ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const guard = await requireAdminPermission("employees_view");
  if ("error" in guard) return guard.error;

  const rows = await db.position.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { employees: true },
      },
    },
  });

  return NextResponse.json({
    positions: rows.map(serializePosition),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdminPermission("positions_manage");
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json();

    const code = normalizeCatalogCode(body.code);
    const name = normalizeRequiredName(body.name);
    const nameEn = normalizeOptionalText(body.nameEn);
    const description = normalizeOptionalText(body.description);
    const sortOrder = normalizeSortOrder(body.sortOrder);

    if (!code || !name) {
      return NextResponse.json(
        { error: "كود المسمى الوظيفي والاسم مطلوبان." },
        { status: 400 },
      );
    }

    const existing = await db.position.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "كود المسمى الوظيفي مستخدم بالفعل." },
        { status: 409 },
      );
    }

    const created = await db.position.create({
      data: {
        code,
        name,
        nameEn,
        description,
        sortOrder,
        isActive: body.isActive !== false,
      },
      include: {
        _count: {
          select: { employees: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        position: serializePosition(created),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_SORT_ORDER") {
      return NextResponse.json(
        { error: "ترتيب المسمى الوظيفي يجب أن يكون رقمًا صحيحًا." },
        { status: 400 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "كود المسمى الوظيفي مستخدم بالفعل." },
        { status: 409 },
      );
    }

    console.error("[ADMIN_POSITIONS_POST]", error);

    return NextResponse.json(
      { error: "تعذر إنشاء المسمى الوظيفي." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const guard = await requireAdminPermission("positions_manage");
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "معرّف المسمى الوظيفي مطلوب." },
        { status: 400 },
      );
    }

    const current = await db.position.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: "المسمى الوظيفي غير موجود." },
        { status: 404 },
      );
    }

    const data: Prisma.PositionUpdateInput = {};

    if (body.name != null) {
      const name = normalizeRequiredName(body.name);

      if (!name) {
        return NextResponse.json(
          { error: "اسم المسمى الوظيفي لا يمكن أن يكون فارغًا." },
          { status: 400 },
        );
      }

      data.name = name;
    }

    if (body.nameEn !== undefined) {
      data.nameEn = normalizeOptionalText(body.nameEn);
    }

    if (body.description !== undefined) {
      data.description = normalizeOptionalText(body.description);
    }

    if (body.sortOrder !== undefined) {
      data.sortOrder = normalizeSortOrder(body.sortOrder);
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    // Position.code is intentionally immutable after creation.
    const updated = await db.position.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { employees: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      position: serializePosition(updated),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_SORT_ORDER") {
      return NextResponse.json(
        { error: "ترتيب المسمى الوظيفي يجب أن يكون رقمًا صحيحًا." },
        { status: 400 },
      );
    }

    console.error("[ADMIN_POSITIONS_PATCH]", error);

    return NextResponse.json(
      { error: "تعذر تحديث المسمى الوظيفي." },
      { status: 500 },
    );
  }
}
