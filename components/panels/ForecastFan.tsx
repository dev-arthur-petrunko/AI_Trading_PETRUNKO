"use client";

import { useEffect, useMemo, useState } from "react";
import { Style } from "@/components/Style";
import { useStore, apiGet } from "@/lib/store";
import { COLORS, fmtPct } from "@/lib/format";

type FanResp = {
  symbol: string;
  error?: string;
  current: number;
  implied: {
    d1: { p10: number; p50: number; p90: number };
    d7: { p10: number; p50: number; p90: number };
    d30: { p10: number; p50: number; p90: number };
  };
  median: { d1: number; d7: number; d30: number };
  horizonDays: number;
  probUp: number;
  probDown: number;
  probFlat: number;
  bins: { centers: number[]; shares: number[] };
  analogs: { t: number; sim: number; r1d: number; r7d: number; r30d: number }[];
  tail: { t: number; c: number }[];
  computedAt: number;
};

const HZ = [
  { id: "d1", label: "24Ч", long: "24 часа" },
  { id: "d7", label: "7Д", long: "7 дней" },
  { id: "d30", label: "30Д", long: "30 дней" },
] as const;

type HZId = (typeof HZ)[number]["id"];

/**
 * FORECAST FAN — «куда разлетаются 50 аналогов»:
 *  • полосы: тёмно-циановая 90% и янтарная 50% (квантили имплицированного распределения),
 *  • нити: каждая нить = один исторический аналог (зелёный вырос / красный упал),
 *  • медиана — яркая линия + цель (пунктир до конца горизонта),
 *  • подписи в HTML-оверлее (не растягиваются в узкой панели),
 *  • легенда и вероятности — текстом, чтобы читалось без расшифровки.
 */
export function ForecastFan() {
  const { symbol, swapKey, forecast, reduced } = useStore();
  const [data, setData] = useState<FanResp | null>(null);
  const [hz, setHz] = useState<HZId>("d7");
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    let dead = false;
    apiGet<FanResp>("/api/forecast-fan", { symbol })
      .then((r) => !dead && !r.error && setData(r))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [symbol, swapKey, forecast?.computedAt]);

  // gentle sway of the fan (disabled in eco / reduced-motion)
  useEffect(() => {
    if (reduced) {
      setDrift(0);
      return;
    }
    let raf = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      setDrift(Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.4);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const geo = useMemo(() => buildFan(data, hz, drift), [data, hz, drift]);

  if (!data) return <div className="fan-empty mono">расчёт веера…</div>;

  const q = data.implied[hz];
  const med = data.median[hz];
  const pct = (v: number) => fmtPct(v, 1);
  const yPct = (y: number) => `${(y / 170) * 100}%`;

  return (
    <div className="fan">
      <div className="fan-bar">
        <span className="fan-title mono">
          КУДА РАЗЛЕТИТСЯ {data.analogs.length} АНАЛОГОВ ЗА {HZ.find((h) => h.id === hz)?.long}
        </span>
        <span className="grow" />
        <span className="probs mono">
          <b className="bull">↑{data.probUp * 100 | 0}%</b>
          <i>рост</i>
          <b className="dim">→{data.probFlat * 100 | 0}%</b>
          <i>флэт</i>
          <b className="bear">↓{data.probDown * 100 | 0}%</b>
          <i>падение</i>
        </span>
      </div>

      <div className="fan-row">
        <div className="fan-plot">
          <svg viewBox="0 0 600 170" preserveAspectRatio="none" className="fan-svg">
            <line x1="0" y1={geo.y0} x2="600" y2={geo.y0} stroke={COLORS.dim} strokeWidth="0.7" strokeDasharray="5 6" opacity="0.55" />
            <line x1={geo.x0} y1={geo.y0} x2="588" y2={geo.endMedian} stroke={COLORS.amber} strokeWidth="0.9" strokeDasharray="3 5" opacity="0.75" />
            <path d={geo.area90} fill="url(#fan90)" />
            <path d={geo.area50} fill="url(#fan50)" />
            {geo.threads.map((p, i) => (
              <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth="0.9" opacity={0.12 + p.w * 0.4} />
            ))}
            <path d={geo.median} fill="none" stroke={COLORS.ink} strokeWidth="2.2" strokeLinecap="round" />
            <defs>
              <linearGradient id="fan90" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={COLORS.cyan} stopOpacity="0.06" />
                <stop offset="100%" stopColor={COLORS.cyan} stopOpacity="0.24" />
              </linearGradient>
              <linearGradient id="fan50" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.08" />
                <stop offset="100%" stopColor={COLORS.amber} stopOpacity="0.34" />
              </linearGradient>
            </defs>
          </svg>

          <span className="lbl-cur mono" style={{ top: yPct(geo.y0) }}>
            {data.current > 0 ? data.current.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
          </span>
          <span className="lbl-zero mono" style={{ top: yPct(geo.y0) }}>0%</span>
          <div className="lbl-ends mono">
            <span className="cy" style={{ top: yPct(geo.endP90) }}>90% {pct(q.p90)}</span>
            <span className="med" style={{ top: yPct(geo.endMedian) }}>медиана {pct(med)}</span>
            <span className="cy" style={{ top: yPct(geo.endP10) }}>10% {pct(q.p10)}</span>
          </div>
        </div>

        <div className="fan-legend mono" data-prio="3">
          <span><i className="sw" style={{ background: COLORS.ink }} />медиана</span>
          <span><i className="sw" style={{ background: "rgba(255,176,32,0.55)" }} />ядро 50%</span>
          <span><i className="sw" style={{ background: "rgba(45,212,255,0.5)" }} />диапазон 90%</span>
          <span><i className="sw" style={{ background: COLORS.bull }} />нить ↑ аналог вырос</span>
          <span><i className="sw" style={{ background: COLORS.bear }} />↓ упал</span>
        </div>
      </div>

      <div className="fan-chips">
        {HZ.map((h) => (
          <button key={h.id} className={`hz ${hz === h.id ? "on" : ""}`} onClick={() => setHz(h.id)} title={h.long}>
            {h.label}
          </button>
        ))}
        <span className="grow" />
        <span className="fan-note mono dim" data-prio="2">
          медиана {pct(med)} · ядро 50% [{pct(q.p50)}] · обновлено {new Date(data.computedAt).toLocaleTimeString("ru-RU")}
        </span>
      </div>

      <Style>{`
        .fan { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: calc(var(--u) * 4); }
        .fan-empty { color: var(--dim); font-size: var(--fs-xs); display: flex; align-items: center; justify-content: center; height: 100%; }
        .fan-bar { display: flex; align-items: center; gap: calc(var(--u) * 6); flex: 0 0 auto; }
        .fan-title { font-size: calc(var(--fs-xs) * 0.8); color: var(--cyan); letter-spacing: 0.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .grow { flex: 1; }
        .probs { display: flex; align-items: baseline; gap: calc(var(--u) * 5); font-size: calc(var(--fs-xs) * 0.85); flex: 0 0 auto; }
        .probs i { font-style: normal; color: var(--dim); font-size: calc(var(--fs-xs) * 0.72); letter-spacing: 0.05em; }
        .probs b { font-variant-numeric: tabular-nums; }
        .fan-row { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: calc(var(--u) * 3); }
        .fan-plot { position: relative; flex: 1; min-height: 0; background: rgba(5,10,18,0.5); border: 1px solid rgba(27,58,92,0.55); }
        .fan-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .lbl-cur {
          position: absolute; left: 4px; transform: translateY(-50%);
          background: rgba(5,10,18,0.9); border: 1px solid var(--cyan); color: var(--cyan);
          padding: 0 calc(var(--u) * 5); font-size: calc(var(--fs-xs) * 0.78);
          font-variant-numeric: tabular-nums;
        }
        .lbl-zero {
          position: absolute; right: 4px; transform: translateY(-50%);
          color: var(--dim); font-size: calc(var(--fs-xs) * 0.7); background: rgba(5,10,18,0.8);
          padding: 0 calc(var(--u) * 4);
        }
        .lbl-ends { position: absolute; inset: 0; pointer-events: none; }
        .lbl-ends span {
          position: absolute; right: 6px; transform: translateY(-50%);
          background: rgba(5,10,18,0.9); border: 1px solid var(--stroke);
          padding: 0 calc(var(--u) * 5); font-size: calc(var(--fs-xs) * 0.74);
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .lbl-ends .med { color: var(--ink); border-color: rgba(216,230,245,0.5); font-weight: 700; }
        .lbl-ends .cy { color: var(--cyan); }
        .fan-legend { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 9); font-size: calc(var(--fs-xs) * 0.74); color: var(--dim); flex: 0 0 auto; }
        .fan-legend .sw { display: inline-block; width: calc(var(--u) * 12); height: calc(var(--u) * 5); margin-right: calc(var(--u) * 4); vertical-align: middle; }
        .fan-chips { display: flex; align-items: center; gap: calc(var(--u) * 5); flex: 0 0 auto; }
        .hz { background: rgba(10,20,35,0.8); border: 1px solid var(--stroke); color: var(--dim); font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.85); padding: calc(var(--u) * 3) calc(var(--u) * 8); cursor: pointer; }
        .hz:hover { color: var(--ink); border-color: var(--cyan); }
        .hz.on { color: #03130b; background: var(--cyan); border-color: var(--cyan); font-weight: 700; }
        .fan-note { font-size: calc(var(--fs-xs) * 0.74); letter-spacing: 0.04em; text-align: right; }
        @media (max-width: 1024px) {
          .fan-title { white-space: normal; }
          .fan-legend { font-size: calc(var(--fs-xs) * 0.8); }
        }
      `}</Style>
    </div>
  );
}

function buildFan(data: FanResp | null, hz: HZId, drift: number) {
  const W = 600, H = 170;
  const x0 = 30;
  const empty = {
    threads: [] as { d: string; color: string; w: number }[],
    area90: "", area50: "", median: "",
    x0, y0: H / 2, endMedian: H / 2, endP90: H / 2, endP10: H / 2,
  };
  if (!data) return empty;

  const q = data.implied[hz];
  const med = data.median[hz];

  const rets = data.analogs
    .map((a) => (hz === "d1" ? a.r1d : hz === "d7" ? a.r7d : a.r30d))
    .filter((r) => Number.isFinite(r));
  const sims = data.analogs.map((a) => a.sim);

  const lo = Math.min(q.p10, med, 0) - 0.01;
  const hi = Math.max(q.p90, med, 0) + 0.01;
  const y = (r: number) => H - 14 - ((r - lo) / (hi - lo || 1)) * (H - 28);

  const y0 = y(0);

  const threads = rets.map((r, i) => {
    const w = sims[i] ?? 0.5;
    const pts: string[] = [];
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const ease = 1 - Math.pow(1 - f, 2);
      const sway = Math.sin(f * 5 + i * 1.7 + drift) * (hi - lo) * 0.012 * f;
      pts.push(`${x0 + f * (W - x0 - 10)},${y(r * ease + sway)}`);
    }
    return { d: `M ${pts.join(" L ")}`, color: r >= 0 ? COLORS.bull : COLORS.bear, w };
  });

  const steps = 16;
  const p10Pts: string[] = [], p50Pts: string[] = [], p90Pts: string[] = [], medPts: string[] = [];
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const ease = 1 - Math.pow(1 - f, 2);
    const x = x0 + f * (W - x0 - 10);
    p10Pts.push(`${x},${y(q.p10 * ease)}`);
    p50Pts.push(`${x},${y(q.p50 * ease)}`);
    p90Pts.push(`${x},${y(q.p90 * ease)}`);
    medPts.push(`${x},${y(med * ease + Math.sin(f * 3 + drift) * (hi - lo) * 0.004)}`);
  }

  const area90 = `M ${p90Pts.join(" L ")} L ${p10Pts.slice().reverse().join(" L ")} Z`;

  const half = (q.p50 - q.p10) / 2 || 0.005;
  const up50: string[] = [], dn50: string[] = [];
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const ease = 1 - Math.pow(1 - f, 2);
    const x = x0 + f * (W - x0 - 10);
    up50.push(`${x},${y((q.p50 + half) * ease)}`);
    dn50.push(`${x},${y((q.p50 - half) * ease)}`);
  }
  const area50 = `M ${up50.join(" L ")} L ${dn50.slice().reverse().join(" L ")} Z`;

  return {
    threads,
    area90,
    area50,
    median: `M ${medPts.join(" L ")}`,
    x0,
    y0,
    endMedian: y(med),
    endP90: y(q.p90),
    endP10: y(q.p10),
  };
}
