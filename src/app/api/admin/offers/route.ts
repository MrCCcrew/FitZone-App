import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("offers");
  return "error" in guard ? guard.error : null;
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 16);
}

function mapOffer(
  offer: {
    id: string;
    title: string;
    discount: number;
    type: string;
    appliesTo: string | null;
    membershipId: string | null;
    expiresAt: Date;
    isActive: boolean;
    description: string | null;
    specialPrice: number | null;
    maxSubscribers: number | null;
    currentSubscribers: number;
    image: string | null;
    showOnHome: boolean;
    membership?: { name: string } | null;
  },
) {
  return {
    id: offer.id,
    title: offer.title,
    discount: offer.discount,
    type: (offer.type || "percentage") as "percentage" | "fixed" | "special",
    appliesTo: offer.appliesTo ?? offer.membership?.name ?? "جميع الباقات",
    membershipId: offer.membershipId,
    validUntil: toDateString(offer.expiresAt),
    active: offer.isActive,
    usedCount: offer.currentSubscribers,
    description: offer.description ?? "",
    specialPrice: offer.specialPrice,
    maxSubscribers: offer.maxSubscribers,
    currentSubscribers: offer.currentSubscribers,
    image: offer.image,
    showOnHome: offer.showOnHome,
  };
}

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  const offers = await db.offer.findMany({
    include: { membership: { select: { name: true } } },
    orderBy: [{ showOnHome: "desc" }, { expiresAt: "asc" }],
  });

  return NextResponse.json(offers.map(mapOffer));
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const body = await req.json();
    const type = typeof body.type === "string" ? body.type : "percentage";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const validUntil = typeof body.validUntil === "string" ? body.validUntil : "";

    if (!title || !validUntil) {
      return NextResponse.json({ error: "يرجى إدخال عنوان العرض ووقت انتهائه." }, { status: 400 });
    }

    if (type === "special" && !body.membershipId) {
      return NextResponse.json({ error: "اختاري الباقة المرتبطة بالعرض الخاص أولًا." }, { status: 400 });
    }

    if (type === "special" && (body.specialPrice == null || Number(body.specialPrice) <= 0)) {
      return NextResponse.json({ error: "أدخلي قيمة الاشتراك الخاصة بالعرض." }, { status: 400 });
    }

    const created = await db.offer.create({
      data: {
        title,
        type,
        discount: Number(body.discount ?? 0),
        description: typeof body.description === "string" ? body.description.trim() : null,
        appliesTo: typeof body.appliesTo === "string" ? body.appliesTo.trim() : null,
        expiresAt: new Date(validUntil),
        isActive: body.active !== false,
        membershipId: body.membershipId || null,
        specialPrice: body.specialPrice != null ? Number(body.specialPrice) : null,
        maxSubscribers: body.maxSubscribers != null && body.maxSubscribers !== ""
          ? Number(body.maxSubscribers)
          : null,
        image: typeof body.image === "string" && body.image.trim() ? body.image.trim() : null,
        showOnHome: Boolean(body.showOnHome),
      },
      include: { membership: { select: { name: true } } },
    });

    return NextResponse.json(mapOffer(created));
  } catch (error) {
    console.error("[ADMIN_OFFERS_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ العرض حاليًا." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "معرف العرض مطلوب." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.type !== undefined) data.type = String(body.type);
    if (body.discount !== undefined) data.discount = Number(body.discount ?? 0);
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.appliesTo !== undefined) data.appliesTo = body.appliesTo ? String(body.appliesTo).trim() : null;
    if (body.validUntil !== undefined) data.expiresAt = new Date(String(body.validUntil));
    if (body.active !== undefined) data.isActive = Boolean(body.active);
    if (body.membershipId !== undefined) data.membershipId = body.membershipId || null;
    if (body.specialPrice !== undefined) {
      data.specialPrice = body.specialPrice != null && body.specialPrice !== "" ? Number(body.specialPrice) : null;
    }
    if (body.maxSubscribers !== undefined) {
      data.maxSubscribers = body.maxSubscribers != null && body.maxSubscribers !== ""
        ? Number(body.maxSubscribers)
        : null;
    }
    if (body.currentSubscribers !== undefined) data.currentSubscribers = Number(body.currentSubscribers ?? 0);
    if (body.image !== undefined) data.image = body.image ? String(body.image).trim() : null;
    if (body.showOnHome !== undefined) data.showOnHome = Boolean(body.showOnHome);

    const updated = await db.offer.update({
      where: { id },
      data,
      include: { membership: { select: { name: true } } },
    });

    return NextResponse.json(mapOffer(updated));
  } catch (error) {
    console.error("[ADMIN_OFFERS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث العرض حاليًا." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "معرف العرض مطلوب." }, { status: 400 });
    }

    await db.offer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_OFFERS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف العرض حاليًا." }, { status: 500 });
  }
}
