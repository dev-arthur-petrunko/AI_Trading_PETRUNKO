// Binance / Bybit market access: REST + multiplexed WebSocket with health tracking and failover.
import WebSocket from "ws";

export const SYMBOLS = [
  { id: "BTC", binance: "BTCUSDT", bybit: "BTCUSDT", cg: "bitcoin" },
  { id: "ETH", binance: "ETHUSDT", bybit: "ETHUSDT", cg: "ethereum" },
  { id: "SOL", binance: "SOLUSDT", bybit: "SOLUSDT", cg: "solana" },
  { id: "BNB", binance: "BNBUSDT", bybit: "BNBUSDT", cg: "binancecoin" },
  { id: "XRP", binance: "XRPUSDT", bybit: "XRPUSDT", cg: "ripple" },
  { id: "DOGE", binance: "DOGEUSDT", bybit: "DOGEUSDT", cg: "dogecoin" },
  { id: "ADA", binance: "ADAUSDT", bybit: "ADAUSDT", cg: "cardano" },
  { id: "AVAX", binance: "AVAXUSDT", bybit: "AVAXUSDT", cg: "avalanche-2" },
];
export const IDS = SYMBOLS.map((s) => s.id);
export const CG_IDS = SYMBOLS.map((s) => s.cg).join(",");

export const TF = {
  "1m": { bnc: "1m", bb: "1" },
  "5m": { bnc: "5m", bb: "5" },
  "1h": { bnc: "1h", bb: "60" },
  "1d": { bnc: "1d", bb: "D" },
};

const BNC_REST = ["https://api.binance.com", "https://data-api.binance.vision"];
const BB_REST = "https://api.bybit.com";

export const state = {
  source: "auto", // auto | binance | bybit
  alive: { binance: false, bybit: false },
  latency: { binance: 0, bybit: 0 },
  lastMsg: { binance: 0, bybit: 0 },
  wsUp: { binance: false, bybit: false },
  stats: {}, // { BTC: { price, chg, high, low, vol, src, ts } }
};

export function activeSource() {
  if (state.source === "binance") return "binance";
  if (state.source === "bybit") return "bybit";
  if (state.alive.binance || state.wsUp.binance) return "binance";
  if (state.alive.bybit || state.wsUp.bybit) return "bybit";
  return "binance";
}

export function setSource(s) {
  if (["auto", "binance", "bybit"].includes(s)) state.source = s;
  return state.source;
}

// ---------------------------------------------------------------- REST plumbing

async function jget(url, ms = 9000) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "ai-trading-petrunko/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(tm);
  }
}

function mapKlines(arr) {
  // both shapes: [t, o, h, l, c, v, ...]
  const out = arr.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function bncKlines(pair, interval, start, end, limit = 1000) {
  let lastErr;
  for (const host of BNC_REST) {
    try {
      let url = `${host}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
      if (start) url += `&startTime=${start}`;
      if (end) url += `&endTime=${end}`;
      const t0 = Date.now();
      const arr = await jget(url);
      state.latency.binance = Date.now() - t0;
      state.alive.binance = true;
      return mapKlines(arr);
    } catch (e) {
      lastErr = e;
    }
  }
  state.alive.binance = false;
  throw lastErr ?? new Error("binance down");
}

async function bbKlines(pair, interval, start, end, limit = 1000) {
  let url = `${BB_REST}/v5/market/kline?category=spot&symbol=${pair}&interval=${interval}&limit=${limit}`;
  if (start) url += `&start=${start}`;
  if (end) url += `&end=${end}`;
  const t0 = Date.now();
  const j = await jget(url);
  state.latency.bybit = Date.now() - t0;
  state.alive.bybit = true;
  if (j.retCode !== 0 || !j.result?.list) throw new Error(j.retMsg || "bybit kline");
  return mapKlines(j.result.list.slice().reverse());
}

/** Fetch candles for tf from a source, with automatic failover (auto = prefer alive binance). */
export async function klines(id, tf, start, end) {
  const s = SYMBOLS.find((x) => x.id === id);
  if (!s) throw new Error("unknown symbol");
  const order = state.source === "bybit" ? ["bybit", "binance"]
    : state.source === "binance" ? ["binance", "bybit"]
    : ["binance", "bybit"];
  let lastErr;
  for (const src of order) {
    try {
      if (src === "binance") return { src, rows: await bncKlines(s.binance, TF[tf].bnc, start, end) };
      return { src, rows: await bbKlines(s.bybit, TF[tf].bb, start, end) };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("no data");
}

/** 24h stats for all symbols from both sources (raw), used by the ticker poller. */
export async function fetchStatsAll() {
  const out = {};
  const jobs = [];

  jobs.push(
    (async () => {
      const q = encodeURIComponent(`[${SYMBOLS.map((s) => `"${s.binance}"`).join(",")}]`);
      const j = await jget(`${BNC_REST[0]}/api/v3/ticker/24hr?symbols=${q}`);
      const m = {};
      for (const t of j) m[t.symbol] = t;
      for (const s of SYMBOLS) {
        const t = m[s.binance];
        if (t) out[s.id] = { ...(out[s.id] || {}), price: +t.lastPrice, chg: +t.priceChangePercent, high: +t.highPrice, low: +t.lowPrice, vol: +t.quoteVolume, src: "binance" };
      }
      state.alive.binance = true;
    })().catch(() => { state.alive.binance = false; }),
  );

  jobs.push(
    (async () => {
      const j = await jget(`${BB_REST}/v5/market/tickers?category=spot`);
      if (j.retCode !== 0) throw new Error(j.retMsg);
      const m = {};
      for (const t of j.result.list) m[t.symbol] = t;
      for (const s of SYMBOLS) {
        const t = m[s.bybit];
        if (t) out[s.id] = { ...(out[s.id] || {}), ...(out[s.id]?.src === "binance" ? { altPrice: +t.lastPrice } : { price: +t.lastPrice, chg: +t.price24hPcnt * 100, high: +t.highPrice24h, low: +t.lowPrice24h, vol: +t.turnover24h, src: "bybit" }) };
      }
      state.alive.bybit = true;
    })().catch(() => { state.alive.bybit = false; }),
  );

  await Promise.all(jobs);
  for (const [k, v] of Object.entries(out)) state.stats[k] = v;
  return state.stats;
}

/** Order book top levels; imbalance = (bidVol - askVol) / (bidVol + askVol) on top 20 levels. */
export async function fetchDepth(id) {
  const s = SYMBOLS.find((x) => x.id === id);
  const norm = (bidsRaw, asksRaw) => {
    const bids = bidsRaw.slice(0, 20).map(([p, q]) => [+p, +q]);
    const asks = asksRaw.slice(0, 20).map(([p, q]) => [+p, +q]);
    const bv = bids.reduce((a, [, q], i) => a + q * bids[i][0], 0);
    const av = asks.reduce((a, [, q], i) => a + q * asks[i][0], 0);
    return { bids, asks, imbalance: bv + av ? (bv - av) / (bv + av) : 0 };
  };
  try {
    const j = await jget(`${BNC_REST[0]}/api/v3/depth?symbol=${s.binance}&limit=20`);
    return { src: "binance", ts: Date.now(), ...norm(j.bids, j.asks) };
  } catch {
    const j = await jget(`${BB_REST}/v5/market/orderbook?category=spot&symbol=${s.bybit}&limit=50`);
    if (j.retCode !== 0) throw new Error(j.retMsg);
    return { src: "bybit", ts: Date.now(), ...norm(j.result.b, j.result.a) };
  }
}

/** Perp funding rate + open interest change (Bybit linear perp, public). */
export async function fetchMicro(id) {
  const s = SYMBOLS.find((x) => x.id === id);
  const out = {};
  try {
    const j = await jget(`${BB_REST}/v5/market/funding/history?category=linear&symbol=${s.bybit}&limit=1`);
    if (j.retCode === 0 && j.result?.list?.[0]) out.funding = +j.result.list[0].fundingRate;
  } catch {}
  try {
    const j = await jget(`${BB_REST}/v5/market/open-interest?category=linear&symbol=${s.bybit}&interval=1h&limit=26`);
    if (j.retCode === 0 && j.result?.list?.length > 6) {
      const l = j.result.list.slice().reverse(); // ascending by time
      const last = +l[l.length - 1].openInterest;
      const ref = +l[l.length - 25].openInterest;
      if (ref > 0) out.oiChange = (last - ref) / ref;
      out.oi = last;
    }
  } catch {}
  return out;
}

export async function ping(source) {
  try {
    const t0 = Date.now();
    if (source === "binance") await jget(`${BNC_REST[0]}/api/v3/ping`, 5000);
    else await jget(`${BB_REST}/v5/market/time`, 5000);
    state.latency[source] = Date.now() - t0;
    state.alive[source] = true;
    return true;
  } catch {
    state.alive[source] = false;
    return false;
  }
}

// ---------------------------------------------------------------- WebSocket feeds

let cb = {};
let bncHost = 0;
let bncFail = 0;
let timers = [];
let stopped = false;

function makeWs(url, onOpen, onMsg, onFail) {
  const ws = new WebSocket(url);
  ws.on("open", () => onOpen(ws));
  ws.on("message", (d) => {
    try { onMsg(ws, JSON.parse(d.toString())); } catch {}
  });
  ws.on("error", () => {});
  ws.on("close", () => onFail());
  return ws;
}

let bncWs = null;
let bbWs = null;

function connectBinance() {
  if (stopped) return;
  const streams = [];
  for (const s of SYMBOLS) {
    const l = s.binance.toLowerCase();
    streams.push(`${l}@kline_1m`, `${l}@trade`, `${l}@depth20`);
  }
  const host = bncHost === 0 ? "wss://stream.binance.com:9443" : "wss://data-stream.binance.vision";
  bncWs = makeWs(
    `${host}/stream?streams=${streams.join("/")}`,
    (ws) => {
      state.wsUp.binance = true;
      state.alive.binance = true;
      bncFail = 0;
      cb.onWs && cb.onWs("binance", true);
      void ws;
    },
    (_ws, msg) => {
      state.lastMsg.binance = Date.now();
      handleBinance(msg);
    },
    () => {
      state.wsUp.binance = false;
      cb.onWs && cb.onWs("binance", false);
      bncFail++;
      if (bncFail >= 2) { bncHost = bncHost === 0 ? 1 : 0; bncFail = 0; }
      setTimeout(connectBinance, 1500 + Math.random() * 2500);
    },
  );
}

function handleBinance(msg) {
  const { stream, data } = msg || {};
  if (!stream || !data) return;
  const [pair, kind] = stream.split("@");
  const id = SYMBOLS.find((s) => s.binance.toLowerCase() === pair)?.id;
  if (!id) return;
  if (kind === "trade") {
    cb.onTrade?.(id, { t: +data.T, p: +data.p, q: +data.q, side: data.m ? "sell" : "buy", src: "binance" });
  } else if (kind.startsWith("kline_")) {
    const k = data.k;
    cb.onM1?.(id, { t: +k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, closed: !!k.x }, "binance");
  } else if (kind.startsWith("depth")) {
    cb.onDepth?.(id, data.bids.map((r) => [+r[0], +r[1]]), data.asks.map((r) => [+r[0], +r[1]]), Date.now(), "binance");
  }
}

function connectBybit() {
  if (stopped) return;
  const args = [];
  for (const s of SYMBOLS) {
    args.push(`kline.1.${s.bybit}`, `publicTrade.${s.bybit}`, `orderbook.50.${s.bybit}`);
  }
  let ping = null;
  bbWs = makeWs(
    "wss://stream.bybit.com/v5/public/spot",
    (ws) => {
      state.wsUp.bybit = true;
      state.alive.bybit = true;
      ws.send(JSON.stringify({ op: "subscribe", args }));
      ping = setInterval(() => { try { ws.send(JSON.stringify({ op: "ping" })); } catch {} }, 20000);
      cb.onWs && cb.onWs("bybit", true);
    },
    (_ws, msg) => {
      state.lastMsg.bybit = Date.now();
      if (msg?.topic) handleBybit(msg);
    },
    () => {
      clearInterval(ping);
      state.wsUp.bybit = false;
      cb.onWs && cb.onWs("bybit", false);
      setTimeout(connectBybit, 1500 + Math.random() * 2500);
    },
  );
}

function handleBybit(msg) {
  const parts = msg.topic.split(".");
  const kind = parts[0];
  const pair = parts[parts.length - 1];
  const id = SYMBOLS.find((s) => s.bybit === pair)?.id;
  if (!id) return;
  if (kind === "publicTrade") {
    for (const d of msg.data || [])
      cb.onTrade?.(id, { t: +d.T, p: +d.p, q: +d.v, side: d.S === "Buy" ? "buy" : "sell", src: "bybit" });
  } else if (kind === "kline") {
    for (const d of msg.data || [])
      cb.onM1?.(id, { t: +d.start, o: +d.open, h: +d.high, l: +d.low, c: +d.close, v: +d.volume, closed: !!d.confirm }, "bybit");
  } else if (kind === "orderbook") {
    const d = msg.data;
    if (msg.type === "snapshot" || msg.type === "delta") {
      // bybit delta: qty "0" = remove. We keep simple full-replace via REST fallback if sparse.
      cb.onDepth?.(
        id,
        (d.b || []).map((r) => [+r[0], +r[1]]),
        (d.a || []).map((r) => [+r[0], +r[1]]),
        +msg.ts,
        "bybit",
      );
    }
  }
}

export function startFeeds(hooks) {
  cb = hooks || {};
  stopped = false;
  connectBinance();
  connectBybit();
  // health + 24h stats
  const health = async () => {
    const a = await ping("binance");
    const b = await ping("bybit");
    cb.onHealth?.({ ...state.alive, latency: state.latency });
    if (!a && !b) cb.onDegraded?.();
  };
  health();
  const stats = async () => { await fetchStatsAll(); cb.onStats?.(state.stats); };
  stats();
  timers.push(setInterval(health, 20000));
  timers.push(setInterval(stats, 15000));
}

export function stopFeeds() {
  stopped = true;
  timers.forEach(clearInterval);
  timers = [];
  try { bncWs?.close(); } catch {}
  try { bbWs?.close(); } catch {}
}

// ---------------------------------------------------------------- auxiliary free APIs

/** Fear & Greed index (alternative.me, free, no key). */
export async function fetchFng(limit = 60) {
  const j = await jget(`https://api.alternative.me/fng/?limit=${limit}&format=json`, 8000);
  const d = j?.data || [];
  if (!d.length) throw new Error("fng empty");
  return {
    value: +d[0].value,
    label: d[0].value_classification,
    updatedAt: +d[0].timestamp * 1000,
    history: d.slice().reverse().map((x) => ({ t: +x.timestamp * 1000, v: +x.value })),
  };
}

/** Rank of our universe by market cap (CoinGecko /coins/markets, free, no key) → pill order. */
export async function fetchMarketRank() {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${CG_IDS}` +
    `&order=market_cap_desc&per_page=${SYMBOLS.length}&page=1`;
  const j = await jget(url, 9000);
  const byCg = new Map(SYMBOLS.map((s) => [s.cg, s.id]));
  const out = [];
  for (const c of j) {
    const id = byCg.get(c.id);
    if (id) out.push({ id, mcap: c.market_cap, change: c.price_change_percentage_24h ?? 0 });
  }
  return out;
}
