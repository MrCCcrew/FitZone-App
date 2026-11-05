import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasAdminMasterAccess } from "@/lib/admin-master-access";
import { canAccessAdminFeature } from "@/lib/admin-permissions";
import { enterAuditActor } from "@/lib/audit-context";

export async function requireAdminFeature(feature: Parameters<typeof canAccessAdminFeature>[2]) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!canAccessAdminFeature(adminSession.role, adminSession.permissions, feature)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  enterAuditActor({
    userId: adminSession.id,
    name: adminSession.name,
    email: adminSession.email,
    role: adminSession.role,
  });

  return {
    session: {
      user: {
        id: adminSession.id,
        email: adminSession.email,
        name: adminSession.name,
        role: adminSession.role,
        jobTitle: adminSession.jobTitle ?? null,
        permissions: adminSession.permissions ?? [],
      },
    },
    role: adminSession.role,
    permissions: adminSession.permissions ?? [],
  };
}

export async function requireAdminMasterAccess(section: "payments" | "database") {
  const allowed = await hasAdminMasterAccess(section);
  if (!allowed) {
    return { error: NextResponse.json({ error: "Master password required" }, { status: 423 }) };
  }

  return { ok: true as const };
}
