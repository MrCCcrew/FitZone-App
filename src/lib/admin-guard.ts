import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { canAccessAdminFeature } from "@/lib/admin-permissions";

export async function requireAdminFeature(feature: Parameters<typeof canAccessAdminFeature>[1]) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!canAccessAdminFeature(adminSession.role, feature)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    session: {
      user: {
        id: adminSession.id,
        email: adminSession.email,
        name: adminSession.name,
        role: adminSession.role,
      },
    },
    role: adminSession.role,
  };
}
