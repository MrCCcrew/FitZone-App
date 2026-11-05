import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentAppUser();

    return NextResponse.json({
      authenticated: Boolean(user),
      user: user ?? null,
    });
  } catch (error) {
    console.error("[APP_SESSION]", error);
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }
}
