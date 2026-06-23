// Diagnostic: walk signup flow + dump every URL transition, every console error,
// and what useConvexAuth state appears in the DOM.
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = `probe-${Date.now()}@x.local`;
const PASSWORD = "probe-pw-12345";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const consoleErr = [];
const reqs = [];
page.on("console", (m) => { if (m.type() === "error") consoleErr.push(m.text()); });
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("URL→", f.url()); });
page.on("request", (r) => { if (r.url().includes("convex") || r.url().includes("/api/")) reqs.push(`${r.method()} ${r.url()}`); });

await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="email"]');

// Switch to signup
const switchBtn = page.getByRole("button", { name: /Need an account/i }).last();
if (await switchBtn.count() > 0) {
  await switchBtn.click();
  await page.waitForTimeout(200);
}
const form = page.locator("form").last();
await form.locator('input[type="email"]').fill(EMAIL);
await form.locator('input[type="password"]').fill(PASSWORD);
await form.locator('button[type="submit"]').click();

// Wait up to 15s for URL to leave /login
const tStart = Date.now();
while (Date.now() - tStart < 15000) {
  if (!page.url().includes("/login")) break;
  await page.waitForTimeout(250);
}
console.log("FINAL URL:", page.url());
console.log("CONSOLE ERRORS:", consoleErr.length);
consoleErr.slice(0, 5).forEach((e) => console.log("  -", e.slice(0, 200)));
console.log("CONVEX/API REQUESTS:");
reqs.slice(-15).forEach((r) => console.log("  ", r));

await browser.close();
