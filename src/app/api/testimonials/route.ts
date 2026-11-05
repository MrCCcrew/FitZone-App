import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentAppUser();

  if (!user?.id) {
    const approved = await db.testimonial.findMany({
      where: { status: "approved" },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
    });

    return NextResponse.json(approved);
  }

  const testimonials = await db.testimonial.findMany({
    where: { userId: user.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json(testimonials);
}

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const content = String(body.content ?? "").trim();
  const displayName = String(body.displayName ?? user.name ?? "").trim();
  const rating = Math.max(1, Math.min(5, Number(body.rating ?? 5)));

  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const testimonial = await db.testimonial.create({
    data: {
      userId: user.id,
      displayName: displayName || null,
      content,
      rating,
      status: "pending",
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const admins = await db.user.findMany({
    where: { role: { in: ["admin", "staff"] } },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      db.notification.create({
        data: {
          userId: admin.id,
          title: "رأي عميل جديد",
          body: `تم إرسال رأي جديد من ${displayName || user.name || "عميل"}.`,
          type: "info",
        },
      }),
    ),
  );

  return NextResponse.json(testimonial, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const current = await db.testimonial.findFirst({
    where: { id, userId: user.id },
  });

  if (!current) {
    return NextResponse.json({ error: "Testimonial not found" }, { status: 404 });
  }

  const content = String(body.content ?? current.content).trim();
  const displayName = String(body.displayName ?? current.displayName ?? user.name ?? "").trim();
  const rating = Math.max(1, Math.min(5, Number(body.rating ?? current.rating)));

  const testimonial = await db.testimonial.update({
    where: { id },
    data: {
      content,
      displayName: displayName || null,
      rating,
      status: "pending",
      adminNote: null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(testimonial);
}

export async function DELETE(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await db.testimonial.deleteMany({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
