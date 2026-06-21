/**
 * Load Test — Store & Testimonials (Public Read-Only Pages)
 *
 * Targets:
 *   GET /store/free-gifts   — Public store page (HTML render)
 *   GET /login              — Login page (HTML render, no auth)
 *   GET /policy             — Policy page (static)
 *
 * These are purely read-only HTML pages. No API writes, no payments, no auth.
 *
 * Excluded intentionally (write/payment/auth risk):
 *   ✗ /api/subscribe        (creates membership — DB write)
 *   ✗ /api/payments/*       (payment processing)
 *   ✗ /api/auth/*           (auth tokens, DB reads with credentials)
 *   ✗ /api/orders           (order creation — DB write)
 *   ✗ /api/booking/*        (booking creation — DB write)
 *
 * Run:  node tests/load/store.mjs
 * Or:   npm run test:load:store
 *
 * SAFETY GUARANTEE:
 *   ✓ localhost:3000 only
 *   ✓ GET page renders only — no API writes
 *   ✓ No credentials, no payments, no user data
 */

import autocannon from "autocannon";

const BASE_URL = "http://localhost:3000";
const CONNECTIONS = 10;
const DURATION = 10;

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

console.log("Phase 4 Load Test — Store & Public Pages");
console.log(`Target:      ${BASE_URL}`);
console.log(`Connections: ${CONNECTIONS}`);
console.log(`Duration:    ${DURATION}s`);
console.log("Safety:      HTML GET only • no API writes • no auth • no payments");

const results = [];

// ── Test 1: Store page ───────────────────────────────────────────────────────
results.push(await run(`${BASE_URL}/store/free-gifts`, "GET /store/free-gifts — Store Page"));

// ── Test 2: Login page HTML render ───────────────────────────────────────────
results.push(await run(`${BASE_URL}/login`, "GET /login — Login Page HTML"));

// ── Test 3: Policy page (static) ─────────────────────────────────────────────
results.push(await run(`${BASE_URL}/policy`, "GET /policy — Policy Page"));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("  LOAD TEST SUMMARY — store.mjs");
console.log("=".repeat(60));

for (const r of results) {
  const p = r.latency;
  console.log(`\n[${r.title}]`);
  console.log(`  Requests/sec : ${r.requests.average.toFixed(1)}`);
  console.log(`  Latency avg  : ${p.average} ms`);
  console.log(`  Latency max  : ${p.max} ms`);
  console.log(`  Latency p99  : ${p.p99} ms`);
  console.log(`  Total reqs   : ${r.requests.total}`);
  console.log(`  Errors       : ${r.errors} (non-2xx: ${r.non2xx})`);
}
