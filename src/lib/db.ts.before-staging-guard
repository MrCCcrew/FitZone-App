import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { getAuditActor } from "@/lib/audit-context";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaAdapter: PrismaMariaDb | undefined;
};

function getConnectionLimit() {
  const raw = Number(process.env.DB_CONNECTION_LIMIT ?? process.env.PRISMA_CONNECTION_LIMIT ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.max(Math.floor(raw), 1), 10);
  }

  return process.env.NODE_ENV === "production" ? 5 : 2;
}

function normalizeDatabaseUrl(value: string) {
  let trimmed = value.trim();

  const prefixMatch = trimmed.match(/^DATABASE_URL\s*=\s*(.+)$/i);
  if (prefixMatch) {
    trimmed = prefixMatch[1].trim();
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getAdapter() {
  if (globalForPrisma.prismaAdapter) return globalForPrisma.prismaAdapter;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const url = new URL(normalizeDatabaseUrl(databaseUrl));
  const database = url.pathname.replace(/^\//, "");

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    charset: "utf8mb4",
    connectTimeout: 5000,
    idleTimeout: 300,
    connectionLimit: getConnectionLimit(),
  });

  globalForPrisma.prismaAdapter = adapter;
  return adapter;
}

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: getAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = basePrisma;

const AUDITABLE_OPERATIONS = new Set(["create", "update", "delete", "upsert", "createMany", "updateMany", "deleteMany"]);

function normalizeAuditValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;

  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAuditValue(item, seen));
  }

  const protoName = Object.getPrototypeOf(value)?.constructor?.name ?? "";
  if (protoName === "Decimal" && "toString" in (value as Record<string, unknown>)) {
    return String(value);
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = normalizeAuditValue(entry, seen);
  }
  return output;
}

function serializeAuditDetails(payload: Record<string, unknown>) {
  const normalized = normalizeAuditValue(payload);
  const json = JSON.stringify(normalized);
  if (!json) return null;

  const MAX_LENGTH = 50000;
  if (json.length <= MAX_LENGTH) return json;

  return JSON.stringify({
    truncated: true,
    maxLength: MAX_LENGTH,
    preview: json.slice(0, MAX_LENGTH),
  });
}

export const db = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);

        if (!model || model === "AuditLog" || !AUDITABLE_OPERATIONS.has(operation)) {
          return result;
        }

        const actor = getAuditActor();
        if (!actor) return result;

        try {
          const targetId =
            typeof result === "object" && result !== null && "id" in result
              ? String((result as { id?: string | number }).id ?? "")
              : args && typeof args === "object" && "where" in args && (args as { where?: { id?: string | number } }).where?.id != null
                ? String((args as { where?: { id?: string | number } }).where?.id)
                : null;

          await basePrisma.auditLog.create({
            data: {
              actorUserId: actor.userId ?? null,
              actorName: actor.name ?? null,
              actorEmail: actor.email ?? null,
              actorRole: actor.role ?? null,
              action: operation,
              targetType: model,
              targetId,
              details: serializeAuditDetails({
                args,
                result,
              }),
              ipAddress: actor.ipAddress ?? null,
              userAgent: actor.userAgent ?? null,
            },
          });
        } catch (error) {
          console.error("[AUDIT_LOG_WRITE_FAILED]", error);
        }

        return result;
      },
    },
  },
});
