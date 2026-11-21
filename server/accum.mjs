// server/accum.mjs — Часовой накопитель данных для AI (ТЗ: «каждые 1 час анализ, собирает всё
// в базу данных; когда наберётся за день — оценивает за месяц и т.д.»).
//
// Уровни агрегации:
//   hourly  → ai_snapshots     (сырые снапшоты: прогноз+метрики+бэктест на конец часа, 24/сутки)
//   daily   → ai_rollup_daily  (суточные сводки: средние за день, 1/сутки)
//   monthly → ai_rollup_monthly(месячные сводки: из суточных, 1/месяц)
// Подробная карта файлов и полей: docs/AI_DATA.md.
import { analysis, forecastBrief, backtestBrief } from "./analysis.mjs";
import { selectSeries, db, meta } from "./store.mjs";
import { IDS, state } from "./exchange.mjs";
import { rsi, realizedVol } from "../lib/analyze.mjs";

const HOUR = 3_600_000;

// ---------------------------------------------------------------- schema (idempotent)
db.exec(`
CREATE TABLE IF NOT EXISTS ai_snapshots(
  symbol TEXT NOT NULL, ts INTEGER NOT NULL,
  price REAL, probUp REAL, probDown REAL, probFlat REAL, confidence REAL,
  rsi REAL, volAnn REAL, fng INTEGER,
  imbalance REAL, funding REAL, oiChange REAL,
  horizonDays INTEGER, analogs INTEGER, bestLabel TEXT, bestSim REAL,
  hitRate REAL, baseline REAL,
  PRIMARY KEY(symbol, ts)
);
CREATE INDEX IF NOT EXISTS ix_ai_snap_ts ON ai_snapshots(ts);

CREATE TABLE IF NOT EXISTS ai_rollup_daily(
  symbol TEXT NOT NULL, day TEXT NOT NULL,
  n INTEGER, probUpAvg REAL, probDownAvg REAL, confAvg REAL,
  priceClose REAL, rsiAvg REAL, fngAvg REAL, imbalanceAvg REAL, fundingAvg REAL,
  hitRate REAL, baseline REAL,
  PRIMARY KEY(symbol, day)
);

CREATE TABLE IF NOT EXISTS ai_rollup_monthly(
  symbol TEXT NOT NULL, month TEXT NOT NULL,
  n INTEGER, days INTEGER,
  probUpAvg REAL, probDownAvg REAL, confAvg REAL,
  priceClose REAL, hitRate REAL, baseline REAL,
  PRIMARY KEY(symbol, month)
);
`);

// ---------------------------------------------------------------- hourly snapshot

/** Снять часовой снапшот по ОДНОЙ монете (upsert по границе часа, UTC). */
export function snapshotOne(sym) {
  const f = analysis.forecasts[sym];
  if (!f) return false;
  const ts = Math.floor(Date.now() / HOUR) * HOUR;
  const st = state.stats[sym] || {};
  const sel = selectSeries(sym);
  const closes = sel ? sel.candles.map((c) => c.c) : [];
  const bt = backtestBrief(sym);
  const micro = analysis.micro[sym] || {};
  const depth = analysis.depth[sym];
  const best = f.best;

  db.prepare(`
    INSERT INTO ai_snapshots(symbol, ts, price, probUp, probDown, probFlat, confidence,
      rsi, volAnn, fng, imbalance, funding, oiChange,
      horizonDays, analogs, bestLabel, bestSim, hitRate, baseline)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol, ts) DO UPDATE SET
      price=excluded.price, probUp=excluded.probUp, probDown=excluded.probDown,
      probFlat=excluded.probFlat, confidence=excluded.confidence,
      rsi=excluded.rsi, volAnn=excluded.volAnn, fng=excluded.fng,
      imbalance=excluded.imbalance, funding=excluded.funding, oiChange=excluded.oiChange,
      horizonDays=excluded.horizonDays, analogs=excluded.analogs,
      bestLabel=excluded.bestLabel, bestSim=excluded.bestSim,
      hitRate=excluded.hitRate, baseline=excluded.baseline
  `).run(
    sym, ts,
    st.price ?? null, f.probUp, f.probDown, f.probFlat, f.confidence,
    closes.length > 15 ? rsi(closes) : null,
    closes.length > 16 ? realizedVol(closes, 168, 24) : null,
    aux.fng === undefined || aux.fng === null ? null : aux.fng,
    depth ? depth.imbalance : null,
    micro.funding ?? null, micro.oiChange ?? null,
    f.horizonDays, f.count, best ? best.label : null, best ? best.sim : null,
    bt && bt.computed ? bt.hitRate : null, bt && bt.computed ? bt.baselineUp : null,
  );
  return true;
}

/** Снять снапшоты по всем монетам. */
export function snapshotAll() {
  let n = 0;
  for (const sym of IDS) if (snapshotOne(sym)) n++;
  meta.set("ai_last_snapshot", String(Date.now()));
  return n;
}

/** Внешние справочные данные (FNG) — их отдаёт index.mjs, чтобы не крутить цикл. */
export const aux = { fng: null };
export function setAux(patch) {
  if (patch && "fng" in patch) aux.fng = patch.fng;
}

// ---------------------------------------------------------------- rollups

const dayOf = (ts) => `strftime('%Y-%m-%d', ${ts} / 1000, 'unixepoch')`;
const monthOf = (ts) => `strftime('%Y-%m', ${ts} / 1000, 'unixepoch')`;

/** Суточные сводки из часовых (пересчитываем сегодняшний день + вчерашний на всякий случай). */
export function rollupDaily(symbol) {
  const sql = `
    INSERT INTO ai_rollup_daily(symbol, day, n, probUpAvg, probDownAvg, confAvg,
      priceClose, rsiAvg, fngAvg, imbalanceAvg, fundingAvg, hitRate, baseline)
    SELECT symbol, ${dayOf("ts")}, COUNT(*),
      AVG(probUp), AVG(probDown), AVG(confidence),
      NULL, AVG(rsi), AVG(fng), AVG(imbalance), AVG(funding), AVG(hitRate), AVG(baseline)
    FROM ai_snapshots WHERE symbol = ? GROUP BY day
    ON CONFLICT(symbol, day) DO UPDATE SET
      n=excluded.n, probUpAvg=excluded.probUpAvg, probDownAvg=excluded.probDownAvg,
      confAvg=excluded.confAvg, rsiAvg=excluded.rsiAvg, fngAvg=excluded.fngAvg,
      imbalanceAvg=excluded.imbalanceAvg, fundingAvg=excluded.fundingAvg,
      hitRate=excluded.hitRate, baseline=excluded.baseline`;
  db.prepare(sql).run(symbol);
  // close дня = последний часовой price дня
  const closes = db.prepare(`
    SELECT day, (SELECT price FROM ai_snapshots s
      WHERE s.symbol = a.symbol AND ${dayOf("s.ts")} = a.day
      ORDER BY ts DESC LIMIT 1) AS priceClose
    FROM (SELECT DISTINCT ${dayOf("ts")} AS day, symbol FROM ai_snapshots
          WHERE symbol = ?) a
  `).all(symbol);
  const upd = db.prepare(`UPDATE ai_rollup_daily SET priceClose = ? WHERE symbol = ? AND day = ?`);
  for (const r of closes) if (r.priceClose !== null && r.priceClose !== undefined) upd.run(r.priceClose, symbol, r.day);
}

/** Месячные сводки из суточных. */
export function rollupMonthly(symbol) {
  const sql = `
    INSERT INTO ai_rollup_monthly(symbol, month, n, days, probUpAvg, probDownAvg, confAvg,
      priceClose, hitRate, baseline)
    SELECT symbol, substr(day, 1, 7), SUM(n), COUNT(*),
      AVG(probUpAvg), AVG(probDownAvg), AVG(confAvg),
      NULL, AVG(hitRate), AVG(baseline)
    FROM ai_rollup_daily WHERE symbol = ? GROUP BY month
    ON CONFLICT(symbol, month) DO UPDATE SET
      n=excluded.n, days=excluded.days, probUpAvg=excluded.probUpAvg,
      probDownAvg=excluded.probDownAvg, confAvg=excluded.confAvg,
      hitRate=excluded.hitRate, baseline=excluded.baseline`;
  db.prepare(sql).run(symbol);
  const closes = db.prepare(`
    SELECT month, (SELECT priceClose FROM ai_rollup_daily d
      WHERE d.symbol = a.symbol AND substr(d.day,1,7) = a.month
      ORDER BY day DESC LIMIT 1) AS priceClose
    FROM (SELECT DISTINCT substr(day,1,7) AS month, symbol FROM ai_rollup_daily
          WHERE symbol = ?) a
  `).all(symbol);
  const upd = db.prepare(`UPDATE ai_rollup_monthly SET priceClose = ? WHERE symbol = ? AND month = ?`);
  for (const r of closes) if (r.priceClose !== null && r.priceClose !== undefined) upd.run(r.priceClose, symbol, r.month);
}

export function rollupAll() {
  for (const sym of IDS) {
    rollupDaily(sym);
    rollupMonthly(sym);
  }
}

// ---------------------------------------------------------------- API payloads

/** Состояние накопления (для окна AI и прогресса). */
export function aiState() {
  const one = (sql, ...args) => {
    try { return db.prepare(sql).get(...args) || {}; } catch { return {}; }
  };
  const h = one(`SELECT COUNT(*) n, MIN(ts) first, MAX(ts) last FROM ai_snapshots`);
  const d = one(`SELECT COUNT(*) n, MIN(day) first, MAX(day) last FROM ai_rollup_daily`);
  const m = one(`SELECT COUNT(*) n, MIN(month) first, MAX(month) last FROM ai_rollup_monthly`);
  const perSymbol = {};
  for (const sym of IDS) {
    const r = one(`SELECT COUNT(*) n, MAX(ts) last FROM ai_snapshots WHERE symbol = ?`, sym);
    perSymbol[sym] = { n: Number(r.n || 0), last: r.last ? Number(r.last) : 0 };
  }
  // полные сутки = дни, где накоплено ≥ 20 часовых снапшотов
  const fullDays = one(`SELECT COUNT(*) n FROM (SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS day, COUNT(*) c FROM ai_snapshots GROUP BY day HAVING c >= 20)`);
  return {
    hourly: { count: Number(h.n || 0), first: h.first ? Number(h.first) : 0, last: h.last ? Number(h.last) : 0 },
    daily: { count: Number(d.n || 0), first: d.first || null, last: d.last || null },
    monthly: { count: Number(m.n || 0), first: m.first || null, last: m.last || null },
    fullDays: Number(fullDays.n || 0),
    nextHourAt: (() => {
      const last = Number(h.last || 0);
      if (!last) return Date.now() + HOUR;
      return last + HOUR;
    })(),
    perSymbol,
    lastSnapshotAt: Number(meta.get("ai_last_snapshot") || 0),
  };
}

/** Ряды для окна AI: level = hourly | daily | monthly. */
export function aiSeries(symbol, level = "hourly", limit = 48) {
  const n = Math.max(1, Math.min(1000, Number(limit) || 48));
  if (level === "monthly") {
    return db.prepare(`SELECT * FROM ai_rollup_monthly WHERE symbol = ? ORDER BY month DESC LIMIT ?`).all(symbol, n).reverse();
  }
  if (level === "daily") {
    return db.prepare(`SELECT * FROM ai_rollup_daily WHERE symbol = ? ORDER BY day DESC LIMIT ?`).all(symbol, n).reverse();
  }
  return db.prepare(`SELECT * FROM ai_snapshots WHERE symbol = ? ORDER BY ts DESC LIMIT ?`).all(symbol, n).reverse();
}

// ---------------------------------------------------------------- timers

let timer = null;

/** Разовый «догоняющий» снапшот + rollup (вызывается при старте и по часам). */
export function tickOnce() {
  try {
    const n = snapshotAll();
    rollupAll();
    return n;
  } catch (e) {
    console.warn("[accum]", e.message);
    return 0;
  }
}

/** Запуск часового цикла (плюс быстрый первый тик при старте, если прошёл час). */
export function startAccumulator(log = console.log) {
  if (timer) return;
  const first = tickOnce();
  log(`[accum] часовой накопитель запущен, снапшот: ${first} монет`);
  timer = setInterval(() => {
    const n = tickOnce();
    if (n) log(`[accum] часовой снапшот: ${n} монет, строк в базе: ${aiState().hourly.count}`);
  }, HOUR);
  // не даём таймеру блокировать выход процесса
  if (typeof timer.unref === "function") timer.unref();
}

export function stopAccumulator() {
  if (timer) clearInterval(timer);
  timer = null;
}
