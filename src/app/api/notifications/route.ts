import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(notifications);
}

export async function PATCH(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const body = await req.json();

  if (body.markAllRead) {
    await db.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
  } else if (body.notificationId) {
    await db.notification.updateMany({
      where: { id: body.notificationId, userId: user.id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ success: true });
}
