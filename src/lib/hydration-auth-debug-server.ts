import "server-only";

import { getAdminSession } from "@/lib/admin-session";
import { getAppSession } from "@/lib/app-session";

const hydrationAuthDebugEnabled =
  process.env.NODE_ENV === "production" && process.env.HYDRATION_AUTH_DEBUG === "true";

export type HydrationServerSessionMarker = {
  hasSession: boolean;
  role: string | null;
};

export function isHydrationAuthDebugEnabled() {
  return hydrationAuthDebugEnabled;
}

export async function getHydrationServerSessionMarker(): Promise<HydrationServerSessionMarker> {
  if (!hydrationAuthDebugEnabled) return { hasSession: false, role: null };

  const [adminSession, appSession] = await Promise.all([
    getAdminSession().catch(() => null),
    getAppSession().catch(() => null),
  ]);
  const session = adminSession ?? appSession;
  return { hasSession: Boolean(session), role: session?.role ?? null };
}
