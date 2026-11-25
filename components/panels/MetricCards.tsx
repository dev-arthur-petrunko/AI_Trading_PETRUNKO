"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Style } from "@/components/Style";
import { useStore } from "@/lib/store";
import { ArcCard } from "@/components/ArcCard";
import { COLORS, fmtPct, fmtNum } from "@/lib/format";

type MetricDef = {
  key: string;
  label: string;
  accent: string;
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

/** METRICS как 6 карточек-спутников левой дуги орбиты (ТЗ v3 §B2):
 *  каждая метрика — отдельная ArcCard (280u×84u, акцент слева, спарклайн снизу).
 *  RECEIVE публикации ядра (`aps-out`): карточки вспыхивают + чип «◄ ИЗ ЯДРА». */
export function MetricCards() {
  const { forecast, candles, symbol, fng, t } = useStore();
  const series = useMemo(() => candles.map((c) => c.c), [candles]);

  // incoming publication from the neural sphere
  const [core, setCore] = useState<{ at: number; label: string } | null>(null);
  const coreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onOut = (e: Event) => {
      const d = (e as CustomEvent).detail as { label?: string };
      if (!d?.label) return;
      const at = Date.now();
      setCore({ at, label: d.label });
      if (coreTimer.current) clearTimeout(coreTimer.current);
      coreTimer.current = setTimeout(() => setCore((c) => (c && c.at === at ? null : c)), 3400);
    };
    window.addEventListener("aps-out", onOut);
    return () => {
      window.removeEventListener("aps-out", onOut);
      if (coreTimer.current) clearTimeout(coreTimer.current);
    };
  }, []);
  const lit = !!core;

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
      accent: "#19F58A",
      label: t("m.prob"),
      value: (c) => `${(c.probUp * 100).toFixed(1)}%`,
      bar: (c) => c.probUp,
      tone: (c) => (c.probUp >= 0.5 ? COLORS.bull : COLORS.bear),
      spark: (c) => c.history.slice(-60),
    },
    {
      key: "conf",
      accent: "#2DD4FF",
      label: t("m.conf"),
      value: (c) => `${(c.confidence * 100).toFixed(0)}%`,
      bar: (c) => c.confidence,
      tone: (c) => (c.confidence >= 0.15 ? COLORS.cyan : COLORS.amber),
      spark: (c) => c.history.slice(-60),
    },
    {
      key: "rsi",
      accent: "#8A7BFF",
      label: "RSI 14",
      value: (c) => fmtNum(c.rsi, 1),
      bar: (c) => c.rsi / 100,
      tone: (c) => (c.rsi > 70 ? COLORS.amber : c.rsi < 30 ? COLORS.cyan : COLORS.ink),
      spark: () => rsiSeries.slice(-60),
    },
    {
      key: "macd",
      accent: "#FFB020",
      label: "MACD HIST",
      value: (c) => fmtPct(c.macdHist / Math.max(1e-9, c.history.at(-1) ?? 1), 3),
      bar: (c) => Math.min(1, Math.abs(c.macdHist) / Math.max(1e-9, (c.history.at(-1) ?? 1) * 0.004)),
      tone: (c) => (c.macdHist >= 0 ? COLORS.bull : COLORS.bear),
      spark: () => macdHistSeries.slice(-60),
    },
    {
      key: "vol",
      accent: "#FF7A45",
      label: t("m.vol"),
      value: (c) => `${c.volatility.toFixed(1)}%`,
      bar: (c) => Math.min(1, c.volatility / 150),
      tone: () => COLORS.amber,
      spark: () => volSeries.slice(-60),
    },
    {
      key: "funding",
      accent: "#7FE0FF",
      label: t("m.funding"),
      value: (c) => (c.funding !== undefined ? `${(c.funding * 100).toFixed(4)}%` : "—"),
      bar: (c) => Math.min(1, Math.abs(c.funding ?? 0) / 0.0005),
      tone: (c) => ((c.funding ?? 0) >= 0 ? COLORS.bear : COLORS.bull),
      spark: () => fundingSpark(forecast?.micro?.funding, symbol),
    },
  ];

  return (
    <>
      {core && (
        <span className={`from-core mono ${lit ? "lit" : ""}`} key={core.at}>◄ ИЗ ЯДРА: {core.label}</span>
      )}
      {metrics.map((m, i) => {
        const tone = m.tone(ctx);
        return (
          <ArcCard
            key={m.key}
            id={`mc-${m.key}`}
            className={`ml-${i + 1} mc-${m.key}`}
            label={m.label}
            sub={m.key === "prob" && fng ? `F&G ${fng.value} · ${fng.label}` : undefined}
            accent={m.accent}
            value={m.value(ctx)}
            valueTone={tone}
            spark={<Spark values={m.spark(ctx)} color={tone} />}
          />
        );
      })}
      <Style>{`
        /* карточки-спутники лежат в сетке HERO напрямую (ячейки ml-1..6 заданы классом) */
        .dash-grid .ml-1 { grid-column: 1 / span 2; grid-row: 1; }
        .dash-grid .ml-2 { grid-column: 1 / span 2; grid-row: 2; }
        .dash-grid .ml-3 { grid-column: 1 / span 2; grid-row: 3; }
        .dash-grid .ml-4 { grid-column: 1 / span 2; grid-row: 4; }
        .dash-grid .ml-5 { grid-column: 1 / span 2; grid-row: 5; }
        .dash-grid .ml-6 { grid-column: 1 / span 2; grid-row: 6; }
        /* чип «ИЗ ЯДРА» — маленьким тегом над шапкой первой карточки (§B4) */
        .from-core {
          position: absolute; top: calc(var(--u) * -10); left: 0; z-index: 3;
          font-size: calc(var(--fs-xs) * 0.78); letter-spacing: 0.08em;
          color: var(--cyan); background: rgba(5,10,18,0.92);
          border: 1px solid var(--cyan); padding: calc(var(--u) * 2) calc(var(--u) * 6);
          text-shadow: 0 0 calc(var(--u) * 6) rgba(45,212,255,0.7);
          animation: coreChip 3.4s ease both; pointer-events: none; white-space: nowrap;
          width: fit-content;
        }
        @keyframes coreChip { 0% { opacity: 0; transform: translateX(14px); } 12% { opacity: 1; transform: none; } 84% { opacity: 1; } 100% { opacity: 0; } }
        .from-core + .mc-sat { animation: cardLit 1s ease both; }
        @keyframes cardLit {
          0% { border-color: var(--cyan); box-shadow: 0 0 calc(var(--u) * 12) rgba(45,212,255,0.3); }
          100% { box-shadow: none; }
        }
        @media (max-width: 1099px), (orientation: portrait) and (max-width: 1499px), (max-width: 699px) {
          .dash-grid .ml-1, .dash-grid .ml-2, .dash-grid .ml-3,
          .dash-grid .ml-4, .dash-grid .ml-5, .dash-grid .ml-6 { grid-column: auto; grid-row: auto; }
        }
      `}</Style>
    </>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 240;
  const h = 18;
  if (!values || values.length < 2) return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" opacity="0.9" vectorEffect="non-scaling-stroke" />
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
