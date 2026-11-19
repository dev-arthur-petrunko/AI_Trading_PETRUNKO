// Analysis worker thread: runs the CPU-heavy pattern search / backtest off the
// main event loop so HTTP + WebSocket stay at 60 FPS for the dashboard.
import { parentPort } from "node:worker_threads";
import { selectSeries } from "./store.mjs";
import {
  buildForecast,
  buildAnalogs,
  scanPairs,
  runBacktest,
  emptyBacktest,
} from "../lib/analyze.mjs";

const port = parentPort;
if (!port) {
  console.error("[worker] no parentPort");
  process.exit(1);
}

port.on("message", (msg) => {
  const t0 = Date.now();
  try {
    if (msg.job === "forecast") {
      port.postMessage(handleForecast(msg));
    } else if (msg.job === "backtest") {
      port.postMessage(handleBacktest(msg));
    } else {
      port.postMessage({ id: msg.id, ok: false, error: `unknown job ${msg.job}` });
    }
  } catch (e) {
    port.postMessage({ id: msg.id, ok: false, error: `${e.message} (${msg.job} ${msg.sym} ${Date.now() - t0}ms)` });
  }
});

function handleForecast(msg) {
  const { id, sym, micro } = msg;
  const sel = selectSeries(sym);
  if (!sel) return { id, ok: true, forecast: null, timeline: [], meta: null, sym };
  const { candles, windowLen, bpd, tf } = sel;
  const closes = candles.map((c) => c.c);

  // one scan feeds both the forecast (top-50) and the analog timeline (top-120)
  const pairs = scanPairs(closes, {
    windowLen,
    top: 120,
    refineTop: 900,
    stride: bpd === 24 ? 2 : 1,
    bpd,
  });

  const forecast = pairs.length
    ? buildForecast(candles, { windowLen, bpd, top: 50, micro: micro || null, pairs: pairs.slice(0, 50) })
    : null;

  const timeline = buildAnalogs(candles, pairs, windowLen, bpd).map((a) => ({
    t: a.t,
    sim: a.sim,
    r7d: a.r7d,
    r30d: a.r30d,
    src: tf,
  }));

  return {
    id,
    ok: true,
    sym,
    forecast,
    timeline,
    meta: { tf, windowLen, bpd, bars: candles.length, at: Date.now() },
  };
}

function handleBacktest(msg) {
  const { id, sym } = msg;
  const sel = selectSeries(sym);
  if (!sel) {
    const empty = emptyBacktest();
    empty.note = "Недостаточно истории для бэктеста.";
    return { id, ok: true, sym, backtest: empty, tf: null };
  }
  const backtest = runBacktest(sel.candles, {
    windowLen: sel.windowLen,
    bpd: sel.bpd,
    horizonDays: 7,
    years: 2,
    anchors: 52,
    top: 30,
    minConfidence: 0.15,
  });
  backtest.tf = sel.tf;
  return { id, ok: true, sym, backtest };
}
