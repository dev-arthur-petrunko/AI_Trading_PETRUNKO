"use client";

import { useEffect, useRef } from "react";
import { Style } from "@/components/Style";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useStore, apiGet } from "@/lib/store";
import { Panel } from "@/components/Panel";
import { COLORS, fmtCompact, fmtDate } from "@/lib/format";
import type { Candle } from "@/lib/types";

/** ИСТОРИЯ: deep history chart (1h / 1d / full span incl. CoinGecko fallback). */
export function HistoryView() {
  const { symbol, swapKey } = useStore();
  const holder = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [mode, setMode] = useMode();
  const [meta, setMeta] = useMeta();

  useEffect(() => {
    if (!holder.current) return;
    const chart = createChart(holder.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COLORS.dim,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: { vertLines: { color: "rgba(27,58,92,0.2)" }, horzLines: { color: "rgba(27,58,92,0.2)" } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(45,212,255,0.4)", width: 1, style: 3, labelBackgroundColor: "#1B3A5C" },
        horzLine: { color: "rgba(45,212,255,0.4)", width: 1, style: 3, labelBackgroundColor: "#1B3A5C" },
      },
      rightPriceScale: { borderColor: COLORS.stroke },
      timeScale: { borderColor: COLORS.stroke, timeVisible: true },
    });
    const area = chart.addAreaSeries({
      lineColor: COLORS.cyan,
      topColor: "rgba(45,212,255,0.35)",
      bottomColor: "rgba(45,212,255,0.02)",
      lineWidth: 2,
      priceLineColor: COLORS.amber,
    });
    chartRef.current = chart;
    lineRef.current = area;
    return () => {
      chart.remove();
      chartRef.current = null;
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    let dead = false;
    apiGet<{ candles: Candle[]; tf: string }>("/api/history", { symbol, q: mode })
      .then((r) => {
        if (dead || !lineRef.current) return;
        const c = r.candles || [];
        lineRef.current.setData(
          c.map((k) => ({ time: Math.floor(k.t / 1000) as UTCTimestamp, value: k.c })),
        );
        chartRef.current?.timeScale().fitContent();
        setMeta({
          count: c.length,
          from: c[0]?.t ?? 0,
          to: c[c.length - 1]?.t ?? 0,
          tf: r.tf,
          vol: c.reduce((s: number, k: Candle) => s + k.v, 0),
        });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [symbol, mode, swapKey, setMeta]);

  return (
    <div className="hs">
      <Panel
        title={`История ${symbol} · ${meta.tf === "deep" ? "полный период (биржа + CoinGecko)" : meta.tf + " свечи"}`}
        icon="⌸"
        delay={80}
        className="hs-main"
        right={
          <div className="modes">
            {(["1h", "1d", "deep"] as const).map((m) => (
              <button key={m} className={`mbtn ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>
                {m === "1h" ? "1Ч" : m === "1d" ? "1Д" : "ВСЯ"}
              </button>
            ))}
          </div>
        }
      >
        <div ref={holder} style={{ height: "100%" }} />
      </Panel>

      <Panel title="Статистика истории" icon="∑" delay={160} className="hs-stat">
        <div className="st mono">
          <Row k="Свечей" v={meta.count.toLocaleString("en-US")} />
          <Row k="Начало" v={meta.from ? fmtDate(meta.from) : "—"} />
          <Row k="Конец" v={meta.to ? fmtDate(meta.to) : "—"} />
          <Row k="Таймфрейм" v={meta.tf} />
          <Row k="Суммарный объём" v={meta.vol ? fmtCompact(meta.vol) : "—"} />
        </div>
        <p className="cap mono dim">
          Источник истории: Binance / Bybit REST (пагинация по 1000 свечей). Если у биржи данных мало —
          глубжё берём из CoinGecko (дневные свечи, без ключа). TradingView не парсится: его данные не используются.
        </p>
      </Panel>

      <Style>{`
        .hs { display: grid; grid-template-columns: repeat(12, 1fr); gap: calc(var(--u) * 8); flex: 1; min-height: 0; }
        .hs-main { grid-column: span 9; }
        .hs-stat { grid-column: span 3; }
        .modes { display: flex; gap: calc(var(--u) * 4); }
        .mbtn { background: rgba(10,20,35,0.8); border: 1px solid var(--stroke); color: var(--dim); font-family: "JetBrains Mono", monospace; font-size: var(--fs-xs); padding: calc(var(--u) * 3) calc(var(--u) * 9); cursor: pointer; }
        .mbtn:hover { color: var(--ink); border-color: var(--cyan); }
        .mbtn.on { color: #03130b; background: var(--cyan); border-color: var(--cyan); font-weight: 700; }
        .st { display: flex; flex-direction: column; gap: calc(var(--u) * 7); font-size: var(--fs-s); }
        .srow { display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(27,58,92,0.6); padding-bottom: calc(var(--u) * 4); }
        .srow .k { color: var(--dim); letter-spacing: 0.08em; }
        .srow .v { color: var(--ink); font-variant-numeric: tabular-nums; }
        .cap { font-size: calc(var(--fs-xs) * 0.88); line-height: 1.6; margin-top: calc(var(--u) * 12); border-left: 2px solid var(--amber); padding-left: calc(var(--u) * 8); }
        @media (max-width: 1024px) { .hs { display: flex; flex-direction: column; } .hs .panel { min-height: calc(var(--u) * 300); } }
      `}</Style>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="srow">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

// tiny local state helpers (useState wrappers with stable setters)
import { useState } from "react";
function useMode() {
  const [mode, setMode] = useState<"1h" | "1d" | "deep">("1d");
  return [mode, setMode] as const;
}
function useMeta() {
  const [meta, setMeta] = useState({ count: 0, from: 0, to: 0, tf: "1d", vol: 0 });
  return [meta, setMeta] as const;
}
