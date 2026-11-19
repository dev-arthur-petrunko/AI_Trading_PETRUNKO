"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, apiGet } from "@/lib/store";
import { COLORS, fmtPct } from "@/lib/format";
import type { Candle } from "@/lib/types";

type FanResp = {
  symbol: string;
  error?: string;
  current: number;
  implied: { d1: { p10: number; p50: number; p90: number }; d7: { p10: number; p50: number; p90: number }; d30: { p10: number; p50: number; p90: number } };
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
  { id: "d1", label: "24Ч" },
  { id: "d7", label: "7Д" },
  { id: "d30", label: "30Д" },
] as const;

/** FORECAST FAN: hundreds of analog trajectories fanning out from the current price. */
export function ForecastFan() {
  const { symbol, swapKey, forecast, reduced } = useStore();
  const [data, setData] = useState<FanResp | null>(null);
  const [hz, setHz] = useState<"d1" | "d7" | "d30">("d7");
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

  // gentle Perlin-ish sway of the whole fan (disabled in eco mode)
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

  return (
    <div className="fan">
      <div className="fan-bar">
        {HZ.map((h) => (
          <button key={h.id} className={`hz ${hz === h.id ? "on" : ""}`} onClick={() => setHz(h.id)}>
            {h.label}
          </button>
        ))}
        <span className="grow" />
        <span className="mono probs">
          <b className="bull">↑{(data.probUp * 100).toFixed(0)}%</b>
          <b className="dim">={(data.probFlat * 100).toFixed(0)}%</b>
          <b className="bear">↓{(data.probDown * 100).toFixed(0)}%</b>
        </span>
      </div>

      <svg viewBox="0 0 600 170" preserveAspectRatio="none" className="fan-svg">
        <defs>
          <linearGradient id="band90" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={COLORS.cyan} stopOpacity="0.05" />
            <stop offset="100%" stopColor={COLORS.cyan} stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id="band50" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.06" />
            <stop offset="100%" stopColor={COLORS.amber} stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* 90% zone */}
        <path d={geo.area90} fill="url(#band90)" stroke="none" />
        {/* 50% zone */}
        <path d={geo.area50} fill="url(#band50)" stroke="none" />
        {/* trajectory threads */}
        {geo.threads.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth="0.8"
            opacity={0.1 + p.w * 0.35}
          />
        ))}
        {/* median */}
        <path d={geo.median} fill="none" stroke={COLORS.ink} strokeWidth="2" />
        {/* current price marker */}
        <circle cx={geo.x0} cy={geo.y0} r="3" fill={COLORS.cyan} />
        <line x1={geo.x0} y1={geo.y0} x2={geo.x0} y2="166" stroke={COLORS.cyan} strokeWidth="0.5" strokeDasharray="2 3" />
        <text x={geo.x0 + 6} y={geo.y0 - 6} fill={COLORS.cyan} fontSize="10" fontFamily="JetBrains Mono, monospace">
          {data.current > 0 ? data.current.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
        </text>
        {/* end labels */}
        <text x="596" y={geo.endMedian + 12} fill={COLORS.ink} fontSize="10" textAnchor="end" fontFamily="JetBrains Mono, monospace">
          {fmtPct(data.median[hz], 1)}
        </text>
        <text x="596" y={geo.endP90 - 3} fill={COLORS.cyan} fontSize="8" textAnchor="end" fontFamily="JetBrains Mono, monospace">
          90%: {fmtPct(data.implied[hz].p90, 1)}
        </text>
        <text x="596" y={geo.endP10 + 9} fill={COLORS.cyan} fontSize="8" textAnchor="end" fontFamily="JetBrains Mono, monospace">
          10%: {fmtPct(data.implied[hz].p10, 1)}
        </text>
      </svg>

      <div className="fan-note mono dim">
        медиана {fmtPct(data.median[hz], 1)} · 50% зона [{fmtPct(data.implied[hz].p50, 1)}] · аналогов {data.analogs.length} · пересчёт {new Date(data.computedAt).toLocaleTimeString("ru-RU")}
      </div>

      <style>{`
        .fan { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: calc(var(--u) * 4); }
        .fan-empty { color: var(--dim); font-size: var(--fs-xs); display: flex; align-items: center; justify-content: center; height: 100%; }
        .fan-bar { display: flex; align-items: center; gap: calc(var(--u) * 5); flex: 0 0 auto; }
        .hz { background: rgba(10,20,35,0.8); border: 1px solid var(--stroke); color: var(--dim); font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.9); padding: calc(var(--u) * 3) calc(var(--u) * 8); cursor: pointer; }
        .hz:hover { color: var(--ink); border-color: var(--cyan); }
        .hz.on { color: #03130b; background: var(--cyan); border-color: var(--cyan); font-weight: 700; }
        .grow { flex: 1; }
        .probs { font-size: calc(var(--fs-xs) * 0.95); display: flex; gap: calc(var(--u) * 8); }
        .fan-svg { flex: 1; min-height: 0; width: 100%; background: rgba(5,10,18,0.45); }
        .fan-note { font-size: calc(var(--fs-xs) * 0.82); letter-spacing: 0.05em; flex: 0 0 auto; }
      `}</style>
    </div>
  );
}

function buildFan(data: FanResp | null, hz: "d1" | "d7" | "d30", drift: number) {
  const W = 600, H = 170;
  const x0 = 30;
  const empty = { threads: [], area90: "", area50: "", median: "", x0, y0: H / 2, endMedian: H / 2, endP90: H / 2, endP10: H / 2 };
  if (!data) return empty;

  const cur = data.current || 1;
  const q = data.implied[hz];
  const med = data.median[hz];

  const rets = data.analogs.map((a) => (hz === "d1" ? a.r1d : hz === "d7" ? a.r7d : a.r30d)).filter((r) => Number.isFinite(r));
  const sims = data.analogs.map((a) => a.sim).filter(() => true);

  const lo = Math.min(q.p10, med, 0) - 0.01;
  const hi = Math.max(q.p90, med, 0) + 0.01;
  const y = (r: number) => H - 14 - ((r - lo) / (hi - lo || 1)) * (H - 28);

  const y0 = y(0);
  const N = Math.max(6, rets.length);

  // threads: each analog = one thread (weight by similarity)
  const threads = rets.map((r, i) => {
    const w = sims[i] ?? 0.5;
    const pts: string[] = [];
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const ease = 1 - Math.pow(1 - f, 2);
      const sway = Math.sin(f * 5 + i * 1.7 + drift) * (hi - lo) * 0.012 * f;
      const v = r * ease + sway;
      pts.push(`${x0 + f * (W - x0 - 10)},${y(v)}`);
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
  const area50 = `M ${p50Pts.slice().reverse().join(" L ")}`; // placeholder replaced below

  // 50% band = between p25-ish and p75; approximate with ±(p50-p10)/2
  const half = ((q.p50 - q.p10) / 2) || 0.005;
  const up50: string[] = [], dn50: string[] = [];
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const ease = 1 - Math.pow(1 - f, 2);
    const x = x0 + f * (W - x0 - 10);
    up50.push(`${x},${y((q.p50 + half) * ease)}`);
    dn50.push(`${x},${y((q.p50 - half) * ease)}`);
  }
  const area50Real = `M ${up50.join(" L ")} L ${dn50.slice().reverse().join(" L ")} Z`;
  void area50;

  return {
    threads: threads.slice(0, N),
    area90,
    area50: area50Real,
    median: `M ${medPts.join(" L ")}`,
    x0,
    y0,
    endMedian: y(med),
    endP90: y(q.p90),
    endP10: y(q.p10),
  };
}
