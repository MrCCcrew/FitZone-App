import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { getAdminSession } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { sendContactEmail } from "@/lib/email";

export async function GET() {
  const user = await getCurrentAppUser();
  const adminSession = await getAdminSession();

  // Support both app session (members) and admin session (admin panel)
  const isAdmin = user?.role === "admin" || adminSession?.role === "admin" || adminSession?.role === "staff";
  const userId = user?.id;

  if (!userId && !adminSession) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const complaints = await db.complaint.findMany({
    where: isAdmin ? undefined : { userId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(complaints);
}

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { subject, message } = await req.json();
  if (!subject || !message) {
    return NextResponse.json({ error: "الموضوع والرسالة مطلوبان" }, { status: 400 });
  }

  const complaint = await db.complaint.create({
    data: { userId: user.id, subject, message },
  });

  // Fire-and-forget — don't block the response
  sendContactEmail({
    senderName: user.name ?? "عميل",
    senderEmail: user.email ?? "",
    subject,
    message,
  }).catch((err) => console.error("[CONTACT_EMAIL]", err));

  const admins = await db.user.findMany({ where: { role: "admin" } });
  await Promise.all(
    admins.map((admin) =>
      db.notification.create({
        data: {
          userId: admin.id,
          title: "شكوى جديدة",
          body: `شكوى جديدة: "${subject}"`,
          type: "warning",
        },
      }),
    ),
  );

  return NextResponse.json(complaint, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await getCurrentAppUser();
  const adminSession = await getAdminSession();

  const isAdmin = user?.role === "admin" || adminSession?.role === "admin" || adminSession?.role === "staff";
  if (!user?.id && !adminSession) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "للمدير فقط" }, { status: 403 });
  }

  const { id, status, adminNote } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "المعرف مطلوب" }, { status: 400 });
  }

  const complaint = await db.complaint.update({
    where: { id },
    data: { status, adminNote },
    include: { user: { select: { id: true, name: true } } },
  });

  const statusLabels: Record<string, string> = {
    open: "مفتوحة",
    "in-progress": "قيد المعالجة",
    resolved: "تم الحل",
    closed: "مغلقة",
  };

  await db.notification.create({
    data: {
      userId: complaint.user.id,
      title: "تحديث على شكواك",
      body: `تم تغيير حالة شكواك "${complaint.subject}" إلى: ${statusLabels[status] ?? status}`,
      type: status === "resolved" ? "success" : "info",
    },
  });

  return NextResponse.json(complaint);
}
