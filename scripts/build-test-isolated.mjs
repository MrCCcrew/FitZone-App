import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for the isolated build.");
}

const root = process.cwd();
const env = {
  ...process.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  FITZONE_TEST_BUILD: "1",
  AI_COACH_VOICE_ENABLED: "false",
  AI_COACH_REALTIME_VOICE_ENABLED: "false",
  OPENAI_API_KEY: "",
};
const hook = path.join(root, "scripts", "skip-production-env.cjs");
env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require=${hook}`].filter(Boolean).join(" ");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const movedEnvFiles = [".env", ".env.local", ".env.production", ".env.production.local"]
  .map((name) => path.join(root, name))
  .filter(existsSync)
  .map((source) => ({ source, backup: `${source}.fitzone-build-test-backup-${process.pid}` }));

for (const file of movedEnvFiles) renameSync(file.source, file.backup);
try {
  console.log("skipping production env loading");
  run(process.execPath, [path.join(root, "node_modules", "prisma", "build", "index.js"), "generate", "--config", "prisma.test.config.ts"]);
  run(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"]);
} finally {
  for (const file of movedEnvFiles.reverse()) {
    if (existsSync(file.backup)) renameSync(file.backup, file.source);
  }
}
