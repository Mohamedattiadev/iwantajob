// Authenticated prod smoke. Signs up a fresh test user, walks the gated
// routes, and reports console errors + which routes render content.
// Run: node test-auth-smoke.mjs [base-url]
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://iwantajob-rho.vercel.app";
const EMAIL = `smoke-${Date.now()}@example.com`;
const PASSWORD = "smoke-pw-12345";

const GATED = ["/", "/cv", "/jobs", "/learn", "/apply", "/assistant", "/interview", "/settings", "/excalidraw", "/sketch"];

const IGNORE = [
  /Failed to load resource: the server responded with a status of 401/,
  /Failed to load resource: the server responded with a status of 404/,
  /Download the React DevTools/,
  /\[Convex.* Auth\]/,
];
const shouldIgnore = (t) => IGNORE.some((r) => r.test(t));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const allErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    if (!shouldIgnore(t)) allErrors.push({ where: page.url(), text: t });
  }
});
page.on("pageerror", (e) => allErrors.push({ where: page.url(), text: `pageerror: ${e.message}` }));

console.log(`Test user: ${EMAIL}`);

// Sign up
await page.goto(BASE + "/login");
await page.waitForSelector('input[type="email"]');
// The page renders the form twice (SSR + hydration shell). Use the *last* one,
// which is the live React-controlled instance.
const form = page.locator("form").last();
const switchBtn = page.getByRole("button", { name: /Need an account.*Sign up/i }).last();
if (await switchBtn.count() > 0) {
  await switchBtn.click();
  await page.waitForTimeout(300);
}
await form.locator('input[type="email"]').fill(EMAIL);
await form.locator('input[type="password"]').fill(PASSWORD);
await page.waitForTimeout(400);
await form.locator('button[type="submit"]').click();
await page.waitForLoadState("networkidle", { timeout: 30000 });
console.log(`After signup → ${page.url()}`);

// If we land on /welcome, skip the wizard by going directly to / — onboarded flag may still block.
// Walk each gated route and report.
const results = [];
for (const path of GATED) {
  allErrors.length = 0;
  let ok = false;
  let final = "?";
  let err = "";
  try {
    const r = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
    final = page.url().replace(BASE, "");
    ok = r && r.status() < 500;
    await page.waitForTimeout(1000);
  } catch (e) {
    err = e.message;
  }
  results.push({ path, final, ok, errors: [...allErrors], err });
}

await browser.close();

let fail = 0;
for (const r of results) {
  const pass = r.ok && r.errors.length === 0 && !r.err;
  if (!pass) fail++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${r.path.padEnd(14)} → ${r.final}${r.err ? `  ERR=${r.err}` : ""}`);
  for (const e of r.errors) console.log(`        ${e.text.slice(0, 220)}`);
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail === 0 ? 0 : 1);
