"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, apiGet } from "@/lib/store";
import { COLORS, fmtPct, md, monthKey } from "@/lib/format";
import type { Analog } from "@/lib/types";

type ListResp = {
  symbol: string;
  analogs: Analog[];
  windowLen: number;
  horizonDays: number;
  tf: string;
  t0: number;
  t1: number;
  current: number;
  currentT: number;
};

type DetailResp = { symbol: string; at: number; then: number[]; future: number[]; now: number[] };

/**
 * ANALOG TIMELINE: every month of history as a bar (similarity → brightness);
 * click a bar → lazy-fetch that window and overlay "тогда vs сейчас + что было дальше".
 * The heavy series never ships in the list call (kept ~4 KB per symbol).
 */
export function AnalogTimeline() {
  const { symbol, swapKey, forecast } = useStore();
  const [data, setData] = useState<ListResp | null>(null);
  const [picked, setPicked] = useState<Analog | null>(null);
  const [detail, setDetail] = useState<DetailResp | null>(null);

  useEffect(() => {
    let dead = false;
    apiGet<ListResp>("/api/analogs", { symbol, top: 50 })
      .then((r) => {
        if (dead) return;
        setData(r);
        setPicked(null);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [symbol, swapKey, forecast?.computedAt]);

  useEffect(() => {
    if (!picked) {
      setDetail(null);
      return;
    }
    let dead = false;
    apiGet<DetailResp>("/api/analogs", { symbol, at: picked.t })
      .then((r) => !dead && setDetail(r))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [picked, symbol]);

  const buckets = useMemo(() => buildBuckets(data), [data]);
  const overlay = useMemo(() => buildOverlay(picked, detail), [picked, detail]);

  return (
    <div className="atl">
      <div className="chart-wrap">
        <svg className="hist" viewBox="0 0 600 90" preserveAspectRatio="none">
          <defs>
            <linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={COLORS.cyan} stopOpacity="0.25" />
              <stop offset="100%" stopColor={COLORS.cyan} stopOpacity="1" />
            </linearGradient>
          </defs>
          {buckets.map((b, i) => (
            <rect
              key={i}
              x={b.x}
              y={90 - b.h}
              width={b.w}
              height={b.h}
              fill={b.sim > 0 ? "url(#barGrad)" : "rgba(27,58,92,0.55)"}
              opacity={b.sim > 0 ? 0.35 + b.sim * 0.65 : 0.5}
              className={b.sim > 0 ? "hit" : ""}
              onClick={() => b.analog && setPicked(b.analog)}
              style={{ cursor: b.analog ? "pointer" : "default" }}
            >
              <title>
                {b.label}
                {b.sim > 0 ? ` · схожесть ${(b.sim * 100).toFixed(0)}% · ${b.analog ? fmtPct(b.analog.r7d, 1) : ""}` : ""}
              </title>
            </rect>
          ))}
        </svg>
        <div className="axis mono">
          <span>{buckets[0]?.label ?? ""}</span>
          <span>{buckets[Math.floor(buckets.length / 2)]?.label ?? ""}</span>
          <span>{buckets[buckets.length - 1]?.label ?? ""}</span>
        </div>
      </div>

      {picked && detail && overlay && (
        <div className="overlay-box">
          <div className="ov-head mono">
            <span className="cy">НАЛОЖЕНИЕ: {picked.label} ↔ СЕЙЧАС</span>
            <span className="dim">
              схожесть {(picked.sim * 100).toFixed(0)}% · окно {data?.windowLen} свечей
            </span>
            <button className="x" onClick={() => setPicked(null)}>✕</button>
          </div>
          <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="ov-svg">
            <polyline points={overlay.thenPath} fill="none" stroke={COLORS.cyan} strokeWidth="1.5" />
            <polyline points={overlay.nowPath} fill="none" stroke={COLORS.ink} strokeWidth="1.5" strokeDasharray="4 3" />
            <polyline points={overlay.futurePath} fill="none" stroke={picked.r7d >= 0 ? COLORS.bull : COLORS.bear} strokeWidth="2" />
            <line x1={overlay.splitX} y1="4" x2={overlay.splitX} y2="116" stroke={COLORS.amber} strokeWidth="1" strokeDasharray="3 3" />
            <text x={overlay.splitX + 5} y="14" fill={COLORS.amber} fontSize="9" fontFamily="JetBrains Mono, monospace">
              t+0
            </text>
            <text x={596} y="14" fill={picked.r7d >= 0 ? COLORS.bull : COLORS.bear} fontSize="11" textAnchor="end" fontFamily="JetBrains Mono, monospace">
              {fmtPct(picked.r7d, 1)} за 7д
            </text>
          </svg>
          <div className="ov-legend mono dim">
            <span><i style={{ background: COLORS.cyan }} /> тогда (сплошная)</span>
            <span><i style={{ background: COLORS.ink }} /> сейчас (пунктир)</span>
            <span><i style={{ background: picked.r7d >= 0 ? COLORS.bull : COLORS.bear }} /> что было дальше</span>
          </div>
        </div>
      )}

      <style>{`
        .atl { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: calc(var(--u) * 6); }
        .chart-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .hist { flex: 1; min-height: 0; width: 100%; }
        .hist .hit:hover { filter: brightness(1.6) drop-shadow(0 0 4px ${COLORS.cyan}); }
        .axis { display: flex; justify-content: space-between; font-size: calc(var(--fs-xs) * 0.8); color: var(--dim); letter-spacing: 0.08em; margin-top: calc(var(--u) * 3); }
        .overlay-box { flex: 0 0 auto; border-top: 1px dashed rgba(27,58,92,0.9); padding-top: calc(var(--u) * 5); }
        .ov-head { display: flex; gap: calc(var(--u) * 10); align-items: center; font-size: calc(var(--fs-xs) * 0.9); letter-spacing: 0.08em; }
        .ov-head .x { margin-left: auto; background: none; border: 1px solid var(--stroke); color: var(--dim); cursor: pointer; font-size: 10px; padding: 1px 6px; }
        .ov-head .x:hover { color: var(--bear); border-color: var(--bear); }
        .ov-svg { width: 100%; height: calc(var(--u) * 90); margin-top: calc(var(--u) * 5); background: rgba(5,10,18,0.5); }
        .ov-legend { display: flex; gap: calc(var(--u) * 12); font-size: calc(var(--fs-xs) * 0.8); }
        .ov-legend i { display: inline-block; width: calc(var(--u) * 10); height: 3px; margin-right: 5px; vertical-align: middle; }
      `}</style>
    </div>
  );
}

type Bucket = { x: number; w: number; h: number; sim: number; label: string; analog: Analog | null };

function buildBuckets(data: ListResp | null): Bucket[] {
  if (!data || !data.analogs?.length || !data.t0 || !data.t1) return [];
  const BUCKETS = 64;
  const t0 = data.t0;
  const t1 = data.t1;
  const span = t1 - t0 || 1;
  const out: Bucket[] = [];
  const step = 600 / BUCKETS;
  for (let i = 0; i < BUCKETS; i++) {
    const bt0 = t0 + (i / BUCKETS) * span;
    const bt1 = t0 + ((i + 1) / BUCKETS) * span;
    let best: Analog | null = null;
    for (const a of data.analogs) {
      if (a.t >= bt0 && a.t < bt1) if (!best || a.sim > best.sim) best = a;
    }
    const sim = best?.sim ?? 0;
    out.push({
      x: i * step,
      w: Math.max(1.5, step - 1.5),
      h: sim > 0 ? 14 + sim * 74 : 6,
      sim,
      label: best ? best.label : md(bt0),
      analog: best,
    });
  }
  return out;
}

function buildOverlay(picked: Analog | null, detail: DetailResp | null) {
  if (!picked || !detail || detail.then?.length < 3 || !detail.future?.length) return null;
  const thenR = detail.then.map((c) => c / detail.then[0] - 1);
  const nowR = (detail.now ?? []).map((c) => c / (detail.now[0] || 1) - 1);
  const fBase = detail.then[detail.then.length - 1] || 1;
  const futureR = detail.future.map((c) => c / fBase - 1);

  const all = [...thenR, ...nowR, ...futureR, 0];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 0.01;
  const y = (v: number) => 116 - ((v - (lo - pad)) / (hi + lo ? hi + pad - (lo - pad) : 1)) * 112;

  const toPts = (vals: number[], x0: number, x1: number) =>
    vals.map((v, i) => `${x0 + (i / Math.max(1, vals.length - 1)) * (x1 - x0)},${y(v)}`).join(" ");

  const splitX = 400;
  return {
    thenPath: toPts(thenR, 10, splitX),
    nowPath: nowR.length > 1 ? toPts(nowR, 10, splitX) : "",
    futurePath: futureR.length > 1 ? toPts(futureR, splitX, 590) : "",
    splitX,
  };
}
