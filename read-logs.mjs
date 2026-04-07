const TOKEN = "v6IeBFh2GtQ0qOLRq8nJHzN0X41elotUQy5hhG3v70d69109";
const USERNAME = "u952525674";
const PASS = "MrCCcrew@1985";

// Login to file browser
const loginRes = await fetch(`https://srv1999-files.hstgr.io/rest/`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `user=${encodeURIComponent(USERNAME)}&pass=${encodeURIComponent(PASS)}`,
});
const loginText = await loginRes.text();
console.log("Login:", loginRes.status, loginText.substring(0, 300));

let sessionId;
try {
  const loginData = JSON.parse(loginText);
  sessionId = loginData.session || loginData.id || loginData.token;
} catch {
  // Try to extract session from text
  const m = loginText.match(/"session"\s*:\s*"([^"]+)"/);
  sessionId = m?.[1];
}
console.log("Session:", sessionId);
if (!sessionId) {
  console.log("No session ID found");
  process.exit(1);
}

async function readFile(path) {
  const url = `https://srv1999-files.hstgr.io/rest/${sessionId}/api/resources${path}?view=text&limit=100`;
  console.log(`\nFetching: ${url}`);
  const res = await fetch(url);
  console.log(`Status: ${res.status}`);
  return res.text();
}

const stderr = await readFile("/nodejs/stderr.log");
console.log("\n=== stderr.log ===\n" + stderr.slice(-3000));
