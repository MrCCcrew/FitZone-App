import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { APP_SESSION_COOKIE, parseAppSessionToken } from "@/lib/app-session";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSession,
  getAdminSessionCookieOptions,
} from "@/lib/admin-session";
import { db } from "@/lib/db";
import { isAdminRole } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminSession = await getAdminSession();
    if (adminSession) {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: adminSession.id,
          email: adminSession.email,
          name: adminSession.name,
          role: adminSession.role,
          jobTitle: adminSession.jobTitle ?? null,
          permissions: adminSession.permissions ?? [],
        },
      });
    }

    const cookieStore = await cookies();
    const appSession = parseAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value ?? null);
    if (!appSession?.id || !isAdminRole(appSession.role)) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: appSession.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        jobTitle: true,
        adminAccess: true,
        adminPermissions: true,
        isActive: true,
      },
    });

    if (!user || user.isActive === false || (!user.adminAccess && !isAdminRole(user.role))) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const permissions =
      typeof user.adminPermissions === "string"
        ? JSON.parse(user.adminPermissions || "[]")
        : [];
    const restoredSession = {
      id: user.id,
      email: user.email ?? appSession.email,
      name: user.name ?? appSession.name ?? "FitZone Admin",
      role: user.role,
      jobTitle: user.jobTitle ?? null,
      permissions: Array.isArray(permissions) ? permissions : [],
    };

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: restoredSession.id,
        email: restoredSession.email,
        name: restoredSession.name,
        role: restoredSession.role,
        jobTitle: restoredSession.jobTitle,
        permissions: restoredSession.permissions,
      },
    });
    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      createAdminSessionToken(restoredSession),
      getAdminSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    console.error("[ADMIN_SESSION]", error);
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
