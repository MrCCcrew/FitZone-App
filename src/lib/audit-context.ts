import { AsyncLocalStorage } from "node:async_hooks";

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
