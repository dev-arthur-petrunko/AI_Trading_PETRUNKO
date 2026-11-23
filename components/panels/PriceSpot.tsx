"use client";

import { useStore } from "@/lib/store";
import { Style } from "@/components/Style";
import { RollNumber } from "@/components/RollNumber";
import { fmtPrice, fmtCompact, fmtPct } from "@/lib/format";

/** PRICE / SPOT: big animated price + 24h change / volume / high / low. */
export function PriceSpot() {
  const { symbol, stat, connected } = useStore();

  const up = (stat?.chg ?? 0) >= 0;

  return (
    <div className="spot">
      <div className="row1">
        <span className="sym head-font">{symbol}<span className="dim">/USDT</span></span>
        <span className={`src mono ${connected ? "cy" : "amber"}`}>
          {connected ? "● LIVE" : "○ SYNC"}
        </span>
      </div>

      <div className="price-line">
        <span className="cur dim">$</span>
        <RollNumber
          value={stat?.price ?? 0}
          format={(v) => (v ? fmtPrice(v, symbol) : "—")}
          className={`price ${up ? "glow-bull" : "glow-bear"}`}
        />
      </div>

      <div className="grid4" data-prio="2">
        <Cell label="24H" value={fmtPct((stat?.chg ?? 0) / 100)} tone={up ? "bull" : "bear"} />
        <Cell label="VOL" value={"$" + fmtCompact(stat?.vol)} tone="cy" />
        <Cell label="HIGH" value={fmtPrice(stat?.high, symbol)} tone="dim" />
        <Cell label="LOW" value={fmtPrice(stat?.low, symbol)} tone="dim" />
      </div>

      <div className="src-line mono" data-prio="3">
        источник: {stat?.src ?? "—"}
        {stat?.altPrice ? ` · зеркало ${fmtPrice(stat.altPrice, symbol)}` : ""}
      </div>

      <Style>{`
        .spot { display: flex; flex-direction: column; height: 100%; gap: calc(var(--u) * 6); }
        .row1 { display: flex; justify-content: space-between; align-items: center; }
        .sym { font-size: var(--fs-m); letter-spacing: 0.16em; font-weight: 700; color: var(--ink); }
        .sym .dim { font-weight: 500; }
        .src { font-size: var(--fs-xs); letter-spacing: 0.12em; }
        .price-line { display: flex; align-items: baseline; gap: calc(var(--u) * 6); }
        .cur { font-size: var(--fs-l); }
        .price { font-size: var(--fs-2xl); font-weight: 700; letter-spacing: 0.02em; line-height: 1; }
        .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(var(--u) * 6); }
        .cell { border-left: calc(var(--u) * 2) solid var(--stroke); padding-left: calc(var(--u) * 7); min-width: 0; }
        .cell.bull-b { border-color: var(--bull); }
        .cell.bear-b { border-color: var(--bear); }
        .cell.cy-b { border-color: var(--cyan); }
        .cell .lbl { display: block; font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.86); color: var(--dim); letter-spacing: 0.14em; }
        .cell .val { display: block; font-family: "JetBrains Mono", monospace; font-size: var(--fs-s); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .src-line { font-size: clamp(7px, calc(var(--fs-xs) * 0.9), calc(var(--fs-xs) * 0.9)); color: var(--dim); letter-spacing: 0.06em; margin-top: auto; }
        /* цена масштабируется от ширины панели (container), не экрана */
        .price { font-size: clamp(22px, 9.5cqw, var(--fs-2xl)); }
        .cell .val { font-size: clamp(9px, 4.4cqw, var(--fs-s)); }
        .cell .lbl { font-size: clamp(7px, 3.7cqw, calc(var(--fs-xs) * 0.86)); }
      `}</Style>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" | "cy" | "dim" }) {
  const cls = tone === "bull" ? "bull bull-b" : tone === "bear" ? "bear bear-b" : tone === "cy" ? "cy cy-b" : "dim";
  return (
    <div className={`cell ${tone === "bull" ? "bull-b" : tone === "bear" ? "bear-b" : tone === "cy" ? "cy-b" : ""}`}>
      <span className="lbl">{label}</span>
      <span className={`val ${cls}`}>{value}</span>
    </div>
  );
}
