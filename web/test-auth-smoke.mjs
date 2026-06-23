// Authenticated smoke. Signs up a fresh test user, walks the onboarding
// wizard so gated routes don't bounce, then walks every gated route and
// reports console errors + actual final URL. PASS = status<500, the route
// did NOT bounce back to /login or /welcome, AND no unwhitelisted console
// errors fired.
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
  // Chromium info: editors (excalidraw, MDX) attach beforeunload on mount.
  // Browser blocks the confirm panel until first user gesture; not an app bug.
  /beforeunload.* without.* user gesture|never had a user gesture/i,
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

// --- Sign up -------------------------------------------------------------
await page.goto(BASE + "/login");
await page.waitForSelector('input[type="email"]');
// SSR + hydration renders the form twice; use the live (last) instance.
const form = page.locator("form").last();
const switchBtn = page.getByRole("button", { name: /Need an account.*Sign up/i }).last();
if (await switchBtn.count() > 0) {
  await switchBtn.click();
  await page.waitForTimeout(300);
}
await form.locator('input[type="email"]').fill(EMAIL);
await form.locator('input[type="password"]').fill(PASSWORD);
await form.locator('button[type="submit"]').click();

// Wait for auth-driven router.replace away from /login. networkidle is
// not sufficient — the navigation happens *after* the React commit that
// follows the auth response, which can land outside the network-quiet window.
try {
  await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 30000 });
} catch {
  console.log(`SIGNUP STUCK ON: ${page.url()}`);
  await browser.close();
  process.exit(2);
}
console.log(`After signup → ${page.url()}`);

// --- Walk onboarding wizard so OnboardingGate stops bouncing to /welcome.
// The wizard has 4 steps (Hi → name → goals → done). Skip what we can.
if (!page.url().includes("/welcome")) {
  await page.goto(BASE + "/welcome");
}
await page.waitForLoadState("domcontentloaded");

async function clickByName(re) {
  const btn = page.getByRole("button", { name: re }).first();
  if (await btn.count() > 0 && await btn.isEnabled()) {
    await btn.click();
    await page.waitForTimeout(250);
    return true;
  }
  return false;
}

// Step 0: "Let's go"
await clickByName(/let'?s go/i);
// Step 1: type a name + skip CV upload
const nameInput = page.locator('input[placeholder*="Mohamed" i]').first();
if (await nameInput.count() > 0) {
  await nameInput.fill("Smoke Test");
  await page.waitForTimeout(150);
}
await clickByName(/skip.*fill manually|skip — fill manually/i);
// Step 2: skip Q&A
await clickByName(/^skip$/i);
// Step 3: open dashboard
await clickByName(/open dashboard/i);

// Wait for landing on / (or any non-welcome URL)
try {
  await page.waitForURL((u) => !u.toString().includes("/welcome"), { timeout: 15000 });
} catch {
  console.log(`STUCK IN WIZARD AT: ${page.url()}`);
}
console.log(`After wizard → ${page.url()}`);

// --- Walk gated routes ---------------------------------------------------
const results = [];
for (const path of GATED) {
  allErrors.length = 0;
  let ok = false;
  let final = "?";
  let err = "";
  try {
    const r = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    final = page.url().replace(BASE, "") || "/";
    ok = r && r.status() < 500;
  } catch (e) {
    err = e.message;
  }
  results.push({ path, final, ok, errors: [...allErrors], err });
}

await browser.close();

let fail = 0;
for (const r of results) {
  const bounced = r.final.startsWith("/login") || (r.final.startsWith("/welcome") && r.path !== "/welcome");
  const pass = r.ok && r.errors.length === 0 && !r.err && !bounced;
  if (!pass) fail++;
  const tag = pass ? "PASS" : "FAIL";
  const reason = bounced ? "  bounced" : r.err ? `  ERR=${r.err}` : r.errors.length ? `  ${r.errors.length} console err` : "";
  console.log(`${tag}  ${r.path.padEnd(14)} → ${r.final}${reason}`);
  for (const e of r.errors) console.log(`        ${e.text.slice(0, 220)}`);
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail === 0 ? 0 : 1);
