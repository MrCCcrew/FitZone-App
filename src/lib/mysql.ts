import * as mariadb from "mariadb";
import type { Connection } from "mariadb";

type AuthUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  password: string | null;
  role: string;
};

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

async function withConnection<T>(fn: (connection: Connection) => Promise<T>) {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const url = new URL(normalizeDatabaseUrl(rawUrl));
  const database = url.pathname.replace(/^\//, "");

  const connection = await mariadb.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    charset: "utf8mb4",
    connectTimeout: 5000,
  });

  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

export async function findAuthUserByEmail(email: string) {
  return withConnection(async (connection) => {
    const rows = (await connection.query(
      "SELECT id, name, email, password, role FROM `User` WHERE email = ? LIMIT 1",
      [email],
    )) as AuthUserRow[];

    return rows[0] ?? null;
  });
}
