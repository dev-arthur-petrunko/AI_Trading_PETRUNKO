// layout_check.mjs - Exercise §F: open the dashboard at 10 sizes, verify no clipping,
// no horizontal scroll, prio-1 visible, sphere round & fully visible; save screenshots.
// Run: AI_PROJ=... node layout_check.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const D = process.env.AI_PROJ;
const URL = process.env.SITE || "http://localhost:3000";
const OUT = path.join(D, "tests", "screens");
const SIZES = [
  [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440],
  [3440, 1440], [1024, 768], [820, 1180], [390, 844], [844, 390],
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let totalFail = 0;
const report = [];

for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const issues = [];
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".panel", { timeout: 30000 });
    await page.waitForTimeout(3500); // intro (2.2s) + first measure + sphere boot

    const res = await page.evaluate(() => {
      const out = { clipped: [], prioHidden: [], mode: document.documentElement.dataset.mode || "?" };
      // horizontal page scroll
      out.hScroll = document.documentElement.scrollWidth > window.innerWidth + 1;
      // clipped content: any element whose content overflows its box
      for (const el of document.querySelectorAll(".panel, .panel-head, .cell, .mcard, .lvl, .kpi, .mcell, .trow, .feed-row")) {
        if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
          out.clipped.push((el.className || el.tagName).toString().slice(0, 44));
        }
        if (out.clipped.length > 12) break;
      }
      // prio-1 visible (never hidden)
      for (const el of document.querySelectorAll('[data-prio="1"]')) {
        if (getComputedStyle(el).display === "none") out.prioHidden.push(el.className.toString().slice(0, 30));
      }
      // every panel must stay inside the viewport (orbit offsets must not push cards off)
      out.offscreen = [];
      for (const el of document.querySelectorAll(".panel")) {
        const rr = el.getBoundingClientRect();
        if (rr.width > 0 && (rr.left < -2 || rr.right > window.innerWidth + 2)) {
          out.offscreen.push((el.className || el.tagName).toString().slice(0, 40));
        }
      }
      // sphere round & fully visible
      const wrap = document.querySelector(".sphere-wrap");
      const cvs = document.querySelector(".sphere-mount canvas");
      if (wrap && cvs) {
        const wr = wrap.getBoundingClientRect();
        const cr = cvs.getBoundingClientRect();
        out.sphere = {
          round: Math.abs(cr.width - cr.height) <= Math.max(4, cr.height * 0.06),
          inside: cr.top >= wr.top - 2 && cr.bottom <= wr.bottom + 2 && cr.left >= wr.left - 2 && cr.right <= wr.right + 2,
          w: Math.round(cr.width), h: Math.round(cr.height),
        };
      } else out.sphere = null;
      return out;
    });

    if (res.hScroll) issues.push("horizontal page scroll");
    if (res.offscreen && res.offscreen.length) issues.push("panel off-screen: " + res.offscreen.join(" | "));
    if (res.clipped.length) issues.push("clipped: " + res.clipped.join(" | "));
    if (res.prioHidden.length) issues.push("prio1 hidden: " + res.prioHidden.join(" | "));
    if (res.sphere && (!res.sphere.round || !res.sphere.inside)) issues.push("sphere " + JSON.stringify(res.sphere));
    if (!res.sphere) issues.push("sphere missing");

    await page.screenshot({ path: path.join(OUT, `${w}x${h}.png`), fullPage: false });
  } catch (e) {
    issues.push("EXC " + String(e).slice(0, 160));
  }
  if (errors.length) issues.push("pageerror: " + errors[0]);
  report.push(`${w}x${h}: ${issues.length ? "FAIL — " + issues.join(" ; ") : "OK"}`);
  if (issues.length) totalFail++;
  await ctx.close();
}

await browser.close();
console.log(report.join("\n"));
console.log(totalFail ? `FAILURES: ${totalFail}/${SIZES.length}` : `ALL_OK ${SIZES.length}/${SIZES.length}`);
process.exit(totalFail ? 1 : 0);
