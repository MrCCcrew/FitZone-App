import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getCurrentAppUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword } = body;

  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل." },
      { status: 400 },
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "كلمتا المرور غير متطابقتين." }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { password: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.password) {
    if (!currentPassword) {
      return NextResponse.json({ error: "كلمة المرور الحالية مطلوبة." }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة." }, { status: 400 });
    }
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: session.id }, data: { password: hashed } });

  return NextResponse.json({ ok: true });
}
