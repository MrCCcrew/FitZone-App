import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

async function checkAdmin() {
  const guard = await requireAdminFeature("reviews");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  const testimonials = await db.testimonial.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json(testimonials);
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) data.displayName = String(body.displayName).trim() || null;
  if (body.displayNameEn !== undefined) data.displayNameEn = String(body.displayNameEn).trim() || null;
  if (body.content !== undefined) data.content = String(body.content).trim();
  if (body.contentEn !== undefined) data.contentEn = String(body.contentEn).trim() || null;
  if (body.rating !== undefined) data.rating = Math.max(1, Math.min(5, Number(body.rating)));
  if (body.status !== undefined && ["pending", "approved", "rejected"].includes(body.status)) data.status = body.status;
  if (body.adminNote !== undefined) data.adminNote = String(body.adminNote).trim() || null;

  const testimonial = await db.testimonial.update({
    where: { id },
    data,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  clearPublicApiCache();
  return NextResponse.json(testimonial);
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await db.testimonial.delete({ where: { id } });
  clearPublicApiCache();
  return NextResponse.json({ success: true });
}
