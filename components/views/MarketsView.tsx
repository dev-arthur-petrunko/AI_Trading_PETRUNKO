"use client";

import { useStore } from "@/lib/store";
import { Style } from "@/components/Style";
import { Panel } from "@/components/Panel";
import { LiveCandles } from "@/components/panels/LiveCandles";
import { OrderBook } from "@/components/panels/OrderBook";
import { TradingViewWidget } from "@/components/TradingViewWidget";
import { fmtPrice, fmtPct, fmtCompact } from "@/lib/format";
import { SYMBOLS } from "@/lib/store";

/** РЫНКИ: our candle chart + official TradingView widget + full market table. */
export function MarketsView() {
  const { symbol, setSymbol, stats, rank, t } = useStore();
  const pills = rank.length ? rank.map((r) => r.id) : SYMBOLS;

  return (
    <div className="mk">
      <Panel title={`Свечи ${symbol} · Live`} icon="▮" delay={80} className="mk-chart" flush>
        <div style={{ padding: "calc(var(--u) * 8)", height: "100%" }}>
          <LiveCandles />
        </div>
      </Panel>

      <Panel title={t("mk.tv")} icon="◫" delay={160} className="mk-tv">
        <TradingViewWidget symbol={`BINANCE:${symbol}USDT`} />
      </Panel>

      <Panel title="Order Book" icon="⇅" delay={240} className="mk-ob">
        <OrderBook />
      </Panel>

      <Panel title={t("mk.table")} icon="▦" delay={320} className="mk-table" flush>
        <div className="mkt scroll-thin">
          <div className="h mono">
            <span>#</span><span>МОНЕТА</span><span>ЦЕНА</span><span>24Ч</span><span>HIGH</span><span>LOW</span><span>ОБЪЁМ</span><span>ИСТОЧНИК</span>
          </div>
          {pills.map((id, i) => {
            const s = stats[id];
            const up = (s?.chg ?? 0) >= 0;
            return (
              <div key={id} className={`r ${id === symbol ? "on" : ""}`} onClick={() => setSymbol(id)}>
                <span className="dim">{i + 1}</span>
                <span className="sym">{id}</span>
                <span className="mono">{fmtPrice(s?.price, id)}</span>
                <span className={`mono ${up ? "bull" : "bear"}`}>{fmtPct((s?.chg ?? 0) / 100)}</span>
                <span className="mono dim">{fmtPrice(s?.high, id)}</span>
                <span className="mono dim">{fmtPrice(s?.low, id)}</span>
                <span className="mono dim">${fmtCompact(s?.vol)}</span>
                <span className="mono cy">{s?.src ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Style>{`
        .mk { display: grid; grid-template-columns: repeat(12, 1fr); grid-template-rows: calc(var(--u) * 430) 1fr; gap: calc(var(--u) * 8); flex: 1; min-height: 0; }
        .mk-chart { grid-column: span 4; }
        .mk-tv { grid-column: span 8; }
        .mk-ob { grid-column: span 3; }
        .mk-table { grid-column: span 9; }
        .mkt { height: 100%; overflow: auto; font-family: "JetBrains Mono", monospace; font-size: var(--fs-xs); }
        .mkt .h, .mkt .r { display: grid; grid-template-columns: 40px 1fr 1.3fr 1fr 1.2fr 1.2fr 1.2fr 1fr; gap: calc(var(--u) * 8); padding: calc(var(--u) * 5) calc(var(--u) * 10); align-items: center; }
        .mkt .h { color: var(--dim); letter-spacing: 0.1em; position: sticky; top: 0; background: rgba(5,10,18,0.95); border-bottom: 1px solid var(--stroke); }
        .mkt .r { cursor: pointer; border-bottom: 1px solid rgba(27,58,92,0.35); transition: background 0.15s; }
        .mkt .r:hover { background: rgba(45,212,255,0.07); }
        .mkt .r.on { background: rgba(25,245,138,0.1); box-shadow: inset 3px 0 0 var(--bull); }
        .mkt .sym { color: var(--ink); font-weight: 700; letter-spacing: 0.06em; }
        @media (max-width: 1024px) {
          .mk { display: flex; flex-direction: column; }
          .mk .panel { min-height: calc(var(--u) * 280); }
          .mkt .h span:nth-child(n+5), .mkt .r span:nth-child(n+5) { display: none; }
          .mkt .h, .mkt .r { grid-template-columns: 30px 1fr 1.3fr 1fr; }
        }
      `}</Style>
    </div>
  );
}
