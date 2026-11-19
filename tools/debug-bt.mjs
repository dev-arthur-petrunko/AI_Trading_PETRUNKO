// Diagnose walk-forward backtest per-anchor: which component is contrarian?
import { selectSeries } from "../server/store.mjs";
import {
  scanPairs,
  buildAnalogs,
  technicalVote,
  regimeVote,
  pickHorizonDays,
  WEIGHTS,
  clamp,
} from "../lib/analyze.mjs";

const sym = process.argv[2] || "BTC";
const sel = selectSeries(sym);
if (!sel) { console.log("no series"); process.exit(1); }
const { candles, windowLen: W, bpd } = sel;
const closes = candles.map((c) => c.c);
const hDays = pickHorizonDays(closes.length, W, bpd) || 30;
const Hb = hDays * bpd;
const A = 30;
const firstPos = W + 10;
const lastPos = closes.length - 1 - Hb;

console.log(`sym=${sym} tf=${sel.tf} bars=${closes.length} W=${W} hDays=${hDays} firstPos=${firstPos} lastPos=${lastPos}`);

const rows = [];
for (let i = 0; i < A; i++) {
  const p = Math.round(firstPos + (i * (lastPos - firstPos)) / (A - 1));
  const prefix = candles.slice(0, p + 1);
  const closesP = closes.slice(0, p + 1);
  const pairs = scanPairs(closesP, { windowLen: W, top: 30, refineTop: 250, stride: 4, bpd });
  if (pairs.length < 3) { console.log(`#${i} p=${p} ${new Date(candles[p].t).toISOString().slice(0,10)} → scan empty (${pairs.length})`); continue; }
  const als = buildAnalogs(prefix, pairs, W, bpd);
  if (als.length < 3) continue;
  const thr = 0.005 * Math.sqrt(hDays / 7);
  const ws = als.map((a) => Math.pow(Math.max(a.sim, 0.01), 3));
  let wUp = 0, wDn = 0;
  for (let k = 0; k < als.length; k++) {
    const r = hDays >= 30 ? als[k].r30d : hDays >= 7 ? als[k].r7d : als[k].r1d;
    if (r > thr) wUp += ws[k]; else if (r < -thr) wDn += ws[k];
  }
  const pA = wUp / (wUp + wDn || 1);
  const pT = technicalVote(closesP);
  const pR = regimeVote(closesP, bpd);
  const total = clamp((WEIGHTS.analogs * pA + WEIGHTS.technical * pT + WEIGHTS.regime * pR) / 0.8, 0.02, 0.98);
  const actual = closes[p + Hb] / closes[p] - 1;
  const predUp = total >= 0.5;
  const hit = predUp === (actual > 0);
  rows.push({ pA, pT, pR, total, actual, hit });
  console.log(
    `#${String(i).padStart(2)} ${new Date(candles[p].t).toISOString().slice(0,10)}` +
    ` pA=${pA.toFixed(2)} pT=${pT.toFixed(2)} pR=${pR.toFixed(2)} → P=${total.toFixed(2)}` +
    ` actual=${(actual * 100).toFixed(1)}% ${hit ? "HIT " : "MISS"}`,
  );
}

const corr = (getx, gety) => {
  const xs = rows.map(getx), ys = rows.map(gety);
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return num / (Math.sqrt(dx * dy) || 1);
};
const hits = rows.filter((r) => r.hit).length;
console.log(`\n${hits}/${rows.length} hits = ${((hits / rows.length) * 100).toFixed(1)}%`);
console.log(`corr(pA,actual)=${corr((r) => r.pA, (r) => r.actual).toFixed(3)}`);
console.log(`corr(pT,actual)=${corr((r) => r.pT, (r) => r.actual).toFixed(3)}`);
console.log(`corr(pR,actual)=${corr((r) => r.pR, (r) => r.actual).toFixed(3)}`);
console.log(`corr(P, actual)=${corr((r) => r.total, (r) => r.actual).toFixed(3)}`);
console.log(`mean actual=${((rows.reduce((a, r) => a + r.actual, 0) / rows.length) * 100).toFixed(1)}%`);
console.log(`share predUp=${(rows.filter((r) => r.total >= 0.5).length / rows.length * 100).toFixed(0)}%`);
