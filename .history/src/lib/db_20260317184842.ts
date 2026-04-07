import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaAdapter: PrismaMariaDb | undefined;
};

function getAdapter() {
  if (globalForPrisma.prismaAdapter) return globalForPrisma.prismaAdapter;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "");

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: process.env.NODE_ENV === "production" ? 5 : 2,
    idleTimeout: 60,
    connectTimeout: 10,
  });

  globalForPrisma.prismaAdapter = adapter;
  return adapter;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: getAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = db;
