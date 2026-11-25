// overlap_check.mjs - do panels OVERLAP each other? (layout_check only checked clipping)
import path from "node:path";
import { chromium } from "playwright";
const D = process.env.AI_PROJ;
const URL = process.env.SITE || "http://localhost:3000";
const EXPECT = ["mc-prob","mc-conf","mc-rsi","mc-macd","mc-vol","mc-funding","g-sphere",
  "sat-fan","sat-risk","sat-top3","sat-hit","sat-feed",
  "g-candles","g-book","g-fng","g-feed","g-fan","g-timeline","g-tape"];
const SIZES = [[1920,1080],[1536,864],[2560,1440],[1000,700],[1366,768]];
const browser = await chromium.launch();
let fail = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const issues = [];
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".panel", { timeout: 30000 });
    // real hydration + intro dismiss + entrance animations done (same as layout_check)
    await page.waitForFunction(
      () => document.documentElement.dataset.mode && document.querySelector(".sphere-mount canvas"),
      null, { timeout: 30000 }
    );
    await page.waitForFunction(() => document.querySelector(".intro.done"), null, { timeout: 15000 });
    await page.waitForTimeout(2000);
    const res = await page.evaluate((expect) => {
      const out = { missing: [], overlaps: [], mode: document.documentElement.dataset.mode };
      const rects = {};
      for (const el of document.querySelectorAll(".dash-grid > .panel, .dash-grid > .mc-sat")) {
        const cls = el.id || [...el.classList].find((c) => /^(g-|mc-|sat-)/.test(c));
        if (cls) rects[cls] = el.getBoundingClientRect();
      }
      for (const k of expect) if (!rects[k]) out.missing.push(k);
      const keys = Object.keys(rects);
      for (let i = 0; i < keys.length; i++)
        for (let j = i + 1; j < keys.length; j++) {
          const a = rects[keys[i]], b = rects[keys[j]];
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 4 && oy > 4) out.overlaps.push(keys[i] + "^" + keys[j] + " " + Math.round(ox) + "x" + Math.round(oy));
        }
      // orbit offsets must never push a card out of the viewport
      out.offscreen = keys.filter((k) => {
        const r = rects[k];
        return r.width > 0 && (r.left < -2 || r.right > window.innerWidth + 2);
      });
      return out;
    }, EXPECT);
    if (res.missing.length) issues.push("missing: " + res.missing.join(","));
    if (res.overlaps.length) issues.push("overlap: " + res.overlaps.join(" | "));
    if (res.offscreen && res.offscreen.length) issues.push("offscreen: " + res.offscreen.join(","));
    if (res.missing.length || res.overlaps.length || (res.offscreen && res.offscreen.length)) fail++;
    const cnt = Object.keys(rects).length;
    console.log(`${w}x${h} [${res.mode}]: ` + (issues.length ? "FAIL " + issues.join("; ") : `OK (${cnt} cards, no overlap)`));
  } catch (e) {
    fail++;
    console.log(`${w}x${h}: EXC ${String(e).slice(0, 120)}`);
  }
  await ctx.close();
}
await browser.close();
console.log(fail ? "FAILURES " + fail : "ALL_OK");
process.exit(fail ? 1 : 0);
