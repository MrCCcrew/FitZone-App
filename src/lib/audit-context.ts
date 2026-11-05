import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";

export type AuditActor = {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const auditStorage = new AsyncLocalStorage<AuditActor | null>();

export function getAuditActor() {
  return auditStorage.getStore() ?? null;
}

export function enterAuditActor(actor: AuditActor | null) {
  auditStorage.enterWith(actor);
}

export async function logAudit(params: {
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    const actor = getAuditActor();
    await db.auditLog.create({
      data: {
        actorUserId: actor?.userId ?? null,
        actorName: actor?.name ?? null,
        actorEmail: actor?.email ?? null,
        actorRole: actor?.role ?? null,
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        details: params.details ? JSON.stringify(params.details) : null,
      },
    });
  } catch {
    // Audit log failures must never break the main operation
  }
}
