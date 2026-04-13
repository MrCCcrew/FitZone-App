import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

const SETUP_TOKEN = process.env.SETUP_TOKEN;
const ENABLE_SETUP_ROUTE = process.env.ENABLE_SETUP_ROUTE === "true";

function isStrongPassword(password: string) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!ENABLE_SETUP_ROUTE) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(
    { error: "Use POST with token and password to initialize admin accounts." },
    { status: 405 },
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!ENABLE_SETUP_ROUTE) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`setup:${clientIp}`, 5, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many setup attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    if (!SETUP_TOKEN) {
      return NextResponse.json({ error: "SETUP_TOKEN is not configured" }, { status: 403 });
    }

    const { token, password } = await req.json().catch(() => ({ token: "", password: "" }));
    if (token !== SETUP_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalizedPassword = String(password ?? "");
    if (!isStrongPassword(normalizedPassword)) {
      return NextResponse.json(
        {
          error:
            "Password must be at least 12 characters and include uppercase, lowercase, number, and special character.",
        },
        { status: 400 },
      );
    }

    const hashedPassword = await bcryptjs.hash(normalizedPassword, 12);
    const results: string[] = [];

    const users = [
      { name: "FitZone Admin", email: "admin@fitzoneland.com", role: "admin" as const },
      { name: "FitZone Admin", email: "itsfitzoone@gmail.com", role: "admin" as const },
      { name: "FitZone Info", email: "info@fitzoneland.com", role: "staff" as const },
    ];

    for (const userConfig of users) {
      const user = await db.user.upsert({
        where: { email: userConfig.email },
        update: {
          name: userConfig.name,
          password: hashedPassword,
          role: userConfig.role,
        },
        create: {
          name: userConfig.name,
          email: userConfig.email,
          password: hashedPassword,
          role: userConfig.role,
        },
      });

      await db.wallet.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, balance: 0 },
      });

      await db.rewardPoints.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, points: 0, tier: "bronze" },
      });

      results.push(`Ready: ${userConfig.email}`);
    }

    return NextResponse.json({
      success: true,
      message: "Admin accounts initialized successfully.",
      results,
    });
  } catch (error) {
    console.error("[SETUP]", error);
    return NextResponse.json({ error: "Failed to initialize admin accounts." }, { status: 500 });
  }
}
