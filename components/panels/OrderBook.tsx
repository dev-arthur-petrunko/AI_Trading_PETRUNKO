"use client";

import { useMemo } from "react";
import { Style } from "@/components/Style";
import { useStore } from "@/lib/store";
import { fmtPrice, fmtCompact } from "@/lib/format";

/** ORDER BOOK DEPTH: mirrored histogram, bids left / asks right, walls pulsing. */
export function OrderBook() {
  const { depth, symbol, stat } = useStore();

  const bids = depth?.bids ?? [];
  const asks = depth?.asks ?? [];
  const mid = stat?.price ?? ((bids[0]?.[0] ?? 0) + (asks[0]?.[0] ?? 0)) / 2;

  const { rows, maxQty, wallLevel } = useMemo(() => {
    const b = bids.slice(0, 8);
    const a = asks.slice(0, 8);
    const all = [...b, ...a];
    const maxQty = Math.max(1e-9, ...all.map(([, q]) => q));
    // wall = largest single level (highlighted + pulsing)
    let wall: [number, number] | null = null;
    for (const lvl of all) if (!wall || lvl[1] > wall[1]) wall = lvl;
    const rows = [
      ...b.map(([p, q]) => ({ side: "bid" as const, p, q })),
      ...a.map(([p, q]) => ({ side: "ask" as const, p, q })),
    ];
    return { rows, maxQty, wallLevel: wall };
  }, [depth]);

  const imbalance = depth?.imbalance ?? 0;

  return (
    <div className="ob">
      <div className="imb">
        <div className="imb-bar">
          <div className="imb-bid" style={{ width: `${50 + imbalance * 50}%` }} />
          <div className="imb-mid" />
        </div>
        <div className="imb-lbl mono">
          <span className="bull">BID {Math.round((0.5 + imbalance / 2) * 100)}%</span>
          <span className="dim">дисбаланс {imbalance >= 0 ? "+" : ""}{(imbalance * 100).toFixed(1)}%</span>
          <span className="bear">ASK {Math.round((0.5 - imbalance / 2) * 100)}%</span>
        </div>
      </div>

      <div className="book">
        {rows.length === 0 && <div className="empty mono">загрузка стакана…</div>}
        {rows.map((r, i) => {
          const isWall = wallLevel && r.p === wallLevel[0] && r.q === wallLevel[1];
          const w = (r.q / maxQty) * 100;
          return (
            <div className={`lvl ${r.side}`} key={`${r.side}-${r.p}-${i}`} data-prio={i >= 4 ? "3" : undefined}>
              <div
                className={`fill ${isWall ? "wall" : ""}`}
                style={{
                  width: `${w}%`,
                  background:
                    r.side === "bid"
                      ? "rgba(25,245,138,0.16)"
                      : "rgba(255,59,92,0.16)",
                  borderRight:
                    r.side === "bid" ? "2px solid rgba(25,245,138,0.7)" : "2px solid rgba(255,59,92,0.7)",
                  left: r.side === "ask" ? undefined : 0,
                  right: r.side === "ask" ? 0 : undefined,
                }}
              />
              <span className={`px mono ${r.side === "bid" ? "bull" : "bear"}`}>
                {fmtPrice(r.p, symbol)}
              </span>
              <span className="qty mono">{r.q.toFixed(r.q >= 100 ? 0 : 3)}</span>
            </div>
          );
        })}
      </div>

      <div className="mid mono">
        MID {fmtPrice(mid, symbol)}
        {wallLevel && (
          <span className="wall-tag amber">
            стенка {fmtCompact(wallLevel[0] * wallLevel[1])}$
          </span>
        )}
      </div>

      <Style>{`
        .ob { display: flex; flex-direction: column; height: 100%; gap: calc(var(--u) * 5); min-height: 0; }
        .imb { flex: 0 0 auto; }
        .imb-bar { position: relative; height: calc(var(--u) * 8); background: rgba(255,59,92,0.2); overflow: hidden; }
        .imb-bid { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(25,245,138,0.35); border-right: 2px solid var(--bull); transition: width 0.6s ease; }
        .imb-mid { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(216,230,245,0.5); }
        .imb-lbl { display: flex; justify-content: space-between; font-size: calc(var(--fs-xs) * 0.85); margin-top: calc(var(--u) * 3); letter-spacing: 0.06em; }
        .book { flex: 1; display: flex; flex-direction: column; gap: 2px; min-height: 0; overflow: hidden; }
        .lvl { position: relative; display: flex; justify-content: space-between; align-items: center; font-size: var(--fs-xs); padding: calc(var(--u) * 2) calc(var(--u) * 6); min-height: calc(var(--u) * 18); }
        .lvl .fill { position: absolute; top: 0; bottom: 0; transition: width 0.4s ease; }
        .lvl .fill.wall { animation: wallPulse 1.1s ease-in-out infinite; }
        @keyframes wallPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        .lvl .px, .lvl .qty { position: relative; z-index: 1; }
        .lvl .qty { color: var(--ink); font-variant-numeric: tabular-nums; }
        .mid { display: flex; justify-content: space-between; font-size: var(--fs-s); color: var(--cyan); letter-spacing: 0.08em; border-top: 1px dashed rgba(27,58,92,0.8); padding-top: calc(var(--u) * 4); }
        .wall-tag { font-size: calc(var(--fs-xs) * 0.9); }
        .empty { color: var(--dim); font-size: var(--fs-xs); }
      `}</Style>
    </div>
  );
}
