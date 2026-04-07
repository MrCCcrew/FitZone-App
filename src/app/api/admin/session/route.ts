import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: adminSession.id,
        email: adminSession.email,
        name: adminSession.name,
        role: adminSession.role,
      },
    });
  } catch (error) {
    console.error("[ADMIN_SESSION]", error);
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
