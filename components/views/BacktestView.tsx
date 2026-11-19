"use client";

import { useEffect, useState } from "react";
import { Style } from "@/components/Style";
import { useStore, apiGet } from "@/lib/store";
import { Panel } from "@/components/Panel";
import { COLORS, fmtPct, fmtDate, fmtNum } from "@/lib/format";
import type { BacktestBrief } from "@/lib/types";

type Full = BacktestBrief & {
  series?: { t: number; price: number; predicted: number; conf: number; actual: number; hit: boolean }[];
  equity?: { strategy: number; hold: number };
  calibration?: { lo: number; hi: number; predicted: number; realized: number; n: number }[];
};

/** БЭКТЕС: honest walk-forward check of the last 2 years. */
export function BacktestView() {
  const { symbol, swapKey } = useStore();
  const [b, setB] = useState<Full | null>(null);

  useEffect(() => {
    let dead = false;
    apiGet<Full>("/api/backtest", { symbol, full: 1 })
      .then((r) => !dead && setB(r))
      .catch(() => {});
    const t = setInterval(() => {
      apiGet<Full>("/api/backtest", { symbol, full: 1 })
        .then((r) => !dead && setB(r))
        .catch(() => {});
    }, 60000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [symbol, swapKey]);

  const hit = b?.computed ? b.hitRateAll : 0;
  const base = b?.computed ? b.baselineUp : 0;
  const beaten = b?.computed ? hit > base : false;

  return (
    <div className="bt">
      <Panel title={`Бэктест ${symbol} · walk-forward, последние 2 года`} icon="◷" delay={80} className="bt-main">
        {!b?.computed ? (
          <div className="wait mono dim">{b?.note ?? "Расчёт выполняется (worker thread)…"}</div>
        ) : (
          <div className="wrap">
            <div className="kpis">
              <Kpi label="ТОЧНОСТЬ (все сигналы)" value={`${fmtNum(hit * 100, 1)}%`} tone={beaten ? "bull" : "bear"} sub={`${b.n} сигналов`} />
              <Kpi label="«ВСЕГДА ВВЕРХ» (база)" value={`${fmtNum(base * 100, 1)}%`} tone="dim" sub="доля роста в истории" />
              <Kpi label="ТОЛЬКО УВЕРЕННЫЕ" value={b.taken ? `${fmtNum(b.hitRateTaken * 100, 1)}%` : "—"} tone="cy" sub={`порог 15%, покрытие ${fmtNum(b.coverage * 100, 0)}% (${b.taken})`} />
              <Kpi label="ГОРИЗОНТ / ОКНО" value={`${b.horizonDays} дн`} tone="amber" sub={`${b.tf} ряды`} />
            </div>

            <div className="cols">
              <div className="col">
                <h4 className="mono">КАЛИБРОВКА: обещано → сбылось</h4>
                <div className="calib">
                  {(b.calibration ?? []).map((c, i) => (
                    <div className="crow" key={i}>
                      <div className="clab mono dim">{fmtNum(c.lo * 100, 0)}–{fmtNum(c.hi * 100, 0)}% · n={c.n}</div>
                      <div className="cbars">
                        <div className="cbar pred" style={{ width: `${c.predicted * 100}%` }}>
                          <span className="mono">прогноз {fmtNum(c.predicted * 100, 0)}%</span>
                        </div>
                        <div className={`cbar real ${c.realized >= c.predicted ? "good" : "bad"}`} style={{ width: `${c.realized * 100}%` }}>
                          <span className="mono">факт {fmtNum(c.realized * 100, 0)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!(b.calibration ?? []).length && <div className="mono dim">нет бакетов</div>}
                </div>
              </div>

              <div className="col">
                <h4 className="mono">ДОВЕРИТЕЛЬНЫЕ ИНТЕРВАЛЫ ПРОГНОЗА</h4>
                <CalibStrip series={b.series ?? []} />
                <h4 className="mono">КРИВЫЕ: стратегия vs покупка и держание</h4>
                <Equity equity={b.equity ?? { strategy: 1, hold: 1 }} />
              </div>
            </div>

            <p className="note mono">{b.note}</p>
            <p className="disc mono">
              Это ретроспективная проверка, а не гарантия будущего: точность на прошлом не обещает точность
              на будущем. Проект образовательный, не является инвестиционной рекомендацией.
            </p>
          </div>
        )}
      </Panel>

      <Style>{`
        .bt { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .bt-main { flex: 1; }
        .wait { display: flex; align-items: center; justify-content: center; height: 100%; letter-spacing: 0.1em; }
        .wrap { display: flex; flex-direction: column; gap: calc(var(--u) * 12); height: 100%; }
        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(var(--u) * 10); }
        .kpi { border-left: calc(var(--u) * 3) solid var(--stroke); padding-left: calc(var(--u) * 10); }
        .kpi .lbl { font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.85); color: var(--dim); letter-spacing: 0.1em; }
        .kpi .val { font-family: "JetBrains Mono", monospace; font-size: var(--fs-xl); font-weight: 700; display: block; margin-top: calc(var(--u) * 4); }
        .kpi .sub { font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.85); color: var(--dim); }
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
        }
      `}</Style>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const cls = tone === "bull" ? "bull glow-bull" : tone === "bear" ? "bear glow-bear" : tone === "cy" ? "cy glow-cy" : tone === "amber" ? "amber" : "dim";
  const bc = tone === "bull" ? COLORS.bull : tone === "bear" ? COLORS.bear : tone === "cy" ? COLORS.cyan : tone === "amber" ? COLORS.amber : COLORS.dim;
  return (
    <div className="kpi" style={{ borderLeftColor: bc }}>
      <span className="lbl">{label}</span>
      <span className={`val ${cls}`}>{value}</span>
      <span className="sub">{sub}</span>
    </div>
  );
}

function CalibStrip({ series }: { series: { predicted: number; hit: boolean; conf: number }[] }) {
  if (!series.length) return <div className="mono dim" style={{ marginBottom: 12 }}>нет данных</div>;
  const W = 460, H = 90;
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
        уверенность сигнала (0.5–0.95), зелёный = сбылся, красный = нет
      </div>
      <Style>{`
        .calibstrip { margin-bottom: calc(var(--u) * 14); background: rgba(5,10,18,0.5); padding: calc(var(--u) * 6); }
      `}</Style>
    </div>
  );
}

function Equity({ equity }: { equity: { strategy: number; hold: number } }) {
  const s = equity.strategy;
  const h = equity.hold;
  const pctS = (s - 1) * 100;
  const pctH = (h - 1) * 100;
  return (
    <div className="eq mono">
      <div className="row">
        <span className="dim">стратегия по сигналу (без учёта комиссий):</span>
        <b className={s >= 1 ? "bull" : "bear"}>{fmtPct(s - 1, 1)}</b>
      </div>
      <div className="row">
        <span className="dim">купить и держать:</span>
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

void fmtDate;
