// console.mjs — load page, report non-benign console messages
import { chromium } from "playwright";
const URL = process.env.SITE || "http://localhost:3000";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const logs = [];
page.on("pageerror", (e) => logs.push("PAGEERROR " + String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(m.type().toUpperCase() + " " + m.text().slice(0, 250)); });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000);
const benign = [/React DevTools/, /WebGL.*GPU stall/, /GL Driver Message/];
const bad = [...new Set(logs)].filter((l) => !benign.some((b) => b.test(l)));
console.log(bad.length ? "CONSOLE NOT CLEAN:\n" + bad.join("\n") : "CONSOLE_CLEAN");
await browser.close();
