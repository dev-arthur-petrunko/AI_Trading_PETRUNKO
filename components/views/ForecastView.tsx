"use client";

import { useStore } from "@/lib/store";
import { Panel } from "@/components/Panel";
import { ForecastFan } from "@/components/panels/ForecastFan";
import { COLORS, fmtPct, fmtNum } from "@/lib/format";

/** ПРОГНОЗЫ: probability split, ensemble weights ("почему такой прогноз"), horizons. */
export function ForecastView() {
  const { forecast, symbol, backtest } = useStore();
  const f = forecast;

  const comp = f?.components;
  const rows = comp
    ? [
        { key: "analogs", label: "Аналоги (топ-50, DTW + корреляция)", w: comp.analogs.w, p: comp.analogs.p },
        { key: "technical", label: "Техника: RSI / MACD / Bollinger / EMA", w: comp.technical.w, p: comp.technical.p },
        { key: "micro", label: "Микроструктура: стакан / funding / OI", w: comp.micro.w, p: comp.micro.p },
        { key: "regime", label: "Режим рынка: волатильность + тренд", w: comp.regime.w, p: comp.regime.p },
      ]
    : [];

  return (
    <div className="fc">
      <Panel title={`Прогноз ${symbol} · ансамбль`} icon="⌬" delay={80} className="fc-prob">
        <div className="probs">
          <div className="split">
            {f ? (
              <>
                <Seg v={f.probUp} color={COLORS.bull} label="UP" />
                <Seg v={f.probFlat} color={COLORS.dim} label="FLAT" />
                <Seg v={f.probDown} color={COLORS.bear} label="DOWN" />
              </>
            ) : (
              <div className="dim mono">расчёт выполняется…</div>
            )}
          </div>
          <div className="big mono">
            <span className="dim">P(UP) = </span>
            <span className={f && f.probUp >= 0.5 ? "bull glow-bull" : "bear glow-bear"}>
              {f ? `${(f.probUp * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="meta mono">
            горизонт: <b className="cy">{f?.horizonDays ?? "—"} дн.</b> · аналогов: <b className="cy">{f?.count ?? 0}</b> ·
            из них вверх: <b className="bull">{f?.upCount ?? 0}</b> · уверенность: <b className={f && f.clearEdge ? "cy" : "amber"}>{f ? (f.confidence * 100).toFixed(0) + "%" : "—"}</b>
            {!f?.clearEdge && f ? <b className="amber"> · NO CLEAR EDGE</b> : null}
          </div>
          <p className="txt mono">{f?.text ?? ""}</p>
        </div>
      </Panel>

      <Panel title="Почему такой прогноз · веса ансамбля" icon="⚖" delay={160} className="fc-why">
        <div className="weights">
          {rows.map((r) => (
            <div className="wrow" key={r.key}>
              <div className="wtop mono">
                <span className="lbl">{r.label}</span>
                <span className="vals">
                  <b className="cy">вес {(r.w * 100).toFixed(0)}%</b>
                  <b style={{ color: r.p >= 0.5 ? COLORS.bull : COLORS.bear }}>голос {(r.p * 100).toFixed(0)}%</b>
                </span>
              </div>
              <div className="wbar">
                <div className="wfill" style={{ width: `${r.w * 100}%`, background: r.p >= 0.5 ? COLORS.bull : COLORS.bear, opacity: 0.75 }} />
              </div>
            </div>
          ))}
          <div className="wnote mono dim">
            Итог: взвешенная смесь = <b className="cy">{f ? (f.components.total * 100).toFixed(1) : "—"}%</b> (доля «вверх» до вычета FLAT).
            Микроструктура — только live: в бэктесте её вес честно перераспределён.
          </div>
        </div>
      </Panel>

      <Panel title="Ожидаемые ходы по горизонтам" icon="⇶" delay={240} className="fc-hor">
        <div className="hz mono">
          {f ? (
            <table>
              <thead>
                <tr><th>ГОРИЗОНТ</th><th>МЕДИАНА</th><th>10%</th><th>50% ЦЕНТР</th><th>90%</th></tr>
              </thead>
              <tbody>
                {(["d1", "d7", "d30"] as const).map((k) => {
                  const q = f.implied?.[k];
                  const m = f.medianMove?.[k];
                  if (!q) return null;
                  return (
                    <tr key={k}>
                      <td className="cy">{k === "d1" ? "24 часа" : k === "d7" ? "7 дней" : "30 дней"}</td>
                      <td className={m >= 0 ? "bull" : "bear"}>{fmtPct(m, 1)}</td>
                      <td className="dim">{fmtPct(q.p10, 1)}</td>
                      <td>{fmtPct(q.p50, 1)}</td>
                      <td className="dim">{fmtPct(q.p90, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="dim">нет данных</div>
          )}
          <div className="note dim">
            {backtest?.computed
              ? `Бэктест (горизонт ${backtest.horizonDays} д., последние 2 года): точность ${fmtNum(backtest.hitRateAll * 100, 1)}% при «всегда вверх» ${fmtNum(backtest.baselineUp * 100, 1)}%.`
              : "Бэктест рассчитывается…"}
          </div>
        </div>
      </Panel>

      <Panel title="Веер прогноза" icon="✳" delay={320} className="fc-fan">
        <ForecastFan />
      </Panel>

      <style>{`
        .fc { display: grid; grid-template-columns: repeat(12, 1fr); grid-template-rows: calc(var(--u) * 240) calc(var(--u) * 210) 1fr; gap: calc(var(--u) * 8); flex: 1; min-height: 0; }
        .fc-prob { grid-column: span 5; }
        .fc-why { grid-column: span 4; }
        .fc-hor { grid-column: span 3; }
        .fc-fan { grid-column: span 12; }
        .probs { display: flex; flex-direction: column; gap: calc(var(--u) * 8); height: 100%; }
        .split { display: flex; height: calc(var(--u) * 26); background: rgba(5,10,18,0.6); border: 1px solid var(--stroke); overflow: hidden; }
        .seg { display: flex; align-items: center; justify-content: center; font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.95); transition: width 0.7s ease; overflow: hidden; }
        .big { font-size: var(--fs-xl); font-weight: 700; }
        .meta { font-size: var(--fs-s); color: var(--ink); line-height: 1.7; }
        .txt { font-size: var(--fs-xs); color: var(--dim); line-height: 1.6; border-left: 2px solid var(--cyan); padding-left: calc(var(--u) * 8); margin-top: auto; }
        .weights { display: flex; flex-direction: column; gap: calc(var(--u) * 8); height: 100%; }
        .wrow { display: flex; flex-direction: column; gap: calc(var(--u) * 3); }
        .wtop { display: flex; justify-content: space-between; font-size: calc(var(--fs-xs) * 0.9); gap: calc(var(--u) * 8); }
        .wtop .lbl { color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wtop .vals { display: flex; gap: calc(var(--u) * 10); flex: 0 0 auto; }
        .wbar { height: calc(var(--u) * 7); background: rgba(27,58,92,0.35); }
        .wfill { height: 100%; transition: width 0.7s ease; }
        .wnote { font-size: calc(var(--fs-xs) * 0.88); margin-top: auto; line-height: 1.5; }
        .hz { height: 100%; display: flex; flex-direction: column; font-size: var(--fs-xs); }
        .hz table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
        .hz th { color: var(--dim); text-align: left; font-weight: 400; letter-spacing: 0.08em; padding: calc(var(--u) * 4) 0; border-bottom: 1px solid var(--stroke); font-size: calc(var(--fs-xs) * 0.85); }
        .hz td { padding: calc(var(--u) * 5) 0; border-bottom: 1px solid rgba(27,58,92,0.35); }
        .note { margin-top: auto; font-size: calc(var(--fs-xs) * 0.85); line-height: 1.5; padding-top: calc(var(--u) * 6); }
        @media (max-width: 1024px) { .fc { display: flex; flex-direction: column; } .fc .panel { min-height: calc(var(--u) * 240); } }
      `}</style>
    </div>
  );
}

function Seg({ v, color, label }: { v: number; color: string; label: string }) {
  return (
    <div className="seg" style={{ width: `${v * 100}%`, background: `${color}33`, color, borderRight: "1px solid rgba(5,10,18,0.8)" }}>
      {v > 0.09 ? `${label} ${(v * 100).toFixed(0)}%` : ""}
    </div>
  );
}
