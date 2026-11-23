"use client";

import { useMemo, useState } from "react";
import { Style } from "@/components/Style";
import { useStore } from "@/lib/store";
import { COLORS, fmtPct, fmtQty, hms } from "@/lib/format";

/** EXECUTION TAPE: last trades streaming in, buys green / sells red, flashes on entry. */
export function ExecutionTape({ max = 8 }: { max?: number }) {
  const { events, symbol } = useStore();

  const rows = useMemo(
    () => events.filter((e) => (e.kind === "trade" || e.kind === "whale") && e.price).slice(0, max),
    [events, max],
  );

  return (
    <div className="tape">
      <div className="thead mono">
        <span>ВРЕМЯ</span>
        <span>ЦЕНА</span>
        <span>ОБЪЁМ</span>
        <span>$</span>
        <span>СТОРОНА</span>
      </div>
      <div className="tbody scroll-thin">
        {rows.length === 0 && <div className="empty mono">ожидание сделок…</div>}
        {rows.map((e, i) => {
          const buy = e.side === "buy";
          const color = buy ? COLORS.bull : COLORS.bear;
          return (
            <div className={`trow feed-row ${i > 5 ? "faded" : ""}`} key={e.id} style={{ color }}>
              <span className="dim">{hms(e.t)}</span>
              <span className="mono">{e.price!.toLocaleString("en-US", { maximumFractionDigits: 5 })}</span>
              <span className="mono">{fmtQty(e.qty)}</span>
              <span className="mono dim">{compact(e.usd ?? 0)}</span>
              <span className="side">{buy ? "BUY ▲" : "SELL ▼"}</span>
            </div>
          );
        })}
      </div>
      <Style>{`
        .tape { display: flex; flex-direction: column; height: 100%; min-height: 0; font-family: "JetBrains Mono", monospace; }
        .thead, .trow { display: grid; grid-template-columns: 1.1fr 1.3fr 1fr 1fr 1fr; gap: calc(var(--u) * 4); padding: calc(var(--u) * 1) calc(var(--u) * 3); font-size: calc(var(--fs-xs) * 0.82); }
        .thead { color: var(--dim); letter-spacing: 0.08em; border-bottom: 1px solid rgba(27,58,92,0.7); flex: 0 0 auto; }
        .thead span:last-child, .trow .side { text-align: right; }
        .tbody { flex: 1; overflow: hidden; min-height: 0; }
        .trow { font-size: calc(var(--fs-xs) * 0.88); font-variant-numeric: tabular-nums; }
        .empty { color: var(--dim); font-size: var(--fs-xs); padding: calc(var(--u) * 6); }
        .faded { opacity: 0.4; }
        @media (max-width: 1024px) { .thead, .trow { grid-template-columns: 1fr 1.2fr 1fr 1fr; } .thead span:nth-child(4), .trow span:nth-child(4) { display: none; } }
        .trow span, .thead span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        /* narrow panel (§F): shed $ first, then time — price/qty/side always fit */
        @container panel (max-width: 340px) {
          .thead, .trow { grid-template-columns: 1fr 1.2fr 1fr 1fr; }
          .thead span:nth-child(4), .trow span:nth-child(4) { display: none; }
        }
        @container panel (max-width: 250px) {
          .thead, .trow { grid-template-columns: 1.2fr 1fr 1fr; }
          .thead span:nth-child(1), .trow span:nth-child(1) { display: none; }
        }
      `}</Style>
    </div>
  );
}

function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

void fmtPct;
