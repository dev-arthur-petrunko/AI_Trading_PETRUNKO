"use client";

import { useStore } from "@/lib/store";
import { Style } from "@/components/Style";
import { Panel } from "@/components/Panel";
import { ForecastFan } from "@/components/panels/ForecastFan";
import { AiEnginePanel } from "@/components/views/AiView";
import { COLORS, fmtPct, fmtNum } from "@/lib/format";

/** ПРОГНОЗЫ (переработано, задача 4): ансамбль + AI + горизонты + распределение
 *  + риск-факторы + бэктест-метрики + веер. Больше информации в отведённом месте. */
export function ForecastView() {
  const { forecast, symbol, backtest, depth, stats, fng, t } = useStore();
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

  const micro = (f as { micro?: { funding?: number; oiChange?: number } } | null)?.micro || {};

  return (
    <div className="fc">
      {/* row 1 */}
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
            горизонт <b className="cy">{f?.horizonDays ?? "—"} дн.</b> · аналогов{" "}
            <b className="cy">{f?.count ?? 0}</b> · вверх <b className="bull">{f?.upCount ?? 0}</b> ·
            уверенность{" "}
            <b className={f && f.clearEdge ? "cy" : "amber"}>
              {f ? (f.confidence * 100).toFixed(0) + "%" : "—"}
            </b>
            {!f?.clearEdge && f ? <b className="amber"> · NO CLEAR EDGE</b> : null}
          </div>
          <div className="mini mono">
            медиана 7д <b className={ (f?.medianMove?.d7 ?? 0) >= 0 ? "bull" : "bear"}>{fmtPct(f?.medianMove?.d7, 1)}</b> ·
            спред <b className="amber">{fmtPct(f?.spread?.d7, 1)}</b> · схожесть топ{" "}
            <b className="cy">{f?.best ? Math.round(f.best.sim * 100) + "%" : "—"}</b>
          </div>
          <p className="txt mono">{f?.text ?? ""}</p>
        </div>
      </Panel>

      <Panel title={t("fc.why")} icon="⚖" delay={160} className="fc-why">
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
                <div
                  className="wfill"
                  style={{
                    width: `${r.w * 100}%`,
                    background: r.p >= 0.5 ? COLORS.bull : COLORS.bear,
                    opacity: 0.75,
                  }}
                />
              </div>
            </div>
          ))}
          <div className="wnote mono dim">
            Итог: взвешенная смесь = <b className="cy">{f ? (f.components.total * 100).toFixed(1) : "—"}%</b>.
            Микроструктура — live; в бэктесте её вес честно перераспределён.
          </div>
        </div>
      </Panel>

      <Panel title={t("fc.ai")} icon="✦" delay={240} className="fc-ai">
        <AiEnginePanel />
      </Panel>

      {/* row 2 */}
      <Panel title={t("fc.hor")} icon="⇶" delay={300} className="fc-hor">
        <div className="hz mono">
          {f ? (
            <table>
              <thead>
                <tr><th>ГОРИЗОНТ</th><th>МЕДИАНА</th><th>10%</th><th>50%</th><th>90%</th></tr>
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
              ? `Бэктест (горизонт ${backtest.horizonDays} д., 2 года): точность ${fmtNum(backtest.hitRateAll * 100, 1)}% vs «всегда вверх» ${fmtNum(backtest.baselineUp * 100, 1)}%.`
              : "Бэктест рассчитывается…"}
          </div>
        </div>
      </Panel>

      <Panel title={t("fc.dist")} icon="▥" delay={360} className="fc-dist">
        <DistChart />
      </Panel>

      <Panel title={t("fc.risk")} icon="⚠" delay={420} className="fc-risk">
        <RiskRows
          funding={micro.funding}
          oiChange={micro.oiChange}
          imbalance={depth?.imbalance}
          rsiChg={stats[symbol]?.chg}
          fng={fng?.value}
        />
      </Panel>

      {/* row 3 */}
      <Panel title={t("fc.fanTitle")} icon="✳" delay={480} className="fc-fan">
        <ForecastFan />
      </Panel>

      <Style>{`
        .fc { display: grid; grid-template-columns: repeat(12, 1fr); grid-template-rows: calc(var(--u) * 250) calc(var(--u) * 245) 1fr; gap: calc(var(--u) * 8); flex: 1; min-height: 0; }
        .fc-prob { grid-column: span 5; }
        .fc-why { grid-column: span 4; }
        .fc-ai { grid-column: span 3; }
        .fc-hor { grid-column: span 4; }
        .fc-dist { grid-column: span 4; }
        .fc-risk { grid-column: span 4; }
        .fc-fan { grid-column: span 12; }
        .probs { display: flex; flex-direction: column; gap: calc(var(--u) * 6); height: 100%; }
        .split { display: flex; height: calc(var(--u) * 24); background: rgba(5,10,18,0.6); border: 1px solid var(--stroke); overflow: hidden; }
        .seg { display: flex; align-items: center; justify-content: center; font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.9); transition: width 0.7s ease; overflow: hidden; }
        .big { font-size: var(--fs-xl); font-weight: 700; }
        .meta { font-size: var(--fs-s); color: var(--ink); line-height: 1.6; }
        .mini { font-size: calc(var(--fs-xs) * 0.9); color: var(--dim); display: flex; gap: calc(var(--u) * 10); flex-wrap: wrap; }
        .txt { font-size: calc(var(--fs-xs) * 0.88); color: var(--dim); line-height: 1.55; border-left: 2px solid var(--cyan); padding-left: calc(var(--u) * 8); margin-top: auto; }
        .weights { display: flex; flex-direction: column; gap: calc(var(--u) * 7); height: 100%; }
        .wrow { display: flex; flex-direction: column; gap: calc(var(--u) * 3); }
        .wtop { display: flex; justify-content: space-between; font-size: calc(var(--fs-xs) * 0.88); gap: calc(var(--u) * 8); }
        .wtop .lbl { color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wtop .vals { display: flex; gap: calc(var(--u) * 8); flex: 0 0 auto; }
        .wbar { height: calc(var(--u) * 6); background: rgba(27,58,92,0.35); }
        .wfill { height: 100%; transition: width 0.7s ease; }
        .wnote { font-size: calc(var(--fs-xs) * 0.84); margin-top: auto; line-height: 1.5; }
        .hz { height: 100%; display: flex; flex-direction: column; font-size: var(--fs-xs); }
        .hz table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
        .hz th { color: var(--dim); text-align: left; font-weight: 400; letter-spacing: 0.08em; padding: calc(var(--u) * 4) 0; border-bottom: 1px solid var(--stroke); font-size: calc(var(--fs-xs) * 0.82); }
        .hz td { padding: calc(var(--u) * 5) 0; border-bottom: 1px solid rgba(27,58,92,0.35); }
        .note { margin-top: auto; font-size: calc(var(--fs-xs) * 0.84); line-height: 1.5; padding-top: calc(var(--u) * 6); }
        .risk { display: flex; flex-direction: column; gap: calc(var(--u) * 7); font-size: var(--fs-xs); }
        .risk .rr { display: grid; grid-template-columns: 1.4fr 1fr 1.2fr; gap: calc(var(--u) * 6); align-items: center; border-bottom: 1px dashed rgba(27,58,92,0.55); padding-bottom: calc(var(--u) * 5); }
        .risk .rn { color: var(--dim); letter-spacing: 0.06em; }
        .risk .rv { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
        .risk .rs { text-align: right; color: var(--dim); font-size: calc(var(--fs-xs) * 0.84); }
        .dist { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .dist-svg { flex: 1; min-height: 0; width: 100%; background: rgba(5,10,18,0.5); border: 1px solid rgba(27,58,92,0.55); }
        .dist-note { font-size: calc(var(--fs-xs) * 0.8); color: var(--dim); margin-top: calc(var(--u) * 5); letter-spacing: 0.04em; }
        @media (max-width: 1024px) {
          .fc { display: flex; flex-direction: column; }
          .fc .panel { min-height: calc(var(--u) * 240); }
        }
      `}</Style>
    </div>
  );
}

function Seg({ v, color, label }: { v: number; color: string; label: string }) {
  return (
    <div
      className="seg"
      style={{ width: `${v * 100}%`, background: `${color}33`, color, borderRight: "1px solid rgba(5,10,18,0.8)" }}
    >
      {v > 0.09 ? `${label} ${(v * 100).toFixed(0)}%` : ""}
    </div>
  );
}

/** Гистограмма возвратов топ-аналогов (поле bins из прогноза). */
function DistChart() {
  const { forecast } = useStore();
  const bins = forecast?.bins;
  if (!bins || !bins.centers.length) return <div className="empty mono dim">нет данных</div>;
  const W = 600, H = 150;
  const max = Math.max(...bins.shares, 0.01);
  const n = bins.centers.length;
  const bw = W / n;
  return (
    <div className="dist">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="dist-svg">
        <line x1={n * bw * (0.5 - (bins.centers[0] > 0 ? 0 : 1))} y1="0" x2={n * bw * (0.5 - (bins.centers[0] > 0 ? 0 : 1))} y2={H} stroke="none" />
        {bins.centers.map((c, i) => {
          const h = (bins.shares[i] / max) * (H - 24);
          const color = c >= 0 ? COLORS.bull : COLORS.bear;
          return (
            <g key={i}>
              <rect
                x={i * bw + 1}
                y={H - h - 14}
                width={Math.max(2, bw - 2)}
                height={h}
                fill={color}
                opacity={0.75}
                rx={1}
              />
              {i % 3 === 0 && (
                <text
                  x={i * bw + bw / 2}
                  y={H - 3}
                  fill={COLORS.dim}
                  fontSize="9"
                  textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {(c * 100).toFixed(0)}
                </text>
              )}
            </g>
          );
        })}
        {/* zero divider */}
        <line
          x1={bins.centers.findIndex((c) => c >= 0) * bw}
          y1="0"
          x2={bins.centers.findIndex((c) => c >= 0) * bw}
          y2={H}
          stroke={COLORS.amber}
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.8"
        />
      </svg>
      <div className="dist-note mono">
        ось X: исход за {forecast?.horizonDays ?? 7} дн, % · высота: доля аналогов · янтарная = ноль (слева падали, справа росли)
      </div>
    </div>
  );
}

/** Риск-факторы: строка на метрику, цвет = вклад в риск. */
function RiskRows(p: {
  funding?: number;
  oiChange?: number;
  imbalance?: number;
  rsiChg?: number;
  fng?: number;
}) {
  const items: { n: string; v: string; s: string; c: string }[] = [
    {
      n: "Funding rate",
      v: p.funding !== undefined ? `${(p.funding * 100).toFixed(4)}%` : "—",
      s: p.funding === undefined ? "нет данных" : Math.abs(p.funding) > 0.0005 ? "перекос позиций" : "норма",
      c: p.funding === undefined ? COLORS.dim : Math.abs(p.funding) > 0.0005 ? (p.funding > 0 ? COLORS.bear : COLORS.bull) : COLORS.cyan,
    },
    {
      n: "ΔOI (24ч)",
      v: p.oiChange !== undefined ? fmtPct(p.oiChange, 1) : "—",
      s: p.oiChange === undefined ? "нет данных" : Math.abs(p.oiChange) > 0.05 ? "деньги входят в рынок" : "спокойно",
      c: p.oiChange === undefined ? COLORS.dim : p.oiChange > 0.05 ? COLORS.amber : COLORS.cyan,
    },
    {
      n: "Дисбаланс стакана",
      v: p.imbalance !== undefined ? `${p.imbalance >= 0 ? "+" : ""}${(p.imbalance * 100).toFixed(0)}%` : "—",
      s: p.imbalance === undefined ? "нет данных" : p.imbalance > 0.25 ? "стенка байеров" : p.imbalance < -0.25 ? "давление селлеров" : "равновесие",
      c: p.imbalance === undefined ? COLORS.dim : p.imbalance > 0.25 ? COLORS.bull : p.imbalance < -0.25 ? COLORS.bear : COLORS.cyan,
    },
    {
      n: "24ч изменение",
      v: p.rsiChg !== undefined ? fmtPct(p.rsiChg / 100) : "—",
      s: "импульс суток",
      c: p.rsiChg === undefined ? COLORS.dim : p.rsiChg >= 0 ? COLORS.bull : COLORS.bear,
    },
    {
      n: "Fear & Greed",
      v: p.fng !== undefined ? String(p.fng) : "—",
      s: p.fng === undefined ? "нет данных" : p.fng < 25 ? "страх — возможно дно" : p.fng > 75 ? "жадность — осторожно" : "нейтрально",
      c: p.fng === undefined ? COLORS.dim : p.fng < 25 ? COLORS.cyan : p.fng > 75 ? COLORS.bear : COLORS.amber,
    },
  ];
  return (
    <div className="risk mono">
      {items.map((it) => (
        <div className="rr" key={it.n}>
          <span className="rn">{it.n}</span>
          <span className="rv" style={{ color: it.c }}>{it.v}</span>
          <span className="rs">{it.s}</span>
        </div>
      ))}
    </div>
  );
}
