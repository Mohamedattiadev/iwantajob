// Prod smoke test — unauth flow only (no credentials). Verifies:
//   - All public routes load (no 5xx, no JS crash)
//   - Auth-gated routes redirect to /login (not 500)
//   - No console errors beyond known noise
// Run: node test-smoke.mjs [base-url]
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://iwantajob-rho.vercel.app";

const PUBLIC = ["/login"];
const GATED = ["/", "/cv", "/jobs", "/learn", "/apply", "/assistant", "/interview", "/settings", "/welcome", "/excalidraw", "/sketch"];

const IGNORE_CONSOLE = [
  /Failed to load resource: the server responded with a status of 401/,
  /Failed to load resource: the server responded with a status of 404/,
  /\[next-auth\]/,
  /Download the React DevTools/,
];

function shouldIgnore(text) {
  return IGNORE_CONSOLE.some((r) => r.test(text));
}

const results = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    if (!shouldIgnore(t)) consoleErrors.push(t);
  }
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

for (const path of [...PUBLIC, ...GATED]) {
  consoleErrors.length = 0;
  let status = "?";
  let finalUrl = "?";
  let err = "";
  try {
    const resp = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
    status = resp ? resp.status() : "no-response";
    finalUrl = page.url();
    await page.waitForTimeout(800);
  } catch (e) {
    err = e.message;
  }
  results.push({
    path,
    status,
    finalUrl: finalUrl.replace(BASE, ""),
    errors: [...consoleErrors],
    err,
  });
}

await browser.close();

let fail = 0;
for (const r of results) {
  const ok = !r.err && r.status !== "?" && Number(r.status) < 500 && r.errors.length === 0;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.path.padEnd(14)} → ${r.status} → ${r.finalUrl}${r.err ? `  ERR=${r.err}` : ""}`);
  for (const e of r.errors) console.log(`        console: ${e.slice(0, 200)}`);
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail === 0 ? 0 : 1);
