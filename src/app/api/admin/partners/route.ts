import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function guard() {
  const g = await requireAdminFeature("partners");
  return "error" in g ? { error: g.error, role: null } : { error: null, role: g.role };
}

function formatPartner(p: {
  id: string;
  userId: string;
  name: string;
  nameEn: string | null;
  category: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  contactPhone: string | null;
  commissionRate: number;
  commissionType: string;
  isActive: boolean;
  showOnPublicPage: boolean;
  notes: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; email: string | null };
  _count: { codes: number; affiliateLinks: number };
  commissions: { amount: number; status: string }[];
}) {
  const pending = p.commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const paid = p.commissions.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    nameEn: p.nameEn,
    category: p.category,
    logoUrl: p.logoUrl,
    websiteUrl: p.websiteUrl,
    contactPhone: p.contactPhone,
    commissionRate: p.commissionRate,
    commissionType: p.commissionType,
    isActive: p.isActive,
    showOnPublicPage: p.showOnPublicPage,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    linkedUser: { id: p.user.id, name: p.user.name ?? "", email: p.user.email ?? "" },
    codesCount: p._count.codes,
    linksCount: p._count.affiliateLinks,
    totalCommissionPending: pending,
    totalCommissionPaid: paid,
  };
}

const INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  _count: { select: { codes: true, affiliateLinks: true } },
  commissions: { select: { amount: true, status: true } },
} as const;

export async function GET() {
  const { error, role } = await guard();
  if (error) return error;

  // Partners can only see their own record
  if (role === "partner") {
    return NextResponse.json({ error: "Use /api/partner/dashboard" }, { status: 403 });
  }

  const partners = await db.partner.findMany({
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(partners.map(formatPartner));
}

export async function POST(req: Request) {
  const { error, role } = await guard();
  if (error) return error;
  if (role !== "admin" && role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      nameEn?: string;
      category?: string;
      email?: string;
      password?: string;
      logoUrl?: string;
      websiteUrl?: string;
      contactPhone?: string;
      commissionRate?: number;
      commissionType?: string;
      isActive?: boolean;
      showOnPublicPage?: boolean;
      notes?: string;
    };

    if (!body.name?.trim() || !body.email?.trim() || !body.category?.trim()) {
      return NextResponse.json({ error: "الاسم والبريد الإلكتروني والفئة مطلوبة." }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email: body.email.trim() } });
    if (existing) {
      return NextResponse.json({ error: "البريد الإلكتروني مسجل بالفعل." }, { status: 409 });
    }

    const hashed = await bcryptjs.hash(body.password ?? "FitZone@Partner!", 12);

    const user = await db.user.create({
      data: {
        name: body.name.trim(),
        email: body.email.trim(),
        password: hashed,
        role: "partner",
        adminAccess: true,
        adminPermissions: JSON.stringify(["partners"]),
        isActive: true,
        avatar: (body.name.trim()[0] ?? "ش").toUpperCase(),
      },
    });

    const partner = await db.partner.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
        nameEn: body.nameEn?.trim() || null,
        category: body.category.trim(),
        logoUrl: body.logoUrl?.trim() || null,
        websiteUrl: body.websiteUrl?.trim() || null,
        contactPhone: body.contactPhone?.trim() || null,
        commissionRate: Number(body.commissionRate ?? 10),
        commissionType: body.commissionType === "fixed" ? "fixed" : "percentage",
        isActive: body.isActive !== false,
        showOnPublicPage: body.showOnPublicPage !== false,
        notes: body.notes?.trim() || null,
      },
      include: INCLUDE,
    });

    void logAudit({ action: "create", targetType: "partner", targetId: partner.id, details: { name: partner.name } });
    return NextResponse.json(formatPartner(partner));
  } catch (err) {
    console.error("[ADMIN_PARTNERS_POST]", err);
    return NextResponse.json({ error: "تعذر إنشاء حساب الشريك." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { error, role } = await guard();
  if (error) return error;
  if (role !== "admin" && role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      id?: string;
      name?: string;
      nameEn?: string;
      category?: string;
      logoUrl?: string;
      websiteUrl?: string;
      contactPhone?: string;
      commissionRate?: number;
      commissionType?: string;
      isActive?: boolean;
      showOnPublicPage?: boolean;
      notes?: string;
    };

    if (!body.id) return NextResponse.json({ error: "معرّف الشريك مطلوب." }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.nameEn !== undefined) data.nameEn = String(body.nameEn).trim() || null;
    if (body.category !== undefined) data.category = String(body.category).trim();
    if (body.logoUrl !== undefined) data.logoUrl = String(body.logoUrl).trim() || null;
    if (body.websiteUrl !== undefined) data.websiteUrl = String(body.websiteUrl).trim() || null;
    if (body.contactPhone !== undefined) data.contactPhone = String(body.contactPhone).trim() || null;
    if (body.commissionRate !== undefined) data.commissionRate = Number(body.commissionRate) || 0;
    if (body.commissionType !== undefined) data.commissionType = body.commissionType === "fixed" ? "fixed" : "percentage";
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.showOnPublicPage !== undefined) data.showOnPublicPage = Boolean(body.showOnPublicPage);
    if (body.notes !== undefined) data.notes = String(body.notes).trim() || null;

    const partner = await db.partner.update({ where: { id: body.id }, data, include: INCLUDE });
    void logAudit({ action: "update", targetType: "partner", targetId: partner.id, details: { name: partner.name } });
    return NextResponse.json(formatPartner(partner));
  } catch (err) {
    console.error("[ADMIN_PARTNERS_PATCH]", err);
    return NextResponse.json({ error: "تعذر تحديث بيانات الشريك." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { error, role } = await guard();
  if (error) return error;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "معرّف الشريك مطلوب." }, { status: 400 });

    const partner = await db.partner.findUnique({ where: { id }, select: { userId: true, name: true } });
    if (!partner) return NextResponse.json({ error: "الشريك غير موجود." }, { status: 404 });

    await db.partner.delete({ where: { id } });
    await db.user.delete({ where: { id: partner.userId } }).catch(() => null);

    void logAudit({ action: "delete", targetType: "partner", targetId: id, details: { name: partner.name } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN_PARTNERS_DELETE]", err);
    return NextResponse.json({ error: "تعذر حذف الشريك." }, { status: 500 });
  }
}
