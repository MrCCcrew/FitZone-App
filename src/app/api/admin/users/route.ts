import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: search users by name or email — accessible by trainers and admins
export async function GET(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  if (!["trainer", "admin", "staff"].includes(user.role ?? ""))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 20);

  if (!search) return NextResponse.json({ users: [] });

  const users = await db.user.findMany({
    where: {
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
      ],
      role: "member",
    },
    select: { id: true, name: true, email: true },
    take: limit,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
