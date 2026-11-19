// A/B sweep of analog-matching methods on walk-forward backtest (30 anchors, 30d horizon).
// A: z-normalised per-bar log-returns + Pearson (current production)
// B: z-normalised log-price PATH + Pearson  ("форма кривой" reading of the spec)
// C: blend of A and B scores
// Also sweeps window length W ∈ {168, 336, 720} hourly bars.
import {
  technicalVote,
  regimeVote,
  pickHorizonDays,
  WEIGHTS,
  clamp,
} from "../lib/analyze.mjs";

const dtw = (a, b) => {
  const n = a.length, m = b.length;
  const off = Math.max(8, Math.ceil(Math.abs(n - m) * 0.1) + 8);
  const INF = 1e18;
  let prev = new Float64Array(m).fill(INF);
  let cur = new Float64Array(m).fill(INF);
  prev[0] = Math.abs(a[0] - b[0]);
  for (let j = 1; j < m; j++) {
    cur.fill(INF);
    const lo = Math.max(1, j - off), hi = Math.min(n - 1, j + off);
    const bj = b[j];
    for (let i = lo; i <= hi; i++) {
      const cost = Math.abs(a[i] - bj);
      let best = prev[i];
      if (prev[i - 1] < best) best = prev[i - 1];
      if (cur[i - 1] < best) best = cur[i - 1];
      cur[i] = cost + (best >= INF ? 0 : best);
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[m - 1] / (n + m);
};

const znorm = (a) => {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length || 1e-12;
  const sd = Math.sqrt(v);
  return a.map((x) => (x - m) / sd);
};
const pearson = (x, y) => {
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let d = 0, xx = 0, yy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] - mx, b = y[i] - my;
    d += a * b; xx += a * a; yy += b * b;
  }
  return d / (Math.sqrt(xx * yy) || 1e-12);
};

/** Build features for a closes array. mode: "ret" | "path" */
function features(closes, W, mode) {
  const n = closes.length;
  const out = new Array(n);
  if (mode === "ret") {
    out[0] = 0;
    for (let i = 1; i < n; i++) out[i] = Math.log(closes[i] / closes[i - 1]);
  } else {
    // log-price path (shape of the curve); index by absolute position, window slice taken later
    for (let i = 0; i < n; i++) out[i] = Math.log(closes[i]);
  }
  void W;
  return out;
}

function scanCustom(closes, W, mode, { stride = 2, refineN = 250, hDays = 30, bpd = 24 } = {}) {
  const n = closes.length;
  const exclude = hDays * bpd + 2;
  const lastStart = n - W - exclude;
  if (lastStart < 4) return [];
  const feat = features(closes, W, mode);
  const qRaw = feat.slice(n - W, n);
  const q = znorm(qRaw);

  // coarse cosine over stride
  const cands = [];
  for (let s = 0; s <= lastStart; s += stride) {
    const seg = znorm(feat.slice(s, s + W));
    let d = 0, xx = 0, yy = 0;
    for (let i = 0; i < W; i++) { d += q[i] * seg[i]; xx += q[i] * q[i]; yy += seg[i] * seg[i]; }
    cands.push({ s, cos: d / (Math.sqrt(xx * yy) || 1e-12) });
  }
  cands.sort((a, b) => b.cos - a.cos);
  const top = cands.slice(0, refineN);
  const refined = top.map((c) => {
    const seg = znorm(feat.slice(c.s, c.s + W));
    const dd = dtw(q, seg);
    return { s: c.s, cos: c.cos, sim: 0.5 * ((c.cos + 1) / 2) + 0.5 * Math.exp(-1.2 * dd) };
  });
  refined.sort((a, b) => b.sim - a.sim);
  const gap = Math.floor(W / 2);
  const picked = [];
  for (const r of refined) {
    if (picked.length >= 50) break;
    if (picked.some((p) => Math.abs(p.s - r.s) < gap)) continue;
    picked.push(r);
  }
  return picked;
}

function paFrom(pairs, closes, hDays, bpd) {
  const thr = 0.005 * Math.sqrt(hDays / 7);
  let wUp = 0, wDn = 0, wFlat = 0;
  const fwdReturns = [];
  for (const p of pairs) {
    const sig = p.s + (p.w ?? 0);
    void sig;
    const idx = p.sigIdx;
    const j = idx + hDays * bpd;
    if (j >= closes.length) continue;
    const r = closes[j] / closes[idx] - 1;
    const w = Math.pow(Math.max(p.sim, 0.01), 3);
    fwdReturns.push({ r, w });
    if (r > thr) wUp += w; else if (r < -thr) wDn += w; else wFlat += w;
  }
  const total = wUp + wDn;
  const pa = total > 0 ? wUp / total : 0.5;
  return { pa, wUp, wDn, wFlat, fwdReturns };
}

function ensemble(pa, pT, pR) {
  return clamp(
    (WEIGHTS.analogs * pa + WEIGHTS.technical * pT + WEIGHTS.regime * pR) /
      (WEIGHTS.analogs + WEIGHTS.technical + WEIGHTS.regime),
    0.02, 0.98,
  );
}

function walkForward(closes, W, bpd, mode) {
  const hDays = pickHorizonDays(closes.length, W, bpd) || 30;
  const Hb = hDays * bpd;
  const A = 30;
  const firstPos = W + 10;
  const lastPos = closes.length - 1 - Hb;
  if (lastPos <= firstPos + A) return null;
  const rows = [];
  let signalSum = 0, signalN = 0;
  for (let i = 0; i < A; i++) {
    const p = Math.round(firstPos + (i * (lastPos - firstPos)) / (A - 1));
    const closesP = closes.slice(0, p + 1);
    const pairs = scanCustom(closesP, W, mode, { hDays, bpd, stride: 4, refineN: 250 });
    if (pairs.length < 3) continue;
    // attach signal indices
    for (const pr of pairs) pr.sigIdx = pr.s + W - 1;
    const { pa, fwdReturns } = paFrom(pairs, closesP, hDays, bpd);
    // informativeness of the top-50 set: mean forward return of matches vs universe base rate
    const topMean = fwdReturns.length
      ? fwdReturns.reduce((s, x) => s + x.r * x.w, 0) / fwdReturns.reduce((s, x) => s + x.w, 0)
      : 0;
    signalSum += topMean; signalN++;
    const pT = technicalVote(closesP);
    const pR = regimeVote(closesP, bpd);
    const total = ensemble(pa, pT, pR);
    const actual = closes[p + Hb] / closes[p] - 1;
    const hit = (total >= 0.5) === (actual > 0);
    const edge = Math.abs(total - 0.5);
    rows.push({ pa, total, actual, hit, taken: edge >= 0.10, topMean });
  }
  if (!rows.length) return null;
  const hits = rows.filter((r) => r.hit).length;
  const taken = rows.filter((r) => r.taken);
  const takenHits = taken.filter((r) => r.hit).length;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  // correlation helpers
  const corr = (gx, gy) => {
    const xs = rows.map(gx), ys = rows.map(gy);
    const mx = mean(xs), my = mean(ys);
    let num = 0, dx = 0, dy = 0;
    for (let k = 0; k < xs.length; k++) { num += (xs[k] - mx) * (ys[k] - my); dx += (xs[k] - mx) ** 2; dy += (ys[k] - my) ** 2; }
    return num / (Math.sqrt(dx * dy) || 1e-9);
  };
  return {
    n: rows.length,
    hit: hits / rows.length,
    takenN: taken.length,
    takenHit: taken.length ? takenHits / taken.length : NaN,
    corrPa: corr((r) => r.pa, (r) => r.actual),
    corrP: corr((r) => r.total, (r) => r.actual),
    baseUp: rows.filter((r) => r.actual > 0).length / rows.length,
    meanTop: signalN ? signalSum / signalN : 0,
    meanActual: mean(rows.map((r) => r.actual)),
  };
}

const symbols = ["BTC", "ETH", "SOL", "BNB"];
const Ws = [168, 336, 720];
const modes = ["ret", "path"];

const { selectSeries } = await import("../server/store.mjs");

console.log("sym\tW\tmode\thit%\ttakenHit(n)\tcorrPa\tcorrP\tbaseUp%\ttopMean%\tmeanActual%");
for (const sym of symbols) {
  const sel = selectSeries(sym);
  if (!sel) continue;
  const closes = sel.candles.map((c) => c.c);
  for (const W of Ws) {
    if (closes.length < W + 400) continue;
    for (const mode of modes) {
      const t0 = Date.now();
      const r = walkForward(closes, W, sel.bpd, mode);
      if (!r) continue;
      console.log(
        `${sym}\t${W}\t${mode}\t${(r.hit * 100).toFixed(0)}\t${(r.takenHit * 100).toFixed(0)}(${r.takenN})` +
        `\t${r.corrPa.toFixed(2)}\t${r.corrP.toFixed(2)}\t${(r.baseUp * 100).toFixed(0)}` +
        `\t${(r.meanTop * 100).toFixed(1)}\t${(r.meanActual * 100).toFixed(1)}\t[${Date.now() - t0}ms]`,
      );
    }
  }
}
