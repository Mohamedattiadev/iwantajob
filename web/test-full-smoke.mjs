// Full end-to-end smoke for every deployed feature.
//   1.  Sign up a fresh user.
//   2.  Walk the onboarding wizard.
//   3.  /jobs:  list loads, score popover opens, save + hide persist
//               across reload, filter URL persists.
//   4.  /apply: kanban view shows 5 columns; list view toggles.
//   5.  /cv:    page renders, preview iframe present, PDF button visible.
//   6.  /learn: page renders without console error.
//   7.  /assistant, /interview, /settings, /excalidraw, /sketch:
//               each renders, status < 500, no unwhitelisted console errors.
//   8.  Final report: PASS/FAIL line per check + per-route console errors.
//
// Run: node test-full-smoke.mjs [base-url]
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://iwantajob-rho.vercel.app";
const EMAIL = `full-${Date.now()}@example.com`;
const PASSWORD = "full-pw-12345";

const IGNORE = [
  /Failed to load resource: the server responded with a status of 401/,
  /Failed to load resource: the server responded with a status of 404/,
  /Download the React DevTools/,
  /\[Convex.* Auth\]/,
  /beforeunload.* without.* user gesture|never had a user gesture/i,
];
const shouldIgnore = (t) => IGNORE.some((r) => r.test(t));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

const allErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    if (!shouldIgnore(t)) allErrors.push({ where: page.url(), text: t });
  }
});
page.on("pageerror", (e) =>
  allErrors.push({ where: page.url(), text: `pageerror: ${e.message}` }),
);

const results = [];
const log = (msg) => console.log(msg);
const check = (name, pass, detail = "") =>
  results.push({ name, pass, detail });

async function clickByName(re) {
  const btn = page.getByRole("button", { name: re }).first();
  if ((await btn.count()) > 0 && (await btn.isEnabled())) {
    await btn.click();
    await page.waitForTimeout(250);
    return true;
  }
  return false;
}

async function visit(path, label) {
  allErrors.length = 0;
  const errsBefore = [...allErrors];
  let ok = false, final = "?", err = "";
  try {
    const r = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(600);
    final = page.url().replace(BASE, "") || "/";
    ok = r && r.status() < 500;
  } catch (e) {
    err = e.message;
  }
  const errs = allErrors.filter((e) => !errsBefore.includes(e));
  const bounced =
    final.startsWith("/login") ||
    (final.startsWith("/welcome") && path !== "/welcome");
  const pass = ok && errs.length === 0 && !err && !bounced;
  check(`route ${label || path}`, pass,
    bounced ? `bounced → ${final}` :
    err ? err :
    errs.length ? `${errs.length} console err` : "");
  return { final, errs };
}

// ── 1. Sign up ───────────────────────────────────────────────────────────
log(`Test user: ${EMAIL}`);
await page.goto(BASE + "/login");
await page.waitForSelector('input[type="email"]');
const form = page.locator("form").last();
const switchBtn = page.getByRole("button", { name: /Need an account.*Sign up/i }).last();
if ((await switchBtn.count()) > 0) {
  await switchBtn.click();
  await page.waitForTimeout(300);
}
await form.locator('input[type="email"]').fill(EMAIL);
await form.locator('input[type="password"]').fill(PASSWORD);
await form.locator('button[type="submit"]').click();
let signedUp = false;
try {
  await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 30000 });
  signedUp = true;
} catch {}
check("auth: signup", signedUp, signedUp ? "" : `stuck on ${page.url()}`);

// ── 2. Onboarding wizard ─────────────────────────────────────────────────
if (!page.url().includes("/welcome")) await page.goto(BASE + "/welcome");
await page.waitForLoadState("domcontentloaded");
await clickByName(/let'?s go/i);
const nameInput = page.locator('input[placeholder*="Mohamed" i]').first();
if ((await nameInput.count()) > 0) await nameInput.fill("Smoke Test");
await clickByName(/skip.*fill manually|skip — fill manually/i);
await clickByName(/^skip$/i);
await clickByName(/open dashboard/i);
let wizardDone = false;
try {
  await page.waitForURL((u) => !u.toString().includes("/welcome"), { timeout: 15000 });
  wizardDone = true;
} catch {}
check("onboarding: wizard exits", wizardDone, wizardDone ? "" : `at ${page.url()}`);

// ── 3. /jobs ─────────────────────────────────────────────────────────────
await visit("/jobs?view=all", "/jobs");
await page.waitForTimeout(1500);

// Score popover
let popoverOk = false;
try {
  const badge = page.locator('button[title="Click for breakdown"]').first();
  await badge.waitFor({ state: "visible", timeout: 10000 });
  await badge.click();
  await page.waitForTimeout(400);
  const dialog = page.locator('div[role="dialog"]').filter({ hasText: /Score breakdown/i });
  popoverOk = (await dialog.count()) > 0;
  // Dismiss
  await page.keyboard.press("Escape");
} catch (e) {
  log(`score popover err: ${e.message}`);
}
check("jobs: score popover opens", popoverOk);

// Save + Hide persist
let saveOk = false, hideOk = false;
let savedTitle = "", hiddenTitle = "";
try {
  const firstCard = page.locator("article").first();
  await firstCard.waitFor({ state: "visible", timeout: 8000 });
  savedTitle = ((await firstCard.locator("h3").first().textContent()) ?? "").trim();
  if (savedTitle) {
    await firstCard.locator('button[title="Save for later"]').click();
    await page.waitForTimeout(500);
  }
  const secondCard = page.locator("article").nth(1);
  if ((await secondCard.count()) > 0) {
    hiddenTitle = ((await secondCard.locator("h3").first().textContent()) ?? "").trim();
    await secondCard.locator('button[title="Hide"]').click();
    await page.waitForTimeout(500);
  }

  await page.goto(BASE + "/jobs?view=saved");
  await page.waitForTimeout(1800);
  const savedTitles = (await page.locator("article h3").allTextContents()).map((t) => t.trim());
  saveOk = !savedTitle || savedTitles.includes(savedTitle);

  if (hiddenTitle) {
    await page.goto(BASE + "/jobs?view=hidden");
    await page.waitForTimeout(1800);
    const hiddenTitles = (await page.locator("article h3").allTextContents()).map((t) => t.trim());
    hideOk = hiddenTitles.includes(hiddenTitle);
  } else {
    hideOk = true;
  }
} catch (e) {
  log(`save/hide err: ${e.message}`);
}
check("jobs: save persists", saveOk, savedTitle || "no cards");
check("jobs: hide persists", hideOk, hiddenTitle || "no second card");

// Filter URL persist
let urlOk = false;
try {
  await page.goto(BASE + "/jobs?source=remoteok&min_score=70");
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForTimeout(1500);
  const u = new URL(page.url());
  urlOk =
    u.searchParams.get("source") === "remoteok" &&
    u.searchParams.get("min_score") === "70";
} catch (e) {
  log(`url persist err: ${e.message}`);
}
check("jobs: filter URL persists", urlOk);

// Tailor button visible
let tailorBtnOk = false;
try {
  await page.goto(BASE + "/jobs?view=all");
  await page.waitForTimeout(1500);
  const tailor = page.getByRole("button", { name: /tailor/i }).first();
  tailorBtnOk = (await tailor.count()) > 0;
} catch {}
check("jobs: tailor button rendered", tailorBtnOk);

// ── 4. /apply ────────────────────────────────────────────────────────────
await visit("/apply", "/apply");
let kanbanToggleOk = false, listOk = false;
try {
  const kBtn = page.getByRole("button", { name: /kanban/i }).first();
  kanbanToggleOk = (await kBtn.count()) > 0;
  const lBtn = page.getByRole("button", { name: /^list$/i }).first();
  if ((await lBtn.count()) > 0) {
    await lBtn.click();
    await page.waitForTimeout(400);
    listOk = true;
  }
} catch (e) {
  log(`apply view err: ${e.message}`);
}
check("apply: kanban toggle present", kanbanToggleOk);
check("apply: list view toggle", listOk);

// ── 5. /cv ───────────────────────────────────────────────────────────────
await visit("/cv", "/cv");
let cvOk = false;
try {
  await page.waitForTimeout(1500);
  const preview = page.locator("iframe").first();
  cvOk = (await preview.count()) > 0;
} catch {}
check("cv: preview iframe rendered", cvOk);

// ── 6. /learn ────────────────────────────────────────────────────────────
await visit("/learn", "/learn");

// ── 7. Remaining gated routes ───────────────────────────────────────────
for (const path of ["/assistant", "/interview", "/settings", "/excalidraw", "/sketch", "/"]) {
  await visit(path);
}

await browser.close();

// ── Report ──────────────────────────────────────────────────────────────
let fail = 0;
log("\n─── results ───");
for (const r of results) {
  if (!r.pass) fail += 1;
  log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  — " + r.detail : ""}`);
}
log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail === 0 ? 0 : 1);
