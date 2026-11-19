"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Style } from "@/components/Style";
import { useStore } from "@/lib/store";
import { COLORS, fmtPct, fmtNum } from "@/lib/format";

type MetricDef = {
  key: string;
  label: string;
  value: (ctx: Ctx) => string;
  bar: (ctx: Ctx) => number; // 0..1 fill
  tone: (ctx: Ctx) => string;
  spark: (ctx: Ctx) => number[];
};

type Ctx = {
  probUp: number;
  confidence: number;
  rsi: number;
  macdHist: number;
  volatility: number;
  funding: number | undefined;
  history: number[];
};

/** Left column: metric cards with live sparklines. */
export function MetricCards() {
  const { forecast, candles, symbol, fng } = useStore();
  const series = useMemo(() => candles.map((c) => c.c), [candles]);

  // derive lightweight series indicators locally (fast, reactive to every tick)
  const rsiSeries = useMemo(() => rsiCalc(series, 14), [series]);
  const macdHistSeries = useMemo(() => macdHistCalc(series), [series]);
  const volSeries = useMemo(() => volCalc(series), [series]);

  const ctx: Ctx = {
    probUp: forecast?.probUp ?? 0.5,
    confidence: forecast?.confidence ?? 0,
    rsi: rsiSeries.at(-1) ?? 50,
    macdHist: macdHistSeries.at(-1) ?? 0,
    volatility: volSeries.at(-1) ?? 0,
    funding: forecast?.micro?.funding,
    history: series,
  };

  const metrics: MetricDef[] = [
    {
      key: "prob",
      label: "ВЕРОЯТНОСТЬ РОСТА",
      value: (c) => `${(c.probUp * 100).toFixed(1)}%`,
      bar: (c) => c.probUp,
      tone: (c) => (c.probUp >= 0.5 ? COLORS.bull : COLORS.bear),
      spark: (c) => c.history.slice(-60),
    },
    {
      key: "conf",
      label: "УВЕРЕННОСТЬ МОДЕЛИ",
      value: (c) => `${(c.confidence * 100).toFixed(0)}%`,
      bar: (c) => c.confidence,
      tone: (c) => (c.confidence >= 0.15 ? COLORS.cyan : COLORS.amber),
      spark: (c) => c.history.slice(-60),
    },
    {
      key: "rsi",
      label: "RSI 14",
      value: (c) => fmtNum(c.rsi, 1),
      bar: (c) => c.rsi / 100,
      tone: (c) => (c.rsi > 70 ? COLORS.amber : c.rsi < 30 ? COLORS.cyan : COLORS.ink),
      spark: () => rsiSeries.slice(-60),
    },
    {
      key: "macd",
      label: "MACD HIST",
      value: (c) => fmtPct(c.macdHist / Math.max(1e-9, c.history.at(-1) ?? 1), 3),
      bar: (c) => Math.min(1, Math.abs(c.macdHist) / Math.max(1e-9, (c.history.at(-1) ?? 1) * 0.004)),
      tone: (c) => (c.macdHist >= 0 ? COLORS.bull : COLORS.bear),
      spark: () => macdHistSeries.slice(-60),
    },
    {
      key: "vol",
      label: "ВОЛАТИЛЬНОСТЬ (30д)",
      value: (c) => `${c.volatility.toFixed(1)}%`,
      bar: (c) => Math.min(1, c.volatility / 150),
      tone: () => COLORS.amber,
      spark: () => volSeries.slice(-60),
    },
    {
      key: "funding",
      label: "FUNDING RATE",
      value: (c) => (c.funding !== undefined ? `${(c.funding * 100).toFixed(4)}%` : "—"),
      bar: (c) => Math.min(1, Math.abs(c.funding ?? 0) / 0.0005),
      tone: (c) => ((c.funding ?? 0) >= 0 ? COLORS.bear : COLORS.bull),
      spark: () => fundingSpark(forecast?.micro?.funding, symbol),
    },
  ];

  return (
    <div className="metrics">
      {metrics.map((m) => {
        const t = m.tone(ctx);
        return (
          <div className="mcard" key={m.key}>
            <div className="mrow">
              <span className="mlabel">{m.label}</span>
              <span className="mval mono" style={{ color: t, textShadow: `0 0 calc(var(--u)*8) ${t}55` }}>
                {m.value(ctx)}
              </span>
            </div>
            <div className="mbar">
              <div className="mfill" style={{ width: `${Math.max(2, Math.min(100, m.bar(ctx) * 100))}%`, background: t }} />
            </div>
            <Spark values={m.spark(ctx)} color={t} />
            {m.key === "prob" && fng && (
              <div className="fnote mono dim">F&G {fng.value} · {fng.label}</div>
            )}
          </div>
        );
      })}
      <Style>{`
        .metrics { display: flex; flex-direction: column; gap: calc(var(--u) * 7); height: 100%; overflow: hidden; }
        .mcard { border-left: calc(var(--u) * 3) solid var(--stroke); padding: calc(var(--u) * 4) calc(var(--u) * 8); background: rgba(5,10,18,0.35); }
        .mrow { display: flex; justify-content: space-between; align-items: baseline; gap: calc(var(--u) * 6); }
        .mlabel { font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.82); color: var(--dim); letter-spacing: 0.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mval { font-size: var(--fs-m); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .mbar { height: calc(var(--u) * 4); background: rgba(27,58,92,0.4); margin-top: calc(var(--u) * 3); overflow: hidden; }
        .mfill { height: 100%; transition: width 0.6s ease; }
        .fnote { font-size: calc(var(--fs-xs) * 0.8); margin-top: calc(var(--u) * 3); letter-spacing: 0.06em; }
        .spark { display: block; margin-top: calc(var(--u) * 3); }
      `}</Style>
    </div>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const w = 60;
  const h = 20;

  useEffect(() => {
    // smooth scroll illusion: nothing to do — data shifts every tick, svg re-renders
  }, [values]);

  if (!values || values.length < 2) return <svg className="spark" width={w} height={h} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(" ");

  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} ref={ref}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" opacity="0.9" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`${color}22`} stroke="none" />
    </svg>
  );
}

// --- local indicator math (mirrors lib/analyze.ts, tiny windows → cheap) ---

function rsiCalc(v: number[], p = 14): number[] {
  const out: number[] = [];
  let g = 0, l = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (i <= p) {
      if (d >= 0) g += d; else l -= d;
      if (i === p) out.push(100 - 100 / (1 + (g / p) / (l / p || 1e-9)));
    } else {
      g = (g * (p - 1) + Math.max(d, 0)) / p;
      l = (l * (p - 1) + Math.max(-d, 0)) / p;
      out.push(100 - 100 / (1 + g / (l || 1e-9)));
    }
  }
  return out;
}

function ema(v: number[], p: number): number[] {
  const k = 2 / (p + 1);
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < v.length; i++) {
    prev = i === 0 ? v[0] : v[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function macdHistCalc(v: number[]): number[] {
  if (v.length < 35) return [];
  const f = ema(v, 12), s = ema(v, 26);
  const line = f.map((x, i) => x - s[i]);
  const sig = ema(line, 9);
  return line.map((x, i) => x - sig[i]);
}

function volCalc(v: number[]): number[] {
  const out: number[] = [];
  const p = 24 * 7;
  for (let i = p + 1; i <= v.length; i++) {
    const s = v.slice(i - p, i);
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
    out.push((sd / (m || 1)) * Math.sqrt(365 * 24) * 100);
  }
  return out;
}

function fundingSpark(funding: number | undefined, _symbol: string): number[] {
  const base = funding ?? 0;
  // synthetic micro-drift around the current funding (display aid only)
  return Array.from({ length: 30 }, (_, i) => base * (1 + 0.35 * Math.sin(i / 3) + (i / 30) * 0.3));
}
