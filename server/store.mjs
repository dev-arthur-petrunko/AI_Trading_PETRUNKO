// SQLite (node:sqlite, built into Node) candle store.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(here, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "market.db"));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS candles(
  symbol TEXT NOT NULL, tf TEXT NOT NULL, t INTEGER NOT NULL,
  o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL, v REAL NOT NULL,
  PRIMARY KEY(symbol, tf, t)
);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS cg_daily(
  symbol TEXT NOT NULL, t INTEGER NOT NULL,
  o REAL, h REAL, l REAL, c REAL, v REAL, PRIMARY KEY(symbol, t)
);
`);

const ins = db.prepare(`INSERT INTO candles(symbol,tf,t,o,h,l,c,v) VALUES(?,?,?,?,?,?,?,?)
ON CONFLICT(symbol,tf,t) DO UPDATE SET o=excluded.o,h=excluded.h,l=excluded.l,c=excluded.c,v=excluded.v`);

export function insertCandles(symbol, tf, rows) {
  if (!rows?.length) return 0;
  db.exec("BEGIN");
  try {
    for (const r of rows) ins.run(symbol, tf, r.t, r.o, r.h, r.l, r.c, r.v);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return rows.length;
}

export function readCandles(symbol, tf, limit = 250000) {
  const rows = db
    .prepare(`SELECT t,o,h,l,c,v FROM candles WHERE symbol=? AND tf=? ORDER BY t DESC LIMIT ?`)
    .all(symbol, tf, limit);
  return rows
    .map((r) => ({ t: Number(r.t), o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.v }))
    .reverse();
}

export function candleBounds(symbol, tf) {
  const row = db
    .prepare(`SELECT MIN(t) AS lo, MAX(t) AS hi, COUNT(*) AS n FROM candles WHERE symbol=? AND tf=?`)
    .get(symbol, tf);
  return { lo: row?.lo ? Number(row.lo) : 0, hi: row?.hi ? Number(row.hi) : 0, n: Number(row?.n || 0) };
}

export function countAll() {
  const row = db.prepare(`SELECT symbol, COUNT(*) AS n FROM candles GROUP BY symbol`).all();
  const out = {};
  for (const r of row) out[r.symbol] = Number(r.n);
  return out;
}

// meta
const mGet = db.prepare(`SELECT value FROM meta WHERE key=?`);
const mSet = db.prepare(`INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
export const meta = {
  get: (k) => mGet.get(k)?.value ?? null,
  set: (k, v) => mSet.run(k, String(v)),
};

// CoinGecko daily fallback (deep history when exchanges have too little data)
const insCg = db.prepare(
  `INSERT INTO cg_daily(symbol,t,o,h,l,c,v) VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,t) DO NOTHING`,
);
export function insertCgDaily(symbol, rows) {
  if (!rows?.length) return;
  db.exec("BEGIN");
  try {
    for (const r of rows) insCg.run(symbol, r.t, r.o, r.h, r.l, r.c, r.v);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function readCgDaily(symbol) {
  const rows = db.prepare(`SELECT t,o,h,l,c,v FROM cg_daily WHERE symbol=? ORDER BY t`).all(symbol);
  return rows.map((r) => ({ t: Number(r.t), o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.v }));
}

/** Deep daily series: CoinGecko (long span) merged with exchange daily (fresh close). */
export function deepDaily(symbol) {
  const exch = readCandles(symbol, "1d", 100000);
  const cg = readCgDaily(symbol);
  if (cg.length > exch.length) {
    const map = new Map(cg.map((c) => [c.t, c]));
    for (const c of exch) {
      const prev = map.get(c.t);
      map.set(c.t, prev ? { ...prev, ...c, v: prev.v || c.v } : c);
    }
    return [...map.values()].sort((a, b) => a.t - b.t);
  }
  return exch;
}

/**
 * Series powering the analysis: hourly when deep enough, otherwise the deep
 * daily series (exchange + CoinGecko). Shared by the API and the worker.
 */
export function selectSeries(sym) {
  const h1 = readCandles(sym, "1h", 80000);
  // 336 hourly bars ≈ 14 days: validation sweep picked it as the most informative window
  if (h1.length >= 1500) return { candles: h1, windowLen: 336, bpd: 24, tf: "1h" };
  const d = deepDaily(sym);
  if (d.length >= 90) return { candles: d, windowLen: 60, bpd: 1, tf: "1d" };
  return null;
}
