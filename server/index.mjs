// AI Trading Petrunko — backend: HTTP API + WebSocket hub + exchange feeds + analysis workers.
// Public endpoints only (no keys in the client), rate-limited, cached in SQLite (node:sqlite).
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  SYMBOLS,
  IDS,
  state,
  setSource,
  activeSource,
  startFeeds,
  fetchDepth,
  fetchFng,
  fetchMarketRank,
} from "./exchange.mjs";
import { insertCandles, readCandles, selectSeries, countAll } from "./store.mjs";
import { ensureHistory, topUp, deepHistoryLoop } from "./history.mjs";
import { startAccumulator, setAux, aiState, aiSeries } from "./accum.mjs";
import {
  analysis,
  startAnalysis,
  markDirty,
  forecastBrief,
  backtestBrief,
} from "./analysis.mjs";

const PORT = Number(process.env.PORT || 8787);
const MAX_EVENTS = 150;

// ---------------------------------------------------------------- utils

let seq = 0;
const bootLog = [];

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  bootLog.push(line);
  if (bootLog.length > 40) bootLog.shift();
  broadcast({ type: "log", line, seq: ++seq });
}

analysis.log = log;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- WS hub

const wss = new WebSocketServer({ noServer: true });

function broadcast(obj) {
  if (!wss.clients.size) return;
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}

function sendSubscribed(symbol, obj) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN && c._subs?.has(symbol)) c.send(s);
  }
}

// ---------------------------------------------------------------- event feed

const evLog = [];

const KIND_ICON = { trade: "TRADE", whale: "WHALE", wall: "WALL", ai: "AI", sys: "SYS" };

let lastEvPush = 0;

function pushEvent(ev) {
  // live feed shows the focused symbol + global AI/system notes (keeps FPS at 60)
  const isFocused = !ev.sym || ev.sym === focus;
  const global = ev.kind === "ai" || ev.kind === "sys";
  if (!global && !isFocused) return;
  const now = Date.now();
  if (ev.kind !== "sys" && ev.kind !== "ai" && now - lastEvPush < 400) return;
  if (ev.kind !== "sys" && ev.kind !== "ai") lastEvPush = now;
  evLog.unshift({ ...ev, id: ++seq, icon: KIND_ICON[ev.kind] || "DATA" });
  if (evLog.length > MAX_EVENTS) evLog.pop();
  broadcast({ type: "event", ev: evLog[0] });
}

let focus = "BTC";

// live price tick (≥1/s per spec), throttled to 1 Hz
let lastPush = 0;
function pushTickThrottled() {
  const now = Date.now();
  if (now - lastPush < 1000) return;
  lastPush = now;
  broadcast({ type: "tick", stats: state.stats, latency: state.latency });
}

// ---------------------------------------------------------------- auxiliary data (FNG / rank)

let fng = null;
let rank = null;

async function refreshFng() {
  try {
    fng = await fetchFng(60);
    setAux({ fng: fng.value });
    broadcast({ type: "fng", fng });
  } catch (e) {
    log(`fng error: ${e.message}`);
  }
}

async function refreshRank() {
  try {
    rank = await fetchMarketRank();
    broadcast({ type: "rank", rank });
  } catch (e) {
    log(`rank error: ${e.message}`);
  }
}

// ---------------------------------------------------------------- exchange feed hooks

const wallAt = {};

startFeeds({
  onTrade: (id, tr) => {
    // live price tick: spec requires ≥1 update per second
    const st = state.stats[id];
    if (st && Number.isFinite(tr.p)) {
      st.price = tr.p;
      st.src = tr.src || st.src;
      pushTickThrottled();
    }
    const usd = tr.p * tr.q;
    const whale = usd > 500_000;
    if (whale || Math.random() < 0.25) {
      pushEvent({
        kind: whale ? "whale" : "trade",
        sym: id,
        side: tr.side,
        price: tr.p,
        qty: tr.q,
        usd,
        t: tr.t,
      });
    }
  },
  onDepth: (id, bids, asks, ts) => {
    const bv = bids.reduce((a, [p, q]) => a + p * q, 0);
    const av = asks.reduce((a, [p, q]) => a + p * q, 0);
    const imbalance = bv + av ? (bv - av) / (bv + av) : 0;
    analysis.depth[id] = { imbalance, bids, asks, ts };

    // wall detection: a single level ≥3% of the top-20 book and ≥ $2M
    const now = Date.now();
    if (!wallAt[id] || now - wallAt[id] > 20000) {
      const total = bv + av;
      let bestLvl = null;
      for (const [side, arr] of [["bid", bids], ["ask", asks]]) {
        for (const [p, q] of arr) {
          const notional = p * q;
          if (notional > 2_000_000 && total > 0 && notional / total > 0.03) {
            if (!bestLvl || notional > bestLvl.usd) bestLvl = { side, p, q, usd: notional };
          }
        }
      }
      if (bestLvl) {
        wallAt[id] = now;
        pushEvent({ kind: "wall", sym: id, side: bestLvl.side, price: bestLvl.p, qty: bestLvl.q, usd: bestLvl.usd, t: now });
      }
    }
  },
  onM1: (id, k) => {
    if (!k.closed) return;
    insertCandles(id, "1m", [k]);
    markDirty(id); // new bar → analysis re-runs within the next minute (per spec)
    pushLive(id, { type: "m1", symbol: id, candle: k, seq: ++seq });
  },
  onWs: (src, up) => log(`ws ${src}: ${up ? "connected" : "disconnected"} — reconnect…`),
  onHealth: () => broadcast({ type: "health", alive: state.alive, ws: state.wsUp, latency: state.latency, active: activeSource() }),
  onStats: (stats) => broadcast({ type: "tick", stats, latency: state.latency }),
  onDegraded: () => log("оба источника недоступны — пробую резервный путь"),
});

function pushLive(symbol, obj) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN && c._subs?.has(symbol)) c.send(s);
  }
}

// ---------------------------------------------------------------- HTTP

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function statusPayload() {
  return {
    ok: true,
    ts: Date.now(),
    source: state.source,
    active: activeSource(),
    alive: state.alive,
    ws: state.wsUp,
    latency: state.latency,
    stats: state.stats,
    counts: countAll(),
    ready: analysis.ready,
    fng,
    rank,
    boot: bootLog.slice(-10),
  };
}

const httpServer = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;
  try {
    if (p === "/api/status") return json(res, 200, statusPayload());
    if (p === "/api/ai/state") return json(res, 200, aiState());
    if (p === "/api/ai/series") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      const lvlRaw = u.searchParams.get("level") || "hourly";
      const level = ["hourly", "daily", "monthly"].includes(lvlRaw) ? lvlRaw : "hourly";
      const limit = Math.min(1000, Number(u.searchParams.get("limit") || 48));
      return json(res, 200, { symbol: sym, level, rows: aiSeries(sym, level, limit) });
    }

    if (p === "/api/source") {
      const s = u.searchParams.get("s");
      if (s && s !== state.source) {
        setSource(s);
        log(`источник данных: ${state.source}`);
        pushEvent({ kind: "sys", text: `источник → ${state.source.toUpperCase()}`, t: Date.now() });
        broadcast({ type: "source", source: state.source });
      }
      return json(res, 200, { source: state.source, active: activeSource() });
    }

    if (p === "/api/candles") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      const tf = ["1m", "5m", "1h", "1d"].includes(u.searchParams.get("tf")) ? u.searchParams.get("tf") : "1h";
      const limit = Math.min(3000, Number(u.searchParams.get("limit") || 500));
      if (!IDS.includes(sym)) return json(res, 400, { error: "unknown symbol" });
      return json(res, 200, { symbol: sym, tf, candles: readCandles(sym, tf, limit) });
    }

    if (p === "/api/history") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      if (!IDS.includes(sym)) return json(res, 400, { error: "unknown symbol" });
      const q = u.searchParams.get("q");
      if (q === "deep") return json(res, 200, { symbol: sym, tf: "deep", candles: selectSeries(sym)?.candles || [] });
      const tf = q === "1d" ? "1d" : "1h";
      return json(res, 200, { symbol: sym, tf, candles: readCandles(sym, tf, 3000) });
    }

    if (p === "/api/depth") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      if (!IDS.includes(sym)) return json(res, 400, { error: "unknown symbol" });
      const c = analysis.depth[sym];
      if (c && Date.now() - c.ts < 4000) return json(res, 200, c);
      const d = await fetchDepth(sym);
      analysis.depth[sym] = d;
      return json(res, 200, d);
    }

    if (p === "/api/forecast") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      return json(res, 200, {
        symbol: sym,
        forecast: forecastBrief(sym),
        timeline: (analysis.timelines[sym] || []).slice(0, 60),
        fng,
      });
    }

    if (p === "/api/analogs") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      if (!IDS.includes(sym)) return json(res, 400, { error: "unknown symbol" });
      const f = analysis.forecasts[sym];
      const sel = selectSeries(sym);
      const at = Number(u.searchParams.get("at") || 0);

      // detail mode: tiny payload for one analog's overlay (then / future / now segments)
      if (at > 0 && sel) {
        const W = f?.windowLen || 336;
        const bpd = sel.bpd;
        const idx = sel.candles.findIndex((c) => c.t === at);
        if (idx < 0) return json(res, 404, { error: "analog not found" });
        const win = Math.round(W * 0.75);
        const g = (i) => sel.candles[i]?.c ?? 0;
        const then = [], future = [], now = [];
        for (let i = Math.max(0, idx - win); i <= idx; i++) then.push(g(i));
        for (let i = idx; i <= Math.min(sel.candles.length - 1, idx + 7 * bpd); i++) future.push(g(i));
        for (let i = Math.max(0, sel.candles.length - 1 - win); i < sel.candles.length; i++) now.push(g(i));
        return json(res, 200, { symbol: sym, at, then, future, now });
      }

      const top = Math.min(50, Number(u.searchParams.get("top") || 50));
      if (!f || !sel)
        return json(res, 200, { symbol: sym, analogs: [], windowLen: 0, t0: 0, t1: 0 });
      return json(res, 200, {
        symbol: sym,
        analogs: f.analogs.slice(0, top),
        windowLen: f.windowLen,
        horizonDays: f.horizonDays,
        tf: sel.tf,
        t0: sel.candles[0]?.t ?? 0,
        t1: sel.candles[sel.candles.length - 1]?.t ?? 0,
        current: sel.candles[sel.candles.length - 1]?.c ?? 0,
        currentT: sel.candles[sel.candles.length - 1]?.t ?? 0,
        now: f.medianMove,
      });
    }

    if (p === "/api/forecast-fan") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      const f = analysis.forecasts[sym];
      const sel = selectSeries(sym);
      if (!f || !sel) return json(res, 200, { error: "нет данных" });
      return json(res, 200, {
        symbol: sym,
        current: sel.candles[sel.candles.length - 1]?.c ?? 0,
        implied: f.implied,
        median: f.medianMove,
        horizonDays: f.horizonDays,
        probUp: f.probUp,
        probFlat: f.probFlat,
        probDown: f.probDown,
        bins: f.bins,
        analogs: f.analogs.map((a) => ({ t: a.t, sim: a.sim, r1d: a.r1d, r7d: a.r7d, r30d: a.r30d })),
        tail: sel.candles.slice(-24).map((c) => ({ t: c.t, c: c.c })),
        computedAt: f.computedAt,
      });
    }

    if (p === "/api/backtest") {
      const sym = (u.searchParams.get("symbol") || "BTC").toUpperCase();
      const brief = backtestBrief(sym);
      if (u.searchParams.get("full") !== "1") return json(res, 200, brief);
      const b = analysis.backtests[sym];
      return json(res, 200, b ? { ...brief, series: b.series, note: b.note } : brief);
    }

    if (p === "/api/event-log") return json(res, 200, { events: evLog.slice(0, 80) });
    if (p === "/api/fng") return json(res, 200, { fng });

    if (p.startsWith("/api/")) return json(res, 404, { error: "not found" });
    return json(res, 404, { error: "Not found" });
  } catch (e) {
    log(`http error ${p}: ${e.message}`);
    json(res, 500, { error: String(e.message) });
  }
});

// ---------------------------------------------------------------- WebSocket protocol

httpServer.on("upgrade", (req, socket, head) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname !== "/ws") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (socket) => {
  socket._subs = new Set();
  socket.isAlive = true;
  socket.on("pong", () => (socket.isAlive = true));

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg?.type === "sub" && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase();
      const tf = ["1m", "5m", "1h", "1d"].includes(msg.tf) ? msg.tf : "1h";
      socket._subs.add(sym);
      focus = sym;
      socket.send(JSON.stringify({ type: "klines", symbol: sym, tf, candles: readCandles(sym, tf, 600) }));
      const d = analysis.depth[sym];
      if (d) socket.send(JSON.stringify({ type: "depth", symbol: sym, ...d }));
      const f = forecastBrief(sym);
      if (f) socket.send(JSON.stringify({ type: "forecast", symbol: sym, forecast: f }));
      const bt = backtestBrief(sym);
      if (bt) socket.send(JSON.stringify({ type: "backtest", symbol: sym, backtest: bt }));
      if (fng) socket.send(JSON.stringify({ type: "fng", fng }));
      if (rank) socket.send(JSON.stringify({ type: "rank", rank }));
    } else if (msg?.type === "unsub" && msg.symbol) {
      socket._subs.delete(String(msg.symbol).toUpperCase());
    } else if (msg?.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
  });

  socket.send(JSON.stringify({ type: "hello", ts: Date.now(), source: state.source, active: activeSource(), latency: state.latency, stats: state.stats }));
  socket.send(JSON.stringify({ type: "event-batch", events: evLog.slice(0, 60) }));
  socket.send(JSON.stringify({ type: "tick", stats: state.stats, latency: state.latency }));
  if (fng) socket.send(JSON.stringify({ type: "fng", fng }));
  if (rank) socket.send(JSON.stringify({ type: "rank", rank }));
});

const heartbeat = setInterval(() => {
  for (const c of wss.clients) {
    if (!c.isAlive) { try { c.terminate(); } catch {} continue; }
    c.isAlive = false;
    try { c.ping(); } catch {}
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

// ---------------------------------------------------------------- periodic tasks

async function topUpLoop() {
  while (true) {
    for (const s of SYMBOLS) {
      try {
        await topUp(s.id, "1m");
        await topUp(s.id, "5m");
        await topUp(s.id, "1h");
        await topUp(s.id, "1d");
      } catch {}
      await sleep(80);
    }
    // sync newly closed 1m bars to connected charts
    broadcast({ type: "stats", stats: state.stats });
    await sleep(60_000);
  }
}

async function depthLoop() {
  while (true) {
    try {
      const d = await fetchDepth(focus);
      analysis.depth[focus] = d;
      sendSubscribed(focus, { type: "depth", symbol: focus, ...d });
      broadcastDepthOnly(focus, d);
    } catch {}
    await sleep(3500);
  }
}

let lastDepthBcast = 0;
function broadcastDepthOnly(sym, d) {
  const now = Date.now();
  if (now - lastDepthBcast < 1000) return;
  lastDepthBcast = now;
  // imbalance + timestamp only; the full book goes to subscribers of this symbol
  broadcast({ type: "depth-lite", symbol: sym, imbalance: d.imbalance, ts: d.ts });
}

// ---------------------------------------------------------------- forecast hooks → events/broadcast

let prevBest = {};

function wireAnalysisHooks() {
  return {
    log,
    onForecast: (sym, fc) => {
      const brief = forecastBrief(sym);
      broadcast({ type: "forecast", symbol: sym, forecast: brief });
      if (fc?.best && prevBest[sym] !== fc.best.label) {
        prevBest[sym] = fc.best.label;
        pushEvent({
          kind: "ai",
          sym,
          text: `найден новый аналог — ${fc.best.label} (${Math.round(fc.best.sim * 100)}%)`,
          t: Date.now(),
        });
      }
      if (fc) log(`forecast ${sym}: UP ${(fc.probUp * 100).toFixed(0)}% / DOWN ${(fc.probDown * 100).toFixed(0)}% / FLAT ${(fc.probFlat * 100).toFixed(0)}% · горизонт ${fc.horizonDays} дн. · аналогов ${fc.summary.count}`);
    },
    onBacktest: (sym, bt) => {
      broadcast({ type: "backtest", symbol: sym, backtest: backtestBrief(sym) });
      if (bt.computed) log(`backtest ${sym}: точность ${(bt.hitRateAll * 100).toFixed(1)}% (${bt.n} сигналов, ${bt.ms} мс)`);
    },
    onReady: () => {
      pushEvent({ kind: "sys", text: "бэктест готов для всех монет", t: Date.now() });
    },
  };
}

// ---------------------------------------------------------------- boot

async function main() {
  log(`AI Trading Petrunko → http://localhost:${PORT} (порт ${PORT})`);
  log("источники: Binance REST/WS + Bybit v5 (публичные, без ключей)");

  // live feeds start immediately — the price moves while history loads
  // (startFeeds already invoked at module top with hooks above)

  refreshFng();
  refreshRank();
  setInterval(refreshFng, 10 * 60_000);
  setInterval(refreshRank, 30 * 60_000);
  setAux({ fng: fng?.value ?? null });
  startAccumulator(log);

  log("загрузка истории…");
  try {
    await ensureHistory(log);
  } catch (e) {
    log(`history error: ${e.message}`);
  }

  // background deep crawl (does not block readiness)
  deepHistoryLoop(log, (sym) => {
    markDirty(sym);
    lastBacktestStale = true;
  }).catch((e) => log(`deep history error: ${e.message}`));

  // analysis workers: forecast ≈ every 60s, backtest when ready
  startAnalysis(wireAnalysisHooks());

  topUpLoop();
  depthLoop();

  httpServer.listen(PORT, () => log(`listening on :${PORT} · ws /ws`));
}

let lastBacktestStale = false;
void lastBacktestStale;

main().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});
