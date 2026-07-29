export function parseAnalyticsRetentionArgs(args: string[]) {
  const execute = args.includes("--execute");
  const rawBatch = args.find((arg) => arg.startsWith("--batch-size="));
  const batchSize = rawBatch ? Number(rawBatch.split("=")[1]) : undefined;
  if (args.some((arg) => !["--dry-run", "--execute"].includes(arg) && !arg.startsWith("--batch-size="))) throw new Error("unknown_argument");
  return { dryRun: !execute, batchSize };
}
