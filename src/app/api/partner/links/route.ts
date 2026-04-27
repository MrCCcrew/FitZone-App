import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function getPartnerProfile(userId: string) {
  return db.partner.findUnique({ where: { userId }, select: { id: true, isActive: true } });
}

export async function GET() {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await getPartnerProfile(guard.session.user.id);
  if (!partner) return NextResponse.json({ error: "ملف الشريك غير موجود." }, { status: 404 });

  const links = await db.partnerAffiliateLink.findMany({
    where: { partnerId: partner.id },
    include: { membership: { select: { name: true, price: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(links.map((l) => ({
    id: l.id,
    membershipId: l.membershipId,
    membershipName: l.membership.name,
    membershipPrice: l.membership.price,
    token: l.token,
    label: l.label,
    clickCount: l.clickCount,
    isActive: l.isActive,
    createdAt: l.createdAt.toISOString(),
  })));
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await getPartnerProfile(guard.session.user.id);
  if (!partner || !partner.isActive) {
    return NextResponse.json({ error: "ملف الشريك غير موجود أو غير نشط." }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { membershipId?: string; label?: string };

    if (!body.membershipId) {
      return NextResponse.json({ error: "الاشتراك مطلوب." }, { status: 400 });
    }

    const membership = await db.membership.findUnique({
      where: { id: body.membershipId },
      select: { id: true, name: true, isActive: true },
    });
    if (!membership || !membership.isActive) {
      return NextResponse.json({ error: "الاشتراك غير موجود أو غير نشط." }, { status: 404 });
    }

    const token = randomBytes(6).toString("base64url").toUpperCase().slice(0, 8);

    const created = await db.partnerAffiliateLink.create({
      data: {
        partnerId: partner.id,
        membershipId: body.membershipId,
        token,
        label: body.label?.trim() || null,
      },
      include: { membership: { select: { name: true, price: true } } },
    });

    return NextResponse.json({
      id: created.id,
      membershipId: created.membershipId,
      membershipName: created.membership.name,
      membershipPrice: created.membership.price,
      token: created.token,
      label: created.label,
      clickCount: created.clickCount,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("[PARTNER_LINKS_POST]", err);
    return NextResponse.json({ error: "تعذر إنشاء الرابط." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await getPartnerProfile(guard.session.user.id);
  if (!partner) return NextResponse.json({ error: "ملف الشريك غير موجود." }, { status: 404 });

  try {
    const body = (await req.json()) as { id?: string; isActive?: boolean; label?: string };
    if (!body.id) return NextResponse.json({ error: "معرّف الرابط مطلوب." }, { status: 400 });

    const link = await db.partnerAffiliateLink.findUnique({ where: { id: body.id } });
    if (!link || link.partnerId !== partner.id) {
      return NextResponse.json({ error: "الرابط غير موجود." }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.label !== undefined) data.label = String(body.label).trim() || null;

    await db.partnerAffiliateLink.update({ where: { id: body.id }, data });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PARTNER_LINKS_PATCH]", err);
    return NextResponse.json({ error: "تعذر تحديث الرابط." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await getPartnerProfile(guard.session.user.id);
  if (!partner) return NextResponse.json({ error: "ملف الشريك غير موجود." }, { status: 404 });

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "معرّف الرابط مطلوب." }, { status: 400 });

    const link = await db.partnerAffiliateLink.findUnique({ where: { id }, select: { partnerId: true } });
    if (!link || link.partnerId !== partner.id) {
      return NextResponse.json({ error: "الرابط غير موجود." }, { status: 404 });
    }

    await db.partnerAffiliateLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PARTNER_LINKS_DELETE]", err);
    return NextResponse.json({ error: "تعذر حذف الرابط." }, { status: 500 });
  }
}
