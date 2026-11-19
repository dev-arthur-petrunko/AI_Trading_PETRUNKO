// Shared analytic core: indicators, pattern-analog search, ensemble forecast, walk-forward backtest.
// Pure functions, no I/O — usable both by the Node server and by the browser.
// All time math is expressed via `bpd` (bars per day): 24 for hourly candles, 1 for daily.

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Analog = {
  t: number; // timestamp of the signal bar (end of the matching window)
  idx: number; // index of the signal bar
  sim: number; // 0..1
  r1d: number;
  r7d: number;
  r30d: number;
  label: string; // e.g. "Mar 2021"
};

export type Pair = { idx: number; cos: number; sim: number };

export type MicroInputs = { imbalance?: number; funding?: number; oiChange?: number };

export type Weights = { analogs: number; technical: number; micro: number; regime: number };

export const WEIGHTS: Weights = { analogs: 0.5, technical: 0.2, micro: 0.2, regime: 0.1 };

// ---------------------------------------------------------------- math utils

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const mean = (a: ArrayLike<number>) => {
  if (!a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
};

export const std = (a: ArrayLike<number>) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
  return Math.sqrt(s / a.length);
};

export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function znorm(a: ArrayLike<number>): Float64Array {
  const m = mean(a);
  const s = std(a) || 1e-12;
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] - m) / s;
  return out;
}

/** Dynamic Time Warping distance with a Sakoe–Chiba band (lower = more similar). Equal lengths expected. */
export function dtwDist(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length,
    m = b.length;
  if (!n || !m) return 1e9;
  const off = Math.max(8, Math.ceil(Math.abs(n - m) * 0.1) + 8);
  const INF = 1e18;
  let prev = new Float64Array(m).fill(INF);
  let cur = new Float64Array(m).fill(INF);
  prev[0] = Math.abs(a[0] - b[0]);
  for (let j = 1; j < m; j++) {
    cur.fill(INF);
    const lo = Math.max(1, j - off);
    const hi = Math.min(n - 1, j + off);
    const bj = b[j];
    for (let i = lo; i <= hi; i++) {
      const cost = Math.abs(a[i] - bj);
      let best = prev[i]; // from (i-1, j)
      const diag = prev[i - 1];
      if (diag < best) best = diag;
      const left = cur[i - 1];
      if (left < best) best = left;
      cur[i] = cost + (best >= INF ? 0 : best);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[m - 1] / (n + m);
}

// ---------------------------------------------------------------- indicators

export function emaSeries(v: number[], p: number): number[] {
  const k = 2 / (p + 1);
  const out = new Array<number>(v.length);
  let prev = 0;
  for (let i = 0; i < v.length; i++) {
    prev = i === 0 ? v[0] : v[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(v: number[], p = 14): number {
  if (v.length < p + 1) return 50;
  let g = 0,
    l = 0;
  for (let i = v.length - p; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  if (l === 0) return 100;
  const rs = g / p / (l / p);
  return 100 - 100 / (1 + rs);
}

export function macd(v: number[]) {
  const f = emaSeries(v, 12),
    s = emaSeries(v, 26);
  const line = f.map((x, i) => x - s[i]);
  const sig = emaSeries(line, 9);
  const i = line.length - 1;
  return { macd: line[i] ?? 0, signal: sig[i] ?? 0, hist: (line[i] ?? 0) - (sig[i] ?? 0) };
}

export function bollinger(v: number[], p = 20, k = 2) {
  const slice = v.slice(-p);
  const m = mean(slice);
  const s = std(slice);
  return { mid: m, up: m + k * s, dn: m - k * s, width: m ? (2 * k * s) / m : 0 };
}

/** Annualised volatility in % from log-returns; `bpd` scales the yearly cycle. */
export function realizedVol(closes: ArrayLike<number>, bars: number, bpd = 24): number {
  const n = Math.min(closes.length - 1, bars);
  if (n < 2) return 0;
  const r: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  return std(r) * Math.sqrt(bpd * 365) * 100;
}

// ---------------------------------------------------------------- horizon

// Primary headline horizon = 7 days (spec's example wording), 1 day as fallback for thin history.
const HORIZON_DAYS = [7, 1];

/** Primary forecast horizon (days) that the history actually supports. */
export function pickHorizonDays(n: number, windowLen: number, bpd = 24): number {
  for (const d of HORIZON_DAYS) if (n >= windowLen + d * bpd + 5) return d;
  return 0;
}

// ---------------------------------------------------------------- analog scan

export type ScanOptions = {
  windowLen?: number; // in bars
  top?: number;
  refineTop?: number;
  stride?: number;
  bpd?: number; // bars per day (24 hourly / 1 daily)
};

/**
 * Two-stage pattern search over the whole history:
 * 1) cheap z-normalised cosine scan (stride > 1 for speed),
 * 2) DTW re-rank of top candidates, blended similarity,
 * 3) greedy de-duplication so overlapping matches don't crowd the list.
 * Returns window START indices; the signal bar is idx + windowLen - 1.
 */
export function scanPairs(closes: ArrayLike<number>, opts: ScanOptions = {}): Pair[] {
  const n = closes.length;
  const bpd = opts.bpd ?? 24;
  const W = Math.round(clamp(opts.windowLen ?? 720, 60, 720));
  const top = opts.top ?? 50;
  const refineN = opts.refineTop ?? 900;
  const stride = Math.max(1, opts.stride ?? 2);

  const hDays = pickHorizonDays(n, W, bpd);
  const exclude = hDays * bpd + 2; // never touch the most recent window (horizon + overlap)
  const lastStart = n - W - exclude;
  if (lastStart < 4) return [];

  const lr = new Float64Array(n);
  for (let i = 1; i < n; i++) lr[i] = Math.log(closes[i] / closes[i - 1]);

  const query = lr.subarray(n - W, n);
  const q = znorm(query);
  let qNorm = 0;
  for (let i = 0; i < W; i++) qNorm += q[i] * q[i];
  qNorm = Math.sqrt(qNorm) || 1e-12;

  // stage 1: cosine prefilter
  const starts: number[] = [];
  const coss: number[] = [];
  for (let s = 0; s <= lastStart; s += stride) {
    let sum = 0;
    for (let i = 0; i < W; i++) sum += lr[s + i];
    const m = sum / W;
    let dot = 0,
      segVar = 0;
    for (let i = 0; i < W; i++) {
      const d = lr[s + i] - m;
      dot += d * q[i];
      segVar += d * d;
    }
    const cos = dot / ((Math.sqrt(segVar) || 1e-12) * qNorm);
    starts.push(s);
    coss.push(cos);
  }

  const order = starts.map((_, i) => i).sort((a, b) => coss[b] - coss[a]).slice(0, refineN);

  // stage 2: DTW re-rank of prefiltered candidates
  const refined: { s: number; cos: number; sim: number }[] = [];
  for (const oi of order) {
    const s = starts[oi];
    const seg = znorm(lr.subarray(s, s + W));
    const d = dtwDist(q, seg);
    const sim = 0.5 * ((coss[oi] + 1) / 2) + 0.5 * Math.exp(-1.2 * d);
    refined.push({ s, cos: coss[oi], sim });
  }
  refined.sort((a, b) => b.sim - a.sim);

  // stage 3: greedy de-duplication (min spacing = half window)
  const gap = Math.floor(W / 2);
  const picked: Pair[] = [];
  for (const r of refined) {
    if (picked.length >= top) break;
    if (picked.some((p) => Math.abs(p.idx - r.s) < gap)) continue;
    picked.push({ idx: r.s, cos: r.cos, sim: r.sim });
  }
  return picked;
}

/** Forward return; NaN when the horizon runs past the end of history. */
function fwd(closes: ArrayLike<number>, i: number, bars: number): number {
  const j = i + bars;
  if (j >= closes.length || i < 0 || closes[i] === 0) return NaN;
  return closes[j] / closes[i] - 1;
}

/** Attach timestamps and forward returns to raw scan pairs. */
export function buildAnalogs(candles: Candle[], pairs: Pair[], windowLen: number, bpd = 24): Analog[] {
  const closes = candles.map((c) => c.c);
  return pairs
    .map((p) => {
      const sig = p.idx + windowLen - 1;
      const t = candles[sig]?.t ?? 0;
      return {
        t,
        idx: sig,
        sim: p.sim,
        r1d: fwd(closes, sig, 1 * bpd),
        r7d: fwd(closes, sig, 7 * bpd),
        r30d: fwd(closes, sig, 30 * bpd),
        label: fmtDate(t),
      };
    })
    .filter((a) => a.t > 0);
}

function horizReturn(a: Analog, days: number): number {
  if (days >= 30) return a.r30d;
  if (days >= 7) return a.r7d;
  return a.r1d;
}

// ---------------------------------------------------------------- component votes (each ∈ [0,1] = P(up))

export function technicalVote(closes: ArrayLike<number>): number {
  const v = Array.from(closes);
  const price = v[v.length - 1] || 1;
  const r = rsi(v, 14) / 100;
  const m = macd(v);
  const sig = 1 / (1 + Math.exp(-m.hist / (0.004 * price)));
  const ef = emaSeries(v, 168),
    es = emaSeries(v, 720);
  const trend = ef[ef.length - 1] > es[es.length - 1] ? 0.65 : 0.35;
  const bb = bollinger(v, 20, 2);
  const pos = bb.width > 0 ? (price - bb.mid) / (bb.width * price) : 0;
  const bbVote = clamp(0.5 + Math.tanh(pos * 6) * 0.2, 0, 1);
  return clamp(0.3 * r + 0.3 * sig + 0.25 * trend + 0.15 * bbVote, 0, 1);
}

export function regimeVote(closes: ArrayLike<number>, bpd: number): number {
  const v = Array.from(closes);
  const ef = emaSeries(v, 7 * bpd),
    es = emaSeries(v, 30 * bpd);
  const r = Math.log((ef[ef.length - 1] || 1) / (es[es.length - 1] || 1));
  let p = 0.5 + clamp(r * 25, -0.3, 0.3);
  const volNow = realizedVol(v, 7 * bpd, bpd);
  const volRef = realizedVol(v, 30 * bpd, bpd);
  if (volRef > 0 && volNow > volRef * 1.3) p = 0.5 + (p - 0.5) * 0.6; // high vol → doubt
  return clamp(p, 0, 1);
}

export function microVote(m: MicroInputs | null | undefined): number {
  if (!m) return 0.5;
  const imb = m.imbalance ?? 0; // -1..1, + = bid heavy
  const fund = m.funding ?? 0; // e.g. 0.0001 = 0.01% per 8h
  const oi = m.oiChange ?? 0; // fraction
  // contrarian funding: crowded longs (high funding) lean bearish
  return clamp(
    0.5 + 0.3 * clamp(imb, -1, 1) - 0.15 * Math.tanh(fund / 0.0005) + 0.1 * Math.tanh(oi * 5),
    0,
    1,
  );
}

// ---------------------------------------------------------------- forecast

export type Quant = { p10: number; p50: number; p90: number; mean: number };

export type Forecast = {
  probUp: number;
  probDown: number;
  probFlat: number;
  confidence: number;
  edge: number;
  clearEdge: boolean;
  medianMove: { d1: number; d7: number; d30: number };
  spread: { d7: number };
  implied: { d1: Quant; d7: Quant; d30: Quant };
  bins: { centers: number[]; shares: number[] };
  analogs: Analog[];
  best: Analog | null;
  second: Analog | null;
  components: {
    analogs: { w: number; p: number };
    technical: { w: number; p: number };
    micro: { w: number; p: number };
    regime: { w: number; p: number };
    total: number;
  };
  summary: { upShare: number; upCount: number; count: number; nDays: number; thr: number };
  horizonDays: number;
  windowLen: number;
  computedAt: number;
  enoughData: boolean;
};

function weightedQuant(values: number[], weights: number[], q: number): number {
  const pairs = values.map((v, i) => ({ v, w: weights[i] })).filter((p) => Number.isFinite(p.v));
  if (!pairs.length) return 0;
  pairs.sort((a, b) => a.v - b.v);
  const total = pairs.reduce((s, p) => s + p.w, 0) || 1;
  let acc = 0;
  for (const p of pairs) {
    acc += p.w / total;
    if (acc >= q) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

function quantOf(values: number[], weights: number[]): Quant {
  const fin = values.filter((v) => Number.isFinite(v));
  return {
    p10: weightedQuant(values, weights, 0.1),
    p50: weightedQuant(values, weights, 0.5),
    p90: weightedQuant(values, weights, 0.9),
    mean: fin.length ? mean(fin) : 0,
  };
}

function histogram(values: number[], weights: number[], bins = 16) {
  const pairs = values.map((v, i) => ({ v, w: weights[i] })).filter((p) => Number.isFinite(p.v));
  if (!pairs.length) return { centers: [], shares: [] };
  let lo = Math.min(...pairs.map((p) => p.v)),
    hi = Math.max(...pairs.map((p) => p.v));
  if (lo === hi) {
    lo -= 0.01;
    hi += 0.01;
  }
  const w = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  const total = pairs.reduce((s, x) => s + x.w, 0) || 1;
  pairs.forEach((p) => {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((p.v - lo) / w)));
    counts[b] += p.w / total;
  });
  const centers = counts.map((_, i) => lo + w * (i + 0.5));
  return { centers, shares: counts };
}

export type ForecastOptions = {
  windowLen?: number; // bars
  top?: number;
  bpd?: number;
  micro?: MicroInputs | null;
  pairs?: Pair[]; // precomputed scan (avoids double work when caller already scanned)
};

export function buildForecast(candles: Candle[], opts: ForecastOptions = {}): Forecast | null {
  const bpd = opts.bpd ?? 24;
  const W = Math.round(clamp(opts.windowLen ?? 720, 60, 720));
  const closes = candles.map((c) => c.c);
  const hDays = pickHorizonDays(closes.length, W, bpd);
  if (!hDays) return null;

  const pairs = opts.pairs ?? scanPairs(closes, { windowLen: W, top: 50, refineTop: 900, stride: 2, bpd });
  if (pairs.length < 3) return null;

  const analogs = buildAnalogs(candles, pairs, W, bpd);
  if (analogs.length < 3) return null;

  const thr = 0.005 * Math.sqrt(hDays / 7); // dead-zone for FLAT, scaled with horizon
  const ws = analogs.map((a) => Math.pow(Math.max(a.sim, 0.01), 3));
  const wSum = ws.reduce((s, x) => s + x, 0) || 1;

  let wUp = 0,
    wFlat = 0,
    wDown = 0;
  const hRet: number[] = [];
  for (let i = 0; i < analogs.length; i++) {
    const r = horizReturn(analogs[i], hDays);
    if (!Number.isFinite(r)) continue; // no forward data (defensive; scanPairs should prevent this)
    hRet.push(r);
    if (r > thr) wUp += ws[i];
    else if (r < -thr) wDown += ws[i];
    else wFlat += ws[i];
  }
  const wDirTotal = wUp + wFlat + wDown || 1;
  const flatShare = wFlat / wDirTotal;

  const pAnalogs = wUp / (wUp + wDown || 1);
  const pTech = technicalVote(closes);
  const pMicro = microVote(opts.micro);
  const pRegime = regimeVote(closes, bpd);

  const total = clamp(
    WEIGHTS.analogs * pAnalogs +
      WEIGHTS.technical * pTech +
      WEIGHTS.micro * pMicro +
      WEIGHTS.regime * pRegime,
    0.02,
    0.98,
  );

  const probFlat = clamp(flatShare, 0.03, 0.3);
  let probUp = clamp(total, 0.02, 0.97);
  let probDown = 1 - probUp - probFlat;
  if (probDown < 0.02) {
    probDown = 0.02;
    probUp = clamp(1 - probFlat - probDown, 0.02, 0.97);
  }

  const edge = (probUp - probDown) / (probUp + probDown || 1);

  // agreement of the analog herd on the winning side
  const wDir = wUp + wDown || 1;
  const sideShare = Math.max(wUp, wDown) / wDir; // 0.5..1
  const votes = [pAnalogs, pTech, pMicro, pRegime];
  const majorityUp = probUp >= probDown;
  const agreeFrac = votes.filter((v) => (v >= 0.5) === majorityUp).length / votes.length;
  const confidence = clamp(Math.abs(edge) * (0.55 + 0.9 * (sideShare - 0.5)) * (0.6 + 0.4 * agreeFrac), 0, 1);

  const sortedBySim = [...analogs].sort((a, b) => b.sim - a.sim);
  const r1 = analogs.map((a) => a.r1d),
    r7 = analogs.map((a) => a.r7d),
    r30 = analogs.map((a) => a.r30d);

  return {
    probUp,
    probDown,
    probFlat,
    confidence,
    edge,
    clearEdge: confidence >= 0.15,
    medianMove: {
      d1: weightedQuant(r1, ws, 0.5),
      d7: weightedQuant(r7, ws, 0.5),
      d30: weightedQuant(r30, ws, 0.5),
    },
    spread: { d7: weightedQuant(r7, ws, 0.75) - weightedQuant(r7, ws, 0.25) },
    implied: { d1: quantOf(r1, ws), d7: quantOf(r7, ws), d30: quantOf(r30, ws) },
    bins: histogram(hRet, ws),
    analogs: sortedBySim,
    best: sortedBySim[0] ?? null,
    second: sortedBySim[1] ?? null,
    components: {
      analogs: { w: WEIGHTS.analogs, p: pAnalogs },
      technical: { w: WEIGHTS.technical, p: pTech },
      micro: { w: WEIGHTS.micro, p: pMicro },
      regime: { w: WEIGHTS.regime, p: pRegime },
      total,
    },
    summary: { upShare: wUp / wDirTotal, upCount: Math.round((wUp / wDirTotal) * analogs.length), count: analogs.length, nDays: hDays, thr },
    horizonDays: hDays,
    windowLen: W,
    computedAt: Date.now(),
    enoughData: closes.length >= 720,
  };
}

/** Human-readable summary assembled strictly from computed numbers. */
export function buildSummaryText(sym: string, f: Forecast | null, riskNote?: string): string {
  if (!f || !f.best) return `${sym}: недостаточно данных для поиска аналогов.`;
  const s = f.best;
  const s2 = f.second;
  const names = s2 ? `${s.label} и ${s2.label}` : s.label;
  const sims = s2
    ? `${Math.round(s.sim * 100)}% и ${Math.round(s2.sim * 100)}%`
    : `${Math.round(s.sim * 100)}%`;
  const part = `${f.summary.upCount} из ${f.summary.count}`;
  const dir = f.probUp >= f.probDown ? "рост" : "падение";
  const risk = riskNote ? ` Риск: ${riskNote}.` : "";
  return (
    `Рынок похож на ${names} (схожесть ${sims}). ` +
    `В ${part} таких случаев цена шла в направлении ${dir} за ${f.summary.nDays} дн.${risk}`
  );
}

// ---------------------------------------------------------------- backtest

export type BacktestCfg = {
  windowLen?: number;
  horizonDays?: number;
  anchors?: number;
  top?: number;
  minConfidence?: number;
  bpd?: number;
  years?: number; // evaluate only the most recent N years (spec: "последние 2 года")
};

export type CalRow = { lo: number; hi: number; predicted: number; realized: number; n: number };

export type BacktestResult = {
  computed: boolean;
  n: number;
  taken: number;
  coverage: number;
  hitRateAll: number;
  hitRateTaken: number;
  baselineUp: number;
  horizonDays: number;
  windowLen: number;
  minConfidence: number;
  from: number;
  to: number;
  ms: number;
  calibration: CalRow[];
  series: { t: number; price: number; predicted: number; conf: number; actual: number; hit: boolean }[];
  equity: { strategy: number; hold: number };
  note: string;
};

export function emptyBacktest(): BacktestResult {
  return {
    computed: false,
    n: 0,
    taken: 0,
    coverage: 0,
    hitRateAll: 0,
    hitRateTaken: 0,
    baselineUp: 0,
    horizonDays: 30,
    windowLen: 720,
    minConfidence: 0.15,
    from: 0,
    to: 0,
    ms: 0,
    calibration: [],
    series: [],
    equity: { strategy: 1, hold: 1 },
    note: "Расчёт выполняется…",
  };
}

/**
 * Walk-forward honest check: at many past moments run the same analog pipeline
 * (only on data that was known at that moment) and compare call vs reality.
 */
export function runBacktest(candles: Candle[], cfg: BacktestCfg = {}): BacktestResult {
  const t0 = Date.now();
  const res = emptyBacktest();
  const bpd = cfg.bpd ?? 24;
  const closes = candles.map((c) => c.c);
  const W = Math.round(clamp(cfg.windowLen ?? 720, 60, 720));
  const hDays = cfg.horizonDays || pickHorizonDays(closes.length, W, bpd);
  if (!hDays) {
    res.note = "Недостаточно истории для бэктеста.";
    return res;
  }
  const Hb = hDays * bpd;
  const top = cfg.top ?? 30;
  const minConf = cfg.minConfidence ?? 0.15;
  const A = Math.max(4, cfg.anchors ?? 52);
  const years = cfg.years ?? 2;

  // spec: honest check over the last 2 years; fall back to as much history as fits
  const spanBars = Math.round(years * 365 * bpd);
  const firstPos = Math.max(W + 10, closes.length - 1 - Hb - spanBars);
  const lastPos = closes.length - 1 - Hb;
  if (lastPos <= firstPos + 8) {
    res.note = "Недостаточно истории для бэктеста.";
    return res;
  }
  const spacing = (lastPos - firstPos) / (A - 1);
  const stride = Math.max(1, Math.round(spacing / Hb)); // no horizon overlap between anchors

  const positions: number[] = [];
  for (let i = 0; i < A; i++) {
    const p = Math.round(firstPos + i * spacing);
    if (p > lastPos) break;
    if (positions.length && p - positions[positions.length - 1] < Hb) continue;
    positions.push(p);
  }
  void stride;

  const calBuckets = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];
  const cal: CalRow[] = calBuckets.slice(0, -1).map((lo, i) => ({
    lo,
    hi: calBuckets[i + 1],
    predicted: 0,
    realized: 0,
    n: 0,
  }));

  const series: BacktestResult["series"] = [];
  let hitsAll = 0,
    hitsTaken = 0,
    taken = 0,
    upActual = 0;
  let eqS = 1,
    eqH = 1;

  for (const p of positions) {
    const prefix = candles.slice(0, p + 1);
    const closesP = closes.slice(0, p + 1);
    const pairs = scanPairs(closesP, { windowLen: W, top, refineTop: 250, stride: 4, bpd });
    if (pairs.length < 3) continue;
    const analogs = buildAnalogs(prefix, pairs, W, bpd);
    if (analogs.length < 3) continue;

    const thr = 0.005 * Math.sqrt(hDays / 7);
    const ws = analogs.map((a) => Math.pow(Math.max(a.sim, 0.01), 3));
    let wUp = 0,
      wDn = 0;
    for (let i = 0; i < analogs.length; i++) {
      const r = horizReturn(analogs[i], hDays);
      if (r > thr) wUp += ws[i];
      else if (r < -thr) wDn += ws[i];
    }
    const pA = wUp / (wUp + wDn || 1);
    const pT = technicalVote(closesP);
    const pR = regimeVote(closesP, bpd);
    // micro-structure is unavailable historically → its weight is honestly re-normalised away
    const total = clamp(
      (WEIGHTS.analogs * pA + WEIGHTS.technical * pT + WEIGHTS.regime * pR) /
        (WEIGHTS.analogs + WEIGHTS.technical + WEIGHTS.regime),
      0.02,
      0.98,
    );

    const wDir = wUp + wDn || 1;
    const sideShare = Math.max(wUp, wDn) / wDir;
    const votes = [pA, pT, pR];
    const majorityUp = total >= 0.5;
    const agree = votes.filter((v) => (v >= 0.5) === majorityUp).length / votes.length;
    const edge = total - (1 - total);
    const conf = clamp(Math.abs(edge) * (0.55 + 0.9 * (sideShare - 0.5)) * (0.6 + 0.4 * agree), 0, 1);

    const actual = closes[p + Hb] / closes[p] - 1;
    const actualUp = actual > 0;
    const predUp = total >= 0.5;
    const hit = predUp === actualUp;
    if (actualUp) upActual++;
    hitsAll += hit ? 1 : 0;
    const isTaken = conf >= minConf;
    if (isTaken) {
      taken++;
      if (hit) hitsTaken++;
      eqS *= 1 + (predUp ? actual : -actual); // long on up-call, short on down-call
    }
    eqH *= 1 + actual;

    const pDir = predUp ? total : 1 - total;
    const bi = cal.findIndex((c) => pDir >= c.lo && pDir < c.hi);
    if (bi >= 0) {
      cal[bi].n++;
      cal[bi].predicted += pDir;
      cal[bi].realized += hit ? 1 : 0;
    }
    series.push({ t: candles[p].t, price: closes[p], predicted: total, conf, actual, hit });
  }

  res.computed = true;
  res.n = series.length;
  res.taken = taken;
  res.coverage = res.n ? taken / res.n : 0;
  res.hitRateAll = res.n ? hitsAll / res.n : 0;
  res.hitRateTaken = taken ? hitsTaken / taken : 0;
  res.baselineUp = res.n ? upActual / res.n : 0;
  res.horizonDays = hDays;
  res.windowLen = W;
  res.minConfidence = minConf;
  res.from = candles[positions[0]]?.t ?? 0;
  res.to = candles[closes.length - 1]?.t ?? 0;
  res.ms = Date.now() - t0;
  res.calibration = cal
    .filter((c) => c.n > 0)
    .map((c) => ({ ...c, predicted: c.predicted / c.n, realized: c.realized / c.n }));
  res.series = series;
  res.equity = { strategy: eqS, hold: eqH };
  res.note =
    `Walk-forward: ${res.n} сигналов за ${new Date(res.from).toLocaleDateString("en-US")} — ` +
    `${new Date(res.to).toLocaleDateString("en-US")}, горизонт ${hDays} д., ` +
    `окно ${W} свечей, порог уверенности ${(minConf * 100).toFixed(0)}%. ` +
    `Точность по всем сигналам: ${(res.hitRateAll * 100).toFixed(1)}%, ` +
    `только уверенные: ${(res.hitRateTaken * 100).toFixed(1)}% (покрытие ${(res.coverage * 100).toFixed(0)}%), ` +
    `всегда-в-верх: ${(res.baselineUp * 100).toFixed(1)}%. ` +
    `Микроструктура в истории недоступна — её вес честно перераспределён. ` +
    `Окно подобрано на валидационной выборке, поэтому оценка может быть оптимистичной.`;
  return res;
}
