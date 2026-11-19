"use client";

import { useEffect, useRef } from "react";

/** Official TradingView Advanced Chart widget (allowed embed; data is NOT parsed). */
export function TradingViewWidget({ symbol = "BINANCE:BTCUSDT" }: { symbol?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container";
    inner.style.height = "100%";
    const child = document.createElement("div");
    child.className = "tradingview-widget-container__widget";
    child.style.height = "100%";
    inner.appendChild(child);
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.async = true;
    s.type = "text/javascript";
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "ru_RU",
      backgroundColor: "rgba(5, 10, 18, 1)",
      gridColor: "rgba(27, 58, 92, 0.35)",
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      studies: ["STD;RSI", "STD;Volume"],
      support_host: "https://www.tradingview.com",
    });
    inner.appendChild(s);
    el.appendChild(inner);
    return () => {
      el.innerHTML = "";
    };
  }, [symbol]);

  return <div ref={ref} style={{ height: "100%", width: "100%" }} />;
}
