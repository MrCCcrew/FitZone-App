import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasAdminPermission, type AdminPermission } from "@/lib/admin-authorization";

export async function requireAdminPermission(permission: AdminPermission) {
  const session = await getAdminSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!hasAdminPermission(session, permission)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { session, role: session.role, permissions: session.permissions ?? [] } as const;
}
