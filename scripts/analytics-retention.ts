import { runAnalyticsRetentionCleanup, ANALYTICS_RETENTION } from "../src/lib/analytics/retention";
import { parseAnalyticsRetentionArgs } from "../src/lib/analytics/retention-cli";

async function main() {
  const options = parseAnalyticsRetentionArgs(process.argv.slice(2));
  const report = await runAnalyticsRetentionCleanup(options);
  console.info("Analytics retention completed", report);
}

void main().catch((error) => { console.error("Analytics retention failed", error instanceof Error ? error.message : "unknown_error"); process.exitCode = 1; });

export { ANALYTICS_RETENTION };
