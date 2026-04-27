import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { ADMIN_FEATURES, isAdminRole } from "@/lib/admin-permissions";

function parsePermissions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && ADMIN_FEATURES.includes(item as never));
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
        { role: { in: ["admin", "staff", "trainer"] } },
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
  if (payload.maxDiscount != null) data.maxDiscount = payload.maxDiscount === "" || payload.maxDiscount === null ? null : Number(payload.maxDiscount);
  if (payload.commissionRate != null) data.commissionRate = Number(payload.commissionRate) || 0;
  if (payload.commissionType != null) data.commissionType = payload.commissionType === "fixed" ? "fixed" : "percentage";
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
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ success: true, employee: serializeEmployee(updated) });
}
