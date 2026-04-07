const TOKEN = "v6IeBFh2GtQ0qOLRq8nJHzN0X41elotUQy5hhG3v70d69109";
const BASE = "https://developers.hostinger.com";
const USERNAME = "u952525674";
const DOMAIN = "fitzoneland.com";
const BUILD_UUID = "019d02ef-47f0-7238-be9a-30a442e60f19";

async function api(path) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "Authorization": `Bearer ${TOKEN}` },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// List builds
console.log("=== Build List ===");
const { status: s1, data: d1 } = await api(`api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds`);
console.log(`Status: ${s1}`);
if (Array.isArray(d1)) {
  for (const b of d1.slice(0, 5)) {
    console.log(`  ${b.uuid} | ${b.state} | ${b.created_at}`);
  }
} else {
  console.log(JSON.stringify(d1, null, 2));
}

// Build logs
console.log("\n=== Build Logs ===");
const { status: s2, data: d2 } = await api(`api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds/${BUILD_UUID}/logs?from_line=0`);
console.log(`Status: ${s2}`);
console.log(JSON.stringify(d2, null, 2));
