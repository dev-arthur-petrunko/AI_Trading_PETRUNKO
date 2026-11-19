// History backfill: exchanges first (cycle REST, rate-limited), CoinGecko as deep fallback.
import { SYMBOLS, klines, CG_IDS } from "./exchange.mjs";
import { insertCandles, candleBounds, meta, insertCgDaily, readCgDaily, readCandles, deepDaily } from "./store.mjs";

export { deepDaily };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Crawl exchange klines backward until exchange listing, `target` bars or `maxBatches`.
 * Returns total bars now stored for (symbol, tf).
 */
async function backfill(symbolId, tf, target, maxBatches) {
  let { lo, n } = candleBounds(symbolId, tf);
  if (n >= target) return n;
  let end = lo > 0 ? lo - 1 : undefined;
  let bars = n;
  let batches = 0;
  let prevOldest = Infinity;
  while (bars < target && batches < maxBatches) {
    let rows = [];
    try {
      const res = await klines(symbolId, tf, undefined, end);
      rows = res.rows;
    } catch (e) {
      console.warn(`[history] ${symbolId} ${tf}: ${e.message}`);
      break;
    }
    if (!rows.length) break;
    insertCandles(symbolId, tf, rows);
    bars += rows.length;
    batches++;
    const oldest = rows[0].t;
    if (oldest >= prevOldest) break; // no progress → reached listing
    prevOldest = oldest;
    end = oldest - 1;
    await sleep(300); // respect rate limits
  }
  return bars;
}

/** Deep daily history from CoinGecko (free, no key) when exchange history is short. */
async function backfillCoingecko(symbolId, cgId) {
  if (readCgDaily(symbolId).length > 400) return;
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=max`;
    const r = await fetch(url, { headers: { "User-Agent": "ai-trading-petrunko/1.0" } });
    if (!r.ok) throw new Error(`CG HTTP ${r.status}`);
    const j = await r.json();
    const rows = j.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: 0 }));
    insertCgDaily(symbolId, rows);
    console.log(`[history] ${symbolId}: CoinGecko daily +${rows.length}`);
  } catch (e) {
    console.warn(`[history] ${symbolId} coingecko: ${e.message}`);
  }
}

/**
 * Quick pass at boot: enough history for the dashboard and a first analysis
 * (~4000 hourly bars ≈ 166 days), 5m/1m for the chart, 1d for the 1d tab.
 */
export async function ensureHistory(log = console.log) {
  const started = Date.now();
  const report = {};
  for (const s of SYMBOLS) {
    const h1 = await backfill(s.id, "1h", 4000, 8);
    const m5 = await backfill(s.id, "5m", 1000, 1);
    const m1 = await backfill(s.id, "1m", 600, 1);
    const d1 = await backfill(s.id, "1d", 3000, 4);
    report[s.id] = { h1, m5, m1, d1 };
    log(`[history] ${s.id}: 1h ${h1} · 5m ${m5} · 1m ${m1} · 1d ${d1}`);
  }
  for (const s of SYMBOLS) {
    if ((report[s.id]?.h1 ?? 0) < 8760) await backfillCoingecko(s.id, s.cg);
    await sleep(1300); // CoinGecko free tier is strict
  }
  meta.set("historyInit", String(Date.now()));
  log(`[history] quick pass done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return report;
}

/**
 * Long background crawl toward the exchange listing (up to ~100k hourly bars),
 * one small batch at a time; `onBatch` lets the caller re-run analysis as the
 * history deepens. Never blocks the boot.
 */
export async function deepHistoryLoop(log = console.log, onBatch = () => {}) {
  const TARGET = 90000;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const s of SYMBOLS) {
      const { n } = candleBounds(s.id, "1h");
      if (n >= TARGET) continue;
      const before = n;
      const after = await backfill(s.id, "1h", Math.min(TARGET, n + 3000), 3);
      if (after > before) {
        progressed = true;
        log(`[history] ${s.id} 1h deep: ${before} → ${after}`);
        onBatch(s.id, after);
      }
      await sleep(400);
    }
    await sleep(5000);
  }
  log("[history] deep crawl complete (упёрлись в листинг биржи)");
}

/** Incremental top-up of the newest candles for a timeframe. */
export async function topUp(symbolId, tf = "1h") {
  try {
    const { hi } = candleBounds(symbolId, tf);
    const res = await klines(symbolId, tf, hi > 0 ? hi : undefined, undefined);
    if (res.rows.length) insertCandles(symbolId, tf, res.rows);
    return res.rows.length;
  } catch {
    return 0;
  }
}

export { readCandles };
