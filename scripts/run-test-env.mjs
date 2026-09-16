import fs from "node:fs";
import { spawnSync } from "node:child_process";

const envFile =
  process.env.FITZONE_TEST_ENV_FILE ?? "/etc/fitzone/fitzone-test.env";

if (!fs.existsSync(envFile)) {
  throw new Error(`[TEST_ENV] Missing test environment file: ${envFile}`);
}

const loaded = {};

for (const rawLine of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();

  if (!line || line.startsWith("#")) continue;

  const eq = line.indexOf("=");

  if (eq <= 0) {
    throw new Error(`[TEST_ENV] Invalid line in ${envFile}`);
  }

  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();

  loaded[key] = value;
}

const required = ["TEST_DATABASE_URL", "TEST_SHADOW_DATABASE_URL"];

for (const key of required) {
  if (!loaded[key]) {
    throw new Error(`[TEST_ENV] ${key} is missing`);
  }
}

function validateUrl(raw, expectedDatabase) {
  const url = new URL(raw);

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  const username = decodeURIComponent(url.username);

  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    username !== "fitzone_test_user" ||
    database !== expectedDatabase
  ) {
    throw new Error(
      `[TEST_ENV] Refusing unsafe DB endpoint for ${expectedDatabase}`,
    );
  }

  return raw;
}

const testUrl = validateUrl(loaded.TEST_DATABASE_URL, "fitzone_test");

const shadowUrl = validateUrl(
  loaded.TEST_SHADOW_DATABASE_URL,
  "fitzone_shadow",
);

const args = process.argv.slice(2);

if (!args.length) {
  throw new Error("Usage: node scripts/run-test-env.mjs <command> [args...]");
}

/*
 * Deliberately replace these values instead of inheriting any possibly stale
 * database variables from the caller shell.
 */
const env = {
  ...process.env,

  APP_ENV: "test",
  NODE_ENV: "test",

  DATABASE_URL: testUrl,
  TEST_DATABASE_URL: testUrl,
  TEST_SHADOW_DATABASE_URL: shadowUrl,
};

const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env,
  shell: false,
});

if (result.error) throw result.error;

process.exit(result.status ?? 1);
