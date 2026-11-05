import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { ADMIN_FEATURES, ADMIN_PERMISSION_KEYS, isAdminRole } from "@/lib/admin-permissions";

function parsePermissions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && ADMIN_PERMISSION_KEYS.includes(item as never));
}

function serializeEmployee(user: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  jobTitle: string | null;
  adminAccess: boolean;
  isActive: boolean;
  adminPermissions: string | null;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  commissionRate: number;
  commissionType: string;
  marketingCommissionRate: number;
  marketingCommissionType: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  let permissions: string[] = [];
  try {
    permissions = typeof user.adminPermissions === "string" ? JSON.parse(user.adminPermissions) : [];
  } catch {
    permissions = [];
  }

  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone,
    role: user.role,
    jobTitle: user.jobTitle,
    adminAccess: user.adminAccess || isAdminRole(user.role),
    isActive: user.isActive,
    adminPermissions: permissions,
    discountType: user.discountType,
    discountValue: user.discountValue,
    maxDiscount: user.maxDiscount,
    commissionRate: user.commissionRate,
    commissionType: user.commissionType,
    marketingCommissionRate: user.marketingCommissionRate,
    marketingCommissionType: user.marketingCommissionType,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const employees = await db.user.findMany({
    where: {
      OR: [
        { adminAccess: true },
        { role: { notIn: ["member"] } },
      ],
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      jobTitle: true,
      adminAccess: true,
      isActive: true,
      adminPermissions: true,
      discountType: true,
      discountValue: true,
      maxDiscount: true,
      commissionRate: true,
      commissionType: true,
      marketingCommissionRate: true,
      marketingCommissionType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ employees: employees.map(serializeEmployee), allPermissions: ADMIN_FEATURES });
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const payload = await req.json();
  const name = String(payload.name ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const role = String(payload.role ?? "").trim().toLowerCase();
  const jobTitle = String(payload.jobTitle ?? "").trim();
  const phone = String(payload.phone ?? "").trim();
  const permissions = parsePermissions(payload.adminPermissions);
  const adminAccess = Boolean(payload.adminAccess ?? true);
  const isActive = payload.isActive !== false;

  const marketingCommissionType =
    payload.marketingCommissionType === "fixed"
      ? "fixed"
      : "percentage";

  const marketingCommissionRate =
    Number(payload.marketingCommissionRate ?? 0);

  if (!Number.isFinite(marketingCommissionRate) || marketingCommissionRate < 0) {
    return NextResponse.json(
      { error: "عمولة إغلاق التسويق يجب أن تكون رقمًا غير سالب." },
      { status: 400 },
    );
  }

  if (
    marketingCommissionType === "percentage" &&
    marketingCommissionRate > 100
  ) {
    return NextResponse.json(
      { error: "نسبة عمولة إغلاق التسويق لا يمكن أن تتجاوز 100%." },
      { status: 400 },
    );
  }

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: "Name, email, password, and role are required." }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "This email is already in use." }, { status: 409 });
  }

  const passwordHash = await bcryptjs.hash(password, 10);
  const created = await db.user.create({
    data: {
      name,
      email,
      password: passwordHash,
      role,
      jobTitle: jobTitle || null,
      phone: phone || null,
      adminAccess,
      isActive,
      adminPermissions: JSON.stringify(permissions),

      marketingCommissionRate,
      marketingCommissionType,

      emailVerified: new Date(),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      jobTitle: true,
      adminAccess: true,
      isActive: true,
      adminPermissions: true,
      discountType: true,
      discountValue: true,
      maxDiscount: true,
      commissionRate: true,
      commissionType: true,
      marketingCommissionRate: true,
      marketingCommissionType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ success: true, employee: serializeEmployee(created) });
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const payload = await req.json();
  const id = String(payload.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Employee id is required." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (payload.name != null) data.name = String(payload.name).trim();
  if (payload.email != null) data.email = String(payload.email).trim().toLowerCase();
  if (payload.role != null) data.role = String(payload.role).trim().toLowerCase();
  if (payload.jobTitle != null) data.jobTitle = String(payload.jobTitle).trim() || null;
  if (payload.phone != null) data.phone = String(payload.phone).trim() || null;
  if (payload.adminAccess != null) data.adminAccess = Boolean(payload.adminAccess);
  if (payload.isActive != null) data.isActive = Boolean(payload.isActive);
  if (payload.adminPermissions != null) data.adminPermissions = JSON.stringify(parsePermissions(payload.adminPermissions));
  if (payload.discountType != null) data.discountType = payload.discountType === "fixed" ? "fixed" : "percentage";
  if (payload.discountValue != null) data.discountValue = Number(payload.discountValue) || 0;
  if (payload.maxDiscount !== undefined) data.maxDiscount = payload.maxDiscount === "" || payload.maxDiscount === null ? null : Number(payload.maxDiscount);
  if (payload.commissionRate != null) data.commissionRate = Number(payload.commissionRate) || 0;
  if (payload.commissionType != null) data.commissionType = payload.commissionType === "fixed" ? "fixed" : "percentage";

  /*
   * MARKETING_PATCH_EFFECTIVE_TYPE_GUARD
   *
   * Partial PATCH must validate the rate against the effective type:
   * - payload type when supplied
   * - otherwise the employee's currently stored type
   */
  /*
   * MARKETING_TYPE_ONLY_EFFECTIVE_RATE_GUARD
   *
   * Validate the final pair (type + rate), not only fields present
   * in the partial PATCH.
   *
   * This prevents:
   * stored fixed=150 + PATCH type=percentage
   * from producing an invalid 150% commission.
   */
  let effectiveMarketingCommissionType:
    | "fixed"
    | "percentage"
    | null = null;

  let effectiveMarketingCommissionRate:
    number | null = null;

  if (
    payload.marketingCommissionType != null ||
    payload.marketingCommissionRate != null
  ) {
    const currentEmployee = await db.user.findUnique({
      where: { id },
      select: {
        marketingCommissionType: true,
        marketingCommissionRate: true,
      },
    });

    if (!currentEmployee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 },
      );
    }

    effectiveMarketingCommissionType =
      payload.marketingCommissionType != null
        ? (
            payload.marketingCommissionType === "fixed"
              ? "fixed"
              : "percentage"
          )
        : (
            currentEmployee.marketingCommissionType === "fixed"
              ? "fixed"
              : "percentage"
          );

    effectiveMarketingCommissionRate =
      payload.marketingCommissionRate != null
        ? Number(payload.marketingCommissionRate)
        : Number(currentEmployee.marketingCommissionRate);

    if (
      !Number.isFinite(effectiveMarketingCommissionRate) ||
      effectiveMarketingCommissionRate < 0
    ) {
      return NextResponse.json(
        { error: "عمولة إغلاق التسويق يجب أن تكون رقمًا غير سالب." },
        { status: 400 },
      );
    }

    if (
      effectiveMarketingCommissionType === "percentage" &&
      effectiveMarketingCommissionRate > 100
    ) {
      return NextResponse.json(
        { error: "نسبة عمولة إغلاق التسويق لا يمكن أن تتجاوز 100%." },
        { status: 400 },
      );
    }

    if (payload.marketingCommissionType != null) {
      data.marketingCommissionType =
        effectiveMarketingCommissionType;
    }

    if (payload.marketingCommissionRate != null) {
      data.marketingCommissionRate =
        effectiveMarketingCommissionRate;
    }
  }

  if (payload.password) {
    data.password = await bcryptjs.hash(String(payload.password), 10);
  }

  const updated = await db.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      jobTitle: true,
      adminAccess: true,
      isActive: true,
      adminPermissions: true,
      discountType: true,
      discountValue: true,
      maxDiscount: true,
      commissionRate: true,
      commissionType: true,
      marketingCommissionRate: true,
      marketingCommissionType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ success: true, employee: serializeEmployee(updated) });
}
