// Screenshots key screens at laptop and Pixel 7 sizes, light and dark, for design review.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });

const only = process.argv[4]?.split(",");
const targets = [
  ["today", "/design/today"],
  ["today-empty", "/design/today?empty"],
  ["planner-week", "/design/planner"],
  ["planner-day", "/design/planner?view=day"],
  ["planner-month", "/design/planner?view=month"],
  ["money", "/design/life?view=money"],
  ["training", "/design/life?view=training"],
  ["sleep", "/design/life?view=sleep"],
  ["meals", "/design/life?view=meals"],
  ["design", "/design"],
  ["login", "/login"],
].filter(([n]) => !only || only.includes(n));
const devices = [
  ["laptop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
  // Pixel 7 CSS viewport
  ["pixel7", { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }],
];

const browser = await chromium.launch({ channel: "msedge" });
for (const scheme of ["light", "dark"]) {
  for (const [dname, opts] of devices) {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme, timezoneId: "Europe/London", locale: "en-GB" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    for (const [name, path] of targets) {
      if (scheme === "dark" && name === "design") continue;
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const file = `${out}/${name}-${dname}-${scheme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log("saved", file);
    }
    if (errors.length) console.log(`  console errors (${dname}/${scheme}):`, [...new Set(errors)].slice(0, 5));
    await ctx.close();
  }
}
await browser.close();
