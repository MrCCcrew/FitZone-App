import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

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

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: getAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;

export const db = prisma;
