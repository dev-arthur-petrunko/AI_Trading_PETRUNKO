"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Style } from "@/components/Style";
import { RollNumber } from "@/components/RollNumber";
import { fmtPrice, fmtCompact, fmtPct } from "@/lib/format";

/**
 * HERO PRICE STRIP (ТЗ v3 §B5): одна горизонтальная лента вместо панели Price —
 *   BTC/USDT 59,871.64 ▼2.20%  VOL $1.20B  H 61.4k  L 58.9k
 * Split-flap троттлится: тики чаще 400 мс выводятся БЕЗ анимации колонок.
 */
export function HeroStrip() {
  const { symbol, stat, connected } = useStore();
  const up = (stat?.chg ?? 0) >= 0;

  // троттлинг split-flap: если обновления идут чаще 400 мс — колонки не «крутятся»
  const [fast, setFast] = useState(false);
  const lastTick = useRef(0);
  const fastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (now - lastTick.current < 400 && stat?.price !== undefined) {
      setFast(true);
      if (fastTimer.current) clearTimeout(fastTimer.current);
      fastTimer.current = setTimeout(() => setFast(false), 500);
    }
    lastTick.current = now;
    return () => {
      if (fastTimer.current) clearTimeout(fastTimer.current);
    };
  }, [stat?.price]);

  return (
    <div className="hstrip mono">
      <span className="sym head-font">
        {symbol}<span className="dim">/USDT</span>
      </span>
      <RollNumber
        value={stat?.price ?? 0}
        format={(v) => (v ? fmtPrice(v, symbol) : "—")}
        className={`hprice ${up ? "glow-bull" : "glow-bear"}${fast ? " fast" : ""}`}
      />
      <span className={`chg ${up ? "bull" : "bear"}`} data-prio="1">
        {up ? "▲" : "▼"}{Math.abs(stat?.chg ?? 0).toFixed(2)}%
      </span>
      <span className="dim" data-prio="2">VOL ${fmtCompact(stat?.vol)}</span>
      <span className="dim" data-prio="2">H {fmtPrice(stat?.high, symbol)}</span>
      <span className="dim" data-prio="3">L {fmtPrice(stat?.low, symbol)}</span>
      <span className={`src ${connected ? "cy" : "amber"}`}>{connected ? "● LIVE" : "○ SYNC"}</span>
      <Style>{`
        .hstrip {
          display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap;
          gap: calc(var(--u) * 14); padding: calc(var(--u) * 6) calc(var(--u) * 12);
          border-top: 1px solid rgba(27,58,92,0.5); border-bottom: 1px solid rgba(27,58,92,0.5);
          font-size: var(--fs-s); letter-spacing: 0.06em;
        }
        .hstrip .sym { font-size: var(--fs-m); font-weight: 700; letter-spacing: 0.14em; }
        .hstrip .hprice { font-size: clamp(28px, 3.2vw, 56px); font-weight: 700; line-height: 1; }
        /* ячейка цифры фиксированной высоты 1em + троттл без анимации (§B5) */
        .hstrip .hprice.fast .roll .strip { transition-duration: 0.01s; }
        .hstrip .chg { font-weight: 700; }
        .hstrip .src { font-size: var(--fs-xs); letter-spacing: 0.1em; }
        @container (max-width: 0px) { .hstrip { justify-content: flex-start; } }
      `}</Style>
    </div>
  );
}
