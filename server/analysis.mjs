// Analysis orchestrator (main thread): owns results state and dispatches CPU-heavy
// jobs to a small worker_threads pool. Forecast cadence ≈ 60s per symbol per spec.
import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SYMBOLS, IDS, fetchMicro } from "./exchange.mjs";
import { buildSummaryText } from "../lib/analyze.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const analysis = {
  forecasts: {}, // sym -> Forecast
  timelines: {}, // sym -> [{ t, sim, r7d, r30d, src }]
  backtests: {}, // sym -> BacktestResult
  meta: {}, // sym -> { tf, windowLen, bpd, bars }
  summaryText: {},
  micro: {}, // sym -> { funding, oiChange }
  microAt: {},
  depth: {}, // sym -> { imbalance, bids, asks, ts } (filled by feeds)
  dirty: new Set(),
  lastForecast: {},
  ready: false,
  forecastsDone: false,
  log: () => {},
};

const FORECAST_TTL = 60_000;
const MICRO_TTL = 300_000;
const BACKTEST_REFRESH = 20 * 60_000;
const WORKERS = 2;

// ---------------------------------------------------------------- worker pool

const queue = [];
const pending = new Map(); // id -> {resolve, reject}
const workers = [];
let nextId = 1;

function spawnWorker(i) {
  const w = new Worker(path.join(here, "worker.mjs"), { name: `analysis-${i}` });
  w._busy = false;
  w._ids = new Set();
  w.on("message", (msg) => {
    w._busy = false;
    w._ids.delete(msg.id);
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (p) msg.ok ? p.resolve(msg) : p.reject(new Error(msg.error || "worker error"));
    pump();
  });
  const fail = (err) => {
    for (const id of w._ids) {
      const p = pending.get(id);
      pending.delete(id);
      p?.reject(err instanceof Error ? err : new Error(String(err)));
    }
    w._ids.clear();
    const idx = workers.indexOf(w);
    if (idx >= 0) workers.splice(idx, 1);
    analysis.log(`[analysis] worker ${i} упал (${err?.message || err}) — перезапуск…`);
    setTimeout(() => spawnWorker(i), 1500);
  };
  w.on("error", fail);
  w.on("exit", (code) => { if (code !== 0) fail(new Error(`exit ${code}`)); });
  workers.push(w);
  return w;
}

function pump() {
  for (const w of workers) {
    if (w._busy || !queue.length) continue;
    const job = queue.shift();
    w._busy = true;
    const id = nextId++;
    w._ids.add(id);
    pending.set(id, { resolve: job.resolve, reject: job.reject });
    w.postMessage({ ...job.msg, id });
  }
}

function dispatch(msg) {
  return new Promise((resolve, reject) => {
    queue.push({ msg, resolve, reject });
    pump();
  });
}

// ---------------------------------------------------------------- results state

export function forecastBrief(sym) {
  const f = analysis.forecasts[sym];
  if (!f) return null;
  return {
    probUp: f.probUp,
    probDown: f.probDown,
    probFlat: f.probFlat,
    confidence: f.confidence,
    clearEdge: f.clearEdge,
    edge: f.edge,
    horizonDays: f.horizonDays,
    count: f.summary.count,
    upCount: f.summary.upCount,
    best: f.best ? { label: f.best.label, t: f.best.t, sim: f.best.sim, r: horizBest(f) } : null,
    second: f.second ? { label: f.second.label, t: f.second.t, sim: f.second.sim } : null,
    components: f.components,
    medianMove: f.medianMove,
    spread: f.spread,
    bins: f.bins,
    implied: f.implied,
    analogs: f.analogs.slice(0, 50),
    computedAt: f.computedAt,
    enoughData: f.enoughData,
    timelineTop: (analysis.timelines[sym] || []).length,
    text: analysis.summaryText[sym] || "",
    meta: analysis.meta[sym] || null,
    micro: analysis.micro[sym] || {},
  };
}

function horizBest(f) {
  return f.summary.nDays >= 30 ? f.best?.r30d : f.summary.nDays >= 7 ? f.best?.r7d : f.best?.r1d;
}

export function backtestBrief(sym) {
  const b = analysis.backtests[sym];
  if (!b) return { computed: false, note: "Расчёт выполняется…" };
  return {
    computed: b.computed,
    n: b.n,
    taken: b.taken,
    coverage: b.coverage,
    hitRateAll: b.hitRateAll,
    hitRateTaken: b.hitRateTaken,
    baselineUp: b.baselineUp,
    horizonDays: b.horizonDays,
    note: b.note,
    from: b.from,
    to: b.to,
    tf: b.tf || "1h",
    ms: b.ms,
    calibration: b.calibration,
    equity: b.equity,
  };
}

// ---------------------------------------------------------------- micro inputs

async function microFor(sym) {
  const at = analysis.microAt[sym] || 0;
  if (Date.now() - at > MICRO_TTL) {
    try {
      const m = await fetchMicro(sym);
      analysis.micro[sym] = { ...(analysis.micro[sym] || {}), ...m };
      analysis.microAt[sym] = Date.now();
    } catch {}
  }
  const depth = analysis.depth[sym];
  return { ...(analysis.micro[sym] || {}), imbalance: depth?.imbalance ?? 0 };
}

function riskNote(micro) {
  if (micro?.funding !== undefined && Math.abs(micro.funding) > 0.0003) {
    return micro.funding > 0
      ? "высокий funding rate (перекос в лонги)"
      : "высокий отрицательный funding rate (перекос в шорты)";
  }
  return undefined;
}

// ---------------------------------------------------------------- jobs

const inflight = new Set();

export function requestForecast(sym, hooks = {}) {
  if (inflight.has(`f:${sym}`)) return;
  inflight.add(`f:${sym}`);
  microFor(sym)
    .then((micro) => dispatch({ job: "forecast", sym, micro }))
    .then((res) => {
      analysis.forecasts[sym] = res.forecast;
      analysis.timelines[sym] = res.timeline;
      analysis.meta[sym] = res.meta;
      analysis.lastForecast[sym] = Date.now();
      analysis.dirty.delete(sym);
      analysis.summaryText[sym] = res.forecast
        ? buildSummaryText(sym, res.forecast, riskNote(analysis.micro[sym]))
        : `${sym}: недостаточно данных для поиска аналогов.`;
      hooks.onForecast?.(sym, res.forecast);
    })
    .catch((e) => analysis.log(`[analysis] ${sym} forecast: ${e.message}`))
    .finally(() => inflight.delete(`f:${sym}`));
}

export function requestBacktest(sym, hooks = {}) {
  if (inflight.has(`b:${sym}`)) return;
  inflight.add(`b:${sym}`);
  dispatch({ job: "backtest", sym })
    .then((res) => {
      analysis.backtests[sym] = res.backtest;
      hooks.onBacktest?.(sym, res.backtest);
    })
    .catch((e) => analysis.log(`[analysis] ${sym} backtest: ${e.message}`))
    .finally(() => inflight.delete(`b:${sym}`));
}

// ---------------------------------------------------------------- main loop

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastBacktestAt = {};
let backtestsQueued = false;

/** Mark symbol(s) for immediate re-analysis (default: all). */
export function markDirty(sym) {
  if (sym) analysis.dirty.add(sym);
  else for (const id of IDS) analysis.dirty.add(id);
}

/** Runs until killed; calls hooks after meaningful events so the server can broadcast. */
export async function startAnalysis(hooks = {}) {
  const log = hooks.log || console.log;
  analysis.log = log;
  for (let i = 0; i < WORKERS; i++) spawnWorker(i);
  log(`[analysis] ${WORKERS} worker threads ready`);

  while (true) {
    try {
      const now = Date.now();

      // forecasts: on demand (dirty) or at least once a minute per symbol
      for (const sym of IDS) {
        const last = analysis.forecasts[sym]?.computedAt || analysis.lastForecast[sym] || 0;
        if (analysis.dirty.has(sym) || now - last > FORECAST_TTL) {
          requestForecast(sym, { onForecast: hooks.onForecast });
        }
      }

      // when the first forecast batch is complete → queue the backtests
      if (!backtestsQueued && IDS.every((id) => analysis.forecasts[id])) {
        backtestsQueued = true;
        for (const id of IDS) requestBacktest(id, { onBacktest: hooks.onBacktest });
        log("[analysis] первичные прогнозы готовы — запускаю walk-forward бэктест");
      }

      // periodic single-symbol backtest refresh, spread over time
      if (backtestsQueued) {
        const pendingCount = IDS.filter((id) => !analysis.backtests[id]?.computed).length;
        if (pendingCount === 0 && !analysis.ready) {
          analysis.ready = true;
          log("[analysis] бэктест готов для всех монет");
          hooks.onReady?.();
        }
        if (analysis.ready && now - Math.max(...IDS.map((id) => lastBacktestAt[id] || 0)) > BACKTEST_REFRESH) {
          const pick = IDS[Math.floor(Math.random() * IDS.length)];
          lastBacktestAt[pick] = now;
          requestBacktest(pick, { onBacktest: hooks.onBacktest });
        }
      }

      hooks.onCycle?.(analysis);
    } catch (e) {
      log(`[analysis] loop error: ${e.message}`);
    }
    await sleep(5000);
  }
}

export { IDS };
export const SYMBOL_IDS = SYMBOLS.map((s) => s.id);
