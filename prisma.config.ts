import { existsSync } from "fs";
import { config } from "dotenv";
import { resolve } from "path";
import { defineConfig } from "prisma/config";

const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(__dirname, ".env"),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
    break;
  }
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

const databaseUrl = process.env.DATABASE_URL
  ? normalizeDatabaseUrl(process.env.DATABASE_URL)
  : "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
