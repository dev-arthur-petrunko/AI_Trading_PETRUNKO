"use client";

import { useEffect, useMemo, useState } from "react";
import { Style } from "@/components/Style";
import { useStore, apiGet } from "@/lib/store";
import { Panel } from "@/components/Panel";
import { COLORS, fmtPct, fmtDate, fmtNum } from "@/lib/format";
import type { BacktestBrief } from "@/lib/types";

type Full = BacktestBrief & {
  series?: { t: number; price: number; predicted: number; conf: number; actual: number; hit: boolean }[];
  equity?: { strategy: number; hold: number };
  calibration?: { lo: number; hi: number; predicted: number; realized: number; n: number }[];
  windowLen?: number;
  minConfidence?: number;
};

/** Помесячная агрегация из series (hitRate по месяцам + n сигналов). */
type MonthRow = { key: string; label: string; hit: number; n: number };

function byMonth(series: { t: number; hit: boolean }[]): MonthRow[] {
  const buckets = new Map<string, { hit: number; n: number; t: number }>();
  for (const s of series) {
    const d = new Date(s.t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(key) ?? { hit: 0, n: 0, t: s.t };
    b.hit += s.hit ? 1 : 0;
    b.n += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, b]) => ({
      key,
      label: key.slice(5) === "01" ? key : key.slice(5), // "01"…"12"
      hit: b.n ? b.hit / b.n : 0,
      n: b.n,
    }));
}

/**
 * БЭКТЕС (task 5 — информативнее):
 *  1. KPI с пояснением, что каждое число значит;
 *  2. ПОМЕСЯЧНАЯ точность — где модель работала, а где нет;
 *  3. СРАВНЕНИЕ ВСЕХ 8 МОНЕТ — таблица hit/base/edge;
 *  4. Калибровка + доверительные интервалы + кривые (было).
 */
export function BacktestView() {
  const { symbol, swapKey, t } = useStore();
  const [b, setB] = useState<Full | null>(null);
  const [table, setTable] = useState<Record<string, BacktestBrief> | null>(null);

  useEffect(() => {
    let dead = false;
    const load = () =>
      apiGet<Full>("/api/backtest", { symbol, full: 1 })
        .then((r) => !dead && setB(r))
        .catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => {
      dead = true;
      clearInterval(iv);
    };
  }, [symbol, swapKey]);

  // сравнение по всем монетам (brief, без тяжёлого series)
  useEffect(() => {
    let dead = false;
    const coins = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"];
    Promise.all(
      coins.map((c) =>
        apiGet<BacktestBrief>("/api/backtest", { symbol: c })
          .then((r) => [c, r] as const)
          .catch(() => null),
      ),
    ).then((rows) => {
      if (dead) return;
      const map: Record<string, BacktestBrief> = {};
      for (const r of rows) if (r && r[1]?.computed) map[r[0]] = r[1];
      setTable(map);
    });
    return () => {
      dead = true;
    };
  }, [swapKey]);

  const hit = b?.computed ? b.hitRateAll : 0;
  const base = b?.computed ? b.baselineUp : 0;
  const beaten = b?.computed ? hit > base : false;
  const edge = (hit - base) * 100;

  const months = useMemo(() => byMonth(b?.series ?? []), [b?.series]);

  const rows = useMemo(() => {
    if (!table) return [];
    return Object.entries(table)
      .map(([id, v]) => ({
        id,
        hit: v.hitRateAll,
        base: v.baselineUp,
        edge: v.hitRateAll - v.baselineUp,
        n: v.n,
        taken: v.taken,
        cov: v.coverage,
        hitT: v.hitRateTaken,
      }))
      .sort((a, z) => z.edge - a.edge);
  }, [table]);

  return (
    <div className="bt">
      <Panel title={t("bt.title", symbol)} icon="◷" delay={80} className="bt-main">
        {!b?.computed ? (
          <div className="wait mono dim">{b?.note ?? t("bt.wait")}</div>
        ) : (
          <div className="wrap">
            {/* ---- KPI с пояснениями ---- */}
            <div className="kpis">
              <Kpi
                label={t("bt.kpi1")}
                value={`${fmtNum(hit * 100, 1)}%`}
                tone={beaten ? "bull" : "bear"}
                sub={`${b.n} ${t("bt.kpi1s")} · ${b.from ? fmtDate(b.from) : ""} → ${b.to ? fmtDate(b.to) : ""}`}
                why={
                  beaten
                    ? `${t("bt.vsBase")} ${edge >= 0 ? "+" : ""}${fmtNum(edge, 1)} п.п.`
                    : `${t("bt.vsBase")} ${fmtNum(edge, 1)} п.п.`
                }
              />
              <Kpi
                label={t("bt.kpi2")}
                value={`${fmtNum(base * 100, 1)}%`}
                tone="dim"
                sub={t("bt.kpi2s")}
                why={t("bt.explainBase")}
              />
              <Kpi
                label={t("bt.kpi3")}
                value={b.taken ? `${fmtNum(b.hitRateTaken * 100, 1)}%` : "—"}
                tone="cy"
                sub={`${t("bt.kpi3s")} ${fmtNum(b.coverage * 100, 0)}% (${b.taken})`}
                why={t("bt.explainConf")}
              />
              <Kpi
                label={t("bt.kpi4")}
                value={`${b.horizonDays} дн`}
                tone="amber"
                sub={`${b.tf} · окно ${b.windowLen ?? "—"} · порог ${(b.minConfidence ?? 0.15) * 100}%`}
                why={t("bt.explainHorizon")}
              />
            </div>

            {/* ---- ПОМЕСЯЧНАЯ ТОЧНОСТЬ ---- */}
            {months.length > 1 && (
              <section className="mbox">
                <h4 className="mono">{t("bt.months")}</h4>
                <div className="mrow-grid">
                  {months.map((m) => {
                    const good = m.hit >= base;
                    return (
                      <div className="mcell" key={m.key} title={`${m.key} · n=${m.n}`}>
                        <div className="mbar-track">
                          <div
                            className={`mbar ${good ? "good" : "bad"}`}
                            style={{ height: `${Math.max(4, Math.min(100, m.hit * 100))}%` }}
                          />
                          <div className="mref" style={{ bottom: `${base * 100}%` }} />
                        </div>
                        <span className="mlab mono">{m.label}</span>
                        <span className={`mval mono ${good ? "bull" : "bear"}`}>{fmtNum(m.hit * 100, 0)}%</span>
                      </div>
                    );
                  })}
                </div>
                <p className="mhint mono dim">
                  {t("bt.monthsHint")} · {t("bt.base")} = {fmtNum(base * 100, 1)}%
                </p>
              </section>
            )}

            {/* ---- СРАВНЕНИЕ ПО ВСЕМ МОНЕТАМ ---- */}
            <section className="mbox">
              <h4 className="mono">{t("bt.multiTitle")}</h4>
              {!rows.length ? (
                <div className="mono dim">{t("bt.wait")}</div>
              ) : (
                <div className="ctable mono">
                  <div className="ctr head">
                    <span>{t("mk.col.sym")}</span>
                    <span>{t("bt.all")}</span>
                    <span>{t("bt.base")}</span>
                    <span>{t("bt.vsBase")}</span>
                    <span>{t("bt.confOnly")}</span>
                    <span>{t("bt.coverage")}</span>
                    <span>.signals</span>
                  </div>
                  {rows.map((r) => (
                    <div className={`ctr ${r.id === symbol ? "me" : ""}`} key={r.id}>
                      <span className="cid">{r.id}</span>
                      <span className={r.hit >= r.base ? "bull" : "bear"}>{fmtNum(r.hit * 100, 1)}%</span>
                      <span className="dim">{fmtNum(r.base * 100, 1)}%</span>
                      <span className={r.edge >= 0 ? "bull" : "bear"}>
                        {r.edge >= 0 ? "+" : ""}
                        {fmtNum(r.edge * 100, 1)} п.п.
                      </span>
                      <span className="cy">{r.taken ? `${fmtNum(r.hitT * 100, 1)}%` : "—"}</span>
                      <span className="dim">{fmtNum(r.cov * 100, 0)}%</span>
                      <span className="dim">{r.n}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mhint mono dim">{t("bt.multiHint")}</p>
            </section>

            <div className="cols">
              <div className="col">
                <h4 className="mono">{t("bt.calib")}</h4>
                <div className="calib">
                  {(b.calibration ?? []).map((c, i) => (
                    <div className="crow" key={i}>
                      <div className="clab mono dim">
                        {fmtNum(c.lo * 100, 0)}–{fmtNum(c.hi * 100, 0)}% · n={c.n}
                      </div>
                      <div className="cbars">
                        <div className="cbar pred" style={{ width: `${c.predicted * 100}%` }}>
                          <span className="mono">
                            {t("bt.pred")} {fmtNum(c.predicted * 100, 0)}%
                          </span>
                        </div>
                        <div
                          className={`cbar real ${c.realized >= c.predicted ? "good" : "bad"}`}
                          style={{ width: `${c.realized * 100}%` }}
                        >
                          <span className="mono">
                            {t("bt.real")} {fmtNum(c.realized * 100, 0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!(b.calibration ?? []).length && <div className="mono dim">{t("bt.noBuckets")}</div>}
                </div>
              </div>

              <div className="col">
                <h4 className="mono">{t("bt.intervals")}</h4>
                <CalibStrip series={b.series ?? []} hint={t("bt.calHint")} empty={t("bt.noData")} />
                <h4 className="mono">{t("bt.curve")}</h4>
                <Equity
                  equity={b.equity ?? { strategy: 1, hold: 1 }}
                  lS={t("bt.eqStrategy")}
                  lH={t("bt.eqHold")}
                />
              </div>
            </div>

            <p className="note mono">{b.note}</p>
            <p className="disc mono">{t("bt.disc")}</p>
          </div>
        )}
      </Panel>

      <Style>{btCss}</Style>
    </div>
  );
}

const btCss = `
  .bt { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .bt-main { flex: 1; }
  .wait { display: flex; align-items: center; justify-content: center; height: 100%; letter-spacing: 0.1em; }
  .wrap { display: flex; flex-direction: column; gap: calc(var(--u) * 12); height: 100%; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(var(--u) * 10); }
  .kpi { border-left: calc(var(--u) * 3) solid var(--stroke); padding-left: calc(var(--u) * 10); }
  .kpi .lbl { font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.85); color: var(--dim); letter-spacing: 0.1em; }
  .kpi .val { font-family: "JetBrains Mono", monospace; font-size: var(--fs-xl); font-weight: 700; display: block; margin-top: calc(var(--u) * 4); }
  .kpi .sub { font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.85); color: var(--dim); display: block; }
  .kpi .why { font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.8); color: var(--cyan); opacity: 0.85; display: block; margin-top: calc(var(--u) * 2); letter-spacing: 0.04em; }

  .mbox h4 { margin: 0 0 calc(var(--u) * 8); font-size: calc(var(--fs-xs) * 0.9); color: var(--cyan); letter-spacing: 0.14em; font-weight: 500; }
  .mbox { background: rgba(5,10,18,0.45); border: 1px solid var(--stroke); padding: calc(var(--u) * 10); }
  .mhint { font-size: calc(var(--fs-xs) * 0.8); margin: calc(var(--u) * 8) 0 0; letter-spacing: 0.03em; }

  .mrow-grid { display: flex; gap: calc(var(--u) * 6); align-items: flex-end; overflow-x: auto; padding-bottom: 2px; }
  .mcell { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 3); min-width: calc(var(--u) * 34); flex: 1; }
  .mbar-track { position: relative; width: 100%; height: calc(var(--u) * 64); background: rgba(27,58,92,0.35); display: flex; align-items: flex-end; }
  .mbar { width: 100%; transition: height 0.5s ease; }
  .mbar.good { background: linear-gradient(180deg, rgba(25,245,138,0.9), rgba(25,245,138,0.35)); }
  .mbar.bad { background: linear-gradient(180deg, rgba(255,59,92,0.85), rgba(255,59,92,0.3)); }
  .mref { position: absolute; left: 0; right: 0; height: 1px; background: var(--amber); opacity: 0.85; box-shadow: 0 0 6px rgba(255,176,32,0.7); }
  .mlab { font-size: calc(var(--fs-xs) * 0.78); color: var(--dim); }
  .mval { font-size: calc(var(--fs-xs) * 0.85); font-weight: 700; }

  .ctable { display: flex; flex-direction: column; gap: 2px; font-size: var(--fs-xs); }
  .ctr { display: grid; grid-template-columns: 1.1fr repeat(6, 1fr); gap: calc(var(--u) * 6); padding: calc(var(--u) * 5) calc(var(--u) * 8); background: rgba(10,20,35,0.55); border-left: calc(var(--u) * 2) solid transparent; }
  .ctr.head { background: transparent; color: var(--dim); letter-spacing: 0.1em; font-size: calc(var(--fs-xs) * 0.8); border-bottom: 1px solid var(--stroke); }
  .ctr.me { border-left-color: var(--cyan); background: rgba(45,212,255,0.1); }
  .ctr .cid { color: var(--ink); font-weight: 700; letter-spacing: 0.06em; }
  .ctr span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: calc(var(--u) * 16); flex: 1; min-height: 0; }
  .col h4 { margin: 0 0 calc(var(--u) * 8); font-size: calc(var(--fs-xs) * 0.9); color: var(--cyan); letter-spacing: 0.14em; font-weight: 500; }
  .calib { display: flex; flex-direction: column; gap: calc(var(--u) * 8); }
  .clab { font-size: calc(var(--fs-xs) * 0.85); margin-bottom: calc(var(--u) * 3); }
  .cbars { display: flex; flex-direction: column; gap: 3px; }
  .cbar { height: calc(var(--u) * 16); display: flex; align-items: center; padding-left: calc(var(--u) * 6); transition: width 0.6s ease; min-width: fit-content; }
  .cbar span { font-size: calc(var(--fs-xs) * 0.85); white-space: nowrap; }
  .cbar.pred { background: rgba(45,212,255,0.25); border: 1px solid rgba(45,212,255,0.6); color: var(--cyan); }
  .cbar.real.good { background: rgba(25,245,138,0.25); border: 1px solid rgba(25,245,138,0.7); color: var(--bull); }
  .cbar.real.bad { background: rgba(255,59,92,0.22); border: 1px solid rgba(255,59,92,0.7); color: var(--bear); }
  .note { font-size: calc(var(--fs-xs) * 0.9); color: var(--ink); line-height: 1.6; border-left: 2px solid var(--cyan); padding-left: calc(var(--u) * 10); margin: 0; }
  .disc { font-size: calc(var(--fs-xs) * 0.85); color: var(--dim); margin: 0; }
  @media (max-width: 1024px) {
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .cols { grid-template-columns: 1fr; }
    .ctr { grid-template-columns: 1fr repeat(6, 1fr); font-size: calc(var(--fs-xs) * 0.9); }
  }
  @media (max-width: 560px) {
    .kpis { grid-template-columns: 1fr; }
    .ctable { font-size: calc(var(--fs-xs) * 0.9); }
    .ctr { grid-template-columns: 0.9fr repeat(6, 1fr); gap: calc(var(--u) * 4); padding: calc(var(--u) * 5) calc(var(--u) * 5); }
  }
`;

function Kpi({
  label,
  value,
  sub,
  tone,
  why,
}: {
  label: string;
  value: string;
  sub: string;
  tone: string;
  why?: string;
}) {
  const cls =
    tone === "bull"
      ? "bull glow-bull"
      : tone === "bear"
        ? "bear glow-bear"
        : tone === "cy"
          ? "cy glow-cy"
          : tone === "amber"
            ? "amber"
            : "dim";
  const bc =
    tone === "bull"
      ? COLORS.bull
      : tone === "bear"
        ? COLORS.bear
        : tone === "cy"
          ? COLORS.cyan
          : tone === "amber"
            ? COLORS.amber
            : COLORS.dim;
  return (
    <div className="kpi" style={{ borderLeftColor: bc }}>
      <span className="lbl">{label}</span>
      <span className={`val ${cls}`}>{value}</span>
      <span className="sub">{sub}</span>
      {why && <span className="why">{why}</span>}
    </div>
  );
}

function CalibStrip({
  series,
  hint,
  empty,
}: {
  series: { predicted: number; hit: boolean; conf: number }[];
  hint: string;
  empty: string;
}) {
  if (!series.length) return <div className="mono dim" style={{ marginBottom: 12 }}>{empty}</div>;
  const W = 460,
    H = 90;
  const pts = series.map((s, i) => {
    const x = (i / Math.max(1, series.length - 1)) * W;
    const conf = Math.max(0.5, Math.min(0.95, s.predicted));
    const y = H - ((conf - 0.5) / 0.45) * H;
    return { x, y, hit: s.hit };
  });
  return (
    <div className="calibstrip">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 70 }} preserveAspectRatio="none">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={COLORS.stroke} strokeDasharray="4 4" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={p.hit ? COLORS.bull : COLORS.bear} opacity="0.85" />
        ))}
      </svg>
      <div className="mono dim" style={{ fontSize: "calc(var(--fs-xs) * 0.8)" }}>
        {hint}
      </div>
      <Style>{`
        .calibstrip { margin-bottom: calc(var(--u) * 14); background: rgba(5,10,18,0.5); padding: calc(var(--u) * 6); }
      `}</Style>
    </div>
  );
}

function Equity({
  equity,
  lS,
  lH,
}: {
  equity: { strategy: number; hold: number };
  lS: string;
  lH: string;
}) {
  const s = equity.strategy;
  const h = equity.hold;
  const pctS = (s - 1) * 100;
  return (
    <div className="eq mono">
      <div className="row">
        <span className="dim">{lS}</span>
        <b className={s >= 1 ? "bull" : "bear"}>{fmtPct(s - 1, 1)}</b>
      </div>
      <div className="row">
        <span className="dim">{lH}</span>
        <b className={h >= 1 ? "bull" : "bear"}>{fmtPct(h - 1, 1)}</b>
      </div>
      <div className="bar">
        <div className="fill-s" style={{ width: `${Math.max(4, Math.min(100, 50 + pctS / 2))}%` }} />
        <div className="mid" />
      </div>
      <Style>{`
        .eq { font-size: var(--fs-xs); display: flex; flex-direction: column; gap: calc(var(--u) * 6); }
        .eq .row { display: flex; justify-content: space-between; }
        .eq .bar { position: relative; height: calc(var(--u) * 10); background: rgba(27,58,92,0.4); }
        .eq .fill-s { height: 100%; background: linear-gradient(90deg, rgba(45,212,255,0.5), rgba(25,245,138,0.6)); transition: width 0.6s; }
        .eq .mid { position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--amber); }
      `}</Style>
    </div>
  );
}
