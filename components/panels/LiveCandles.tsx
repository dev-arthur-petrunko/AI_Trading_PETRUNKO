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
import { useStore } from "@/lib/store";
import type { Candle } from "@/lib/types";
import { COLORS } from "@/lib/format";

const TFS = ["1m", "5m", "1h", "1d"] as const;

/** LIVE CANDLES: real-time Japanese candlesticks with a breathing last bar. */
export function LiveCandles({ compact = false }: { compact?: boolean }) {
  const { candles, tf, setTf, symbol, swapKey, reduced } = useStore();
  const holder = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCount = useRef(0);

  // create chart once
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
      grid: {
        vertLines: { color: "rgba(27,58,92,0.25)" },
        horzLines: { color: "rgba(27,58,92,0.25)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(45,212,255,0.4)", width: 1, style: 3, labelBackgroundColor: "#1B3A5C" },
        horzLine: { color: "rgba(45,212,255,0.4)", width: 1, style: 3, labelBackgroundColor: "#1B3A5C" },
      },
      rightPriceScale: { borderColor: COLORS.stroke, scaleMargins: { top: 0.12, bottom: 0.14 } }, // price axis keeps default width; rightOffset below reserves label space (Exercise D)
      timeScale: {
        borderColor: COLORS.stroke,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: compact ? 6 : 8,
      },
      handleScale: { axisPressedMouseMove: { price: false } },
    });
    const series = chart.addCandlestickSeries({
      upColor: COLORS.bull,
      downColor: COLORS.bear,
      borderUpColor: COLORS.bull,
      borderDownColor: COLORS.bear,
      wickUpColor: "rgba(25,245,138,0.85)",
      wickDownColor: "rgba(255,59,92,0.85)",
      priceLineColor: COLORS.cyan,
      priceLineWidth: 1,
      priceLineStyle: 2,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [compact]);

  // data (full replace on symbol/tf change, incremental afterwards)
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    if (!candles.length) {
      s.setData([]);
      lastCount.current = 0;
      return;
    }
    const data = candles.map((c) => ({
      time: Math.floor(c.t / 1000) as UTCTimestamp,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));
    // symbol/tf switch → full reload (swapKey in deps)
    if (candles.length !== lastCount.current + 1 || lastCount.current === 0 || Math.abs(candles.length - lastCount.current) > 2) {
      s.setData(data);
      chartRef.current?.timeScale().scrollToRealTime();
    } else {
      s.update(data[data.length - 1]);
    }
    lastCount.current = candles.length;
  }, [candles, swapKey, tf, symbol]);

  // breathing last candle: 1 Hz price-line pulse (cheap, no per-frame API churn)
  useEffect(() => {
    if (reduced) return;
    let on = false;
    const t = setInterval(() => {
      const s = seriesRef.current;
      if (!s) return;
      on = !on;
      try {
        s.applyOptions({ priceLineWidth: on ? 2 : 1 });
      } catch {}
    }, 950);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <div className="candles-wrap">
      <div className="tf-bar">
        {TFS.map((t) => (
          <button key={t} className={`tf-btn ${tf === t ? "on" : ""}`} onClick={() => setTf(t)}>
            {t}
          </button>
        ))}
        <span className="grow" />
        <span className="mono cnt">{candles.length} свечей</span>
      </div>
      <div className="chart" ref={holder} />
      <Style>{`
        .candles-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .tf-bar { display: flex; gap: calc(var(--u) * 4); align-items: center; flex: 0 0 auto; margin-bottom: calc(var(--u) * 4); }
        .tf-btn {
          background: rgba(10,20,35,0.8); border: 1px solid var(--stroke); color: var(--dim);
          font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.9);
          padding: calc(var(--u) * 3) calc(var(--u) * 8); cursor: pointer; transition: all 0.15s;
        }
        .tf-btn:hover { color: var(--ink); border-color: var(--cyan); }
        .tf-btn.on { color: #03130b; background: var(--cyan); border-color: var(--cyan); font-weight: 700; }
        .grow { flex: 1; }
        .cnt { font-size: calc(var(--fs-xs) * 0.85); color: var(--dim); }
        .chart { flex: 1; min-height: 0; }
      `}</Style>
    </div>
  );
}
