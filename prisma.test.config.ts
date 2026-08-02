import { defineConfig } from "prisma/config";

const forbiddenDatabases = new Set([
  "fitzone_prod",
  "rashid_group_erp",
  "rashidgroup_db",
  "rashidgroup_test",
]);

function testDatabaseUrl(variable: "TEST_DATABASE_URL" | "TEST_SHADOW_DATABASE_URL", database: string) {
  const value = process.env[variable];
  if (!value) throw new Error(`${variable} is required`);

  const url = new URL(value);
  const actualDatabase = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(url.username);

  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    actualDatabase !== database ||
    username !== "fitzone_test_user" ||
    forbiddenDatabases.has(actualDatabase)
  ) {
    throw new Error(`${variable} must point only to ${database} as fitzone_test_user`);
  }

  return value;
}

const testUrl = testDatabaseUrl("TEST_DATABASE_URL", "fitzone_test");
// Validate the shadow endpoint without assigning it to the application datasource.
testDatabaseUrl("TEST_SHADOW_DATABASE_URL", "fitzone_shadow");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: testUrl,
  },
});
