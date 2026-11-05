/**
 * Load Test — Homepage & Health
 *
 * Targets: GET /  and  GET /api/health
 * Safe:    Read-only page renders — no DB writes, no auth, no payments.
 * Limit:   connections=10, duration=10s  (safe baseline per Phase 4 constraints)
 *
 * Run:  node tests/load/homepage.mjs
 * Or:   npm run test:load:home
 *
 * SAFETY GUARANTEE:
 *   ✓ localhost:3000 only — no production domain
 *   ✓ GET only — no POST, no data modification
 *   ✓ No credentials, no payment, no admin endpoints
 */

import autocannon from "autocannon";

const BASE_URL = "http://localhost:3000";
const CONNECTIONS = 10;
const DURATION = 10; // seconds

function banner(title) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function run(url, title) {
  return new Promise((resolve, reject) => {
    banner(title);
    const instance = autocannon({
      url,
      connections: CONNECTIONS,
      duration: DURATION,
      pipelining: 1,
      timeout: 20,
      title,
    }, (err, result) => {
      if (err) return reject(err);
      autocannon.printResult(result);
      resolve(result);
    });
    autocannon.track(instance);
  });
}

console.log("Phase 4 Load Test — Homepage & Health Endpoints");
console.log(`Target:      ${BASE_URL}`);
console.log(`Connections: ${CONNECTIONS}`);
console.log(`Duration:    ${DURATION}s`);
console.log("Safety:      GET only • no production domain • no payments");

const results = [];

// ── Test 1: Homepage ────────────────────────────────────────────────────────
results.push(await run(`${BASE_URL}/`, "GET / — Homepage (HTML)"));

// ── Test 2: Health check ────────────────────────────────────────────────────
results.push(await run(`${BASE_URL}/api/health`, "GET /api/health — Health Check"));

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("  LOAD TEST SUMMARY — homepage.mjs");
console.log("=".repeat(60));

for (const r of results) {
  const p = r.latency;
  const errors = r["2xx"] === undefined ? "N/A" : r.non2xx;
  console.log(`\n[${r.title}]`);
  console.log(`  Requests/sec : ${r.requests.average.toFixed(1)}`);
  console.log(`  Latency avg  : ${p.average} ms`);
  console.log(`  Latency max  : ${p.max} ms`);
  console.log(`  Latency p99  : ${p.p99} ms`);
  console.log(`  Total reqs   : ${r.requests.total}`);
  console.log(`  Errors       : ${r.errors} (non-2xx: ${r.non2xx})`);
}
