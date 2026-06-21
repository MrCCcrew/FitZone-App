/**
 * Load Test — Public Read-Only API Endpoints
 *
 * Targets:
 *   GET /api/public          — Main public data (cached 30 s in production)
 *   GET /api/public/partners — Active partner list
 *   GET /api/site-content    — Site content / settings
 *   GET /api/chat/presence   — Chat online/offline status (cached 10 s)
 *
 * Safe:  All endpoints are explicitly public, read-only, no auth required.
 *        Cached responses reduce DB pressure.
 * Limit: connections=10, duration=10s
 *
 * Run:  node tests/load/public-api.mjs
 * Or:   npm run test:load:public
 *
 * SAFETY GUARANTEE:
 *   ✓ localhost:3000 only
 *   ✓ GET only — zero data writes
 *   ✓ No credentials, auth, payment, or admin paths
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

console.log("Phase 4 Load Test — Public API Endpoints");
console.log(`Target:      ${BASE_URL}`);
console.log(`Connections: ${CONNECTIONS}`);
console.log(`Duration:    ${DURATION}s`);
console.log("Safety:      GET only • public endpoints • no auth • no payments");

const results = [];

// ── Test 1: Main public API ──────────────────────────────────────────────────
results.push(await run(`${BASE_URL}/api/public`, "GET /api/public — Main Public Data"));

// ── Test 2: Partners list ────────────────────────────────────────────────────
results.push(await run(`${BASE_URL}/api/public/partners`, "GET /api/public/partners — Partners"));

// ── Test 3: Site content ─────────────────────────────────────────────────────
results.push(await run(`${BASE_URL}/api/site-content`, "GET /api/site-content — Site Content"));

// ── Test 4: Chat presence ────────────────────────────────────────────────────
results.push(await run(`${BASE_URL}/api/chat/presence`, "GET /api/chat/presence — Chat Status"));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("  LOAD TEST SUMMARY — public-api.mjs");
console.log("=".repeat(60));

let slowest = null;

for (const r of results) {
  const p = r.latency;
  console.log(`\n[${r.title}]`);
  console.log(`  Requests/sec : ${r.requests.average.toFixed(1)}`);
  console.log(`  Latency avg  : ${p.average} ms`);
  console.log(`  Latency max  : ${p.max} ms`);
  console.log(`  Latency p99  : ${p.p99} ms`);
  console.log(`  Total reqs   : ${r.requests.total}`);
  console.log(`  Errors       : ${r.errors} (non-2xx: ${r.non2xx})`);

  if (!slowest || p.average > slowest.avg) {
    slowest = { title: r.title, avg: p.average, max: p.max };
  }
}

if (slowest) {
  console.log(`\n  ⚠ Slowest endpoint: ${slowest.title} (avg ${slowest.avg} ms, max ${slowest.max} ms)`);
}
