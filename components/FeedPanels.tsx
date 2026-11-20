"use client";

import { useEffect, useRef, useState } from "react";
import { Style } from "./Style";
import { useStore } from "@/lib/store";
import type { FeedEvent } from "@/lib/types";
import { hms, fmtPrice, fmtCompact, fmtPct, COLORS } from "@/lib/format";

/** Intro overlay: line scan → panels reveal → sphere assembles from points. */
export function IntroOverlay() {
  const { intro } = useStore();
  return (
    <div className={`intro ${intro ? "" : "done"}`} aria-hidden={!intro}>
      <div className="intro-line" />
      <div className="intro-label mono">NEURAL CORE BOOTING · LOADING MARKET STRUCTURE</div>
      <Style>{`
        .intro-label {
          position: absolute; bottom: 12%; font-size: var(--fs-xs);
          letter-spacing: 0.4em; color: var(--cyan); text-transform: uppercase;
          animation: blink 1.2s steps(2) infinite;
        }
        @keyframes blink { 50% { opacity: 0.25; } }
      `}</Style>
    </div>
  );
}

/** LIVE FEED: newest events on top with typewriter effect, old ones fade. */
export function LiveFeed({ max = 8 }: { max?: number }) {
  const { events } = useStore();
  const shown = events.slice(0, max);

  return (
    <div className="feed scroll-thin">
      {shown.length === 0 && <div className="empty mono">ожидание событий рынка…</div>}
      {shown.map((ev, i) => (
        <FeedRow key={ev.id} ev={ev} index={i} />
      ))}
      <Style>{`
        .feed { display: flex; flex-direction: column; gap: calc(var(--u) * 3); height: 100%; overflow: hidden; }
        .empty { color: var(--dim); font-size: var(--fs-xs); letter-spacing: 0.1em; }
      `}</Style>
    </div>
  );
}

function FeedRow({ ev, index }: { ev: FeedEvent; index: number }) {
  const color =
    ev.kind === "ai" ? COLORS.amber
    : ev.kind === "whale" ? COLORS.amber
    : ev.side === "buy" || ev.side === "bid" ? COLORS.bull
    : ev.side === "sell" || ev.side === "ask" ? COLORS.bear
    : COLORS.cyan;

  const icon = ev.kind === "ai" ? "AI" : ev.kind === "whale" ? "WHL" : ev.kind === "wall" ? "WLL" : ev.kind === "sys" ? "SYS" : "TRD";

  let text = "";
  if (ev.kind === "trade" || ev.kind === "whale") {
    text = `${ev.sym} ${ev.side === "buy" ? "покупка" : "продажка"} ${ev.qty?.toFixed(3)} ≈ $${fmtCompact(ev.usd)} ${ev.side === "buy" ? "▲" : "▼"}`;
  } else if (ev.kind === "wall") {
    text = `${ev.sym} стенка ${fmtPrice(ev.price, ev.sym)} на $${fmtCompact(ev.usd)} ${ev.side === "bid" ? "бул" : "мед"}`;
  } else {
    text = ev.text || "";
  }

  return (
    <div
      className={`feed-row ${index > 5 ? "faded" : ""}`}
      style={{ animationDelay: "0ms" }}
    >
      <span className="ts mono dim">{hms(ev.t)}</span>
      <span className="mk" style={{ color, borderColor: color }}>{icon}</span>
      <span className="typed body" style={{ color: index === 0 ? COLORS.ink : undefined }}>
        {text}
      </span>
      <Style>{`
        .feed { font-family: "JetBrains Mono", monospace; font-size: calc(var(--fs-xs) * 0.9); }
        .feed-row { display: flex; align-items: baseline; gap: calc(var(--u) * 5); line-height: 1.42; }
        .feed-row .ts { opacity: 0.75; flex: 0 0 auto; }
        .feed-row .mk {
          flex: 0 0 auto; font-size: calc(var(--fs-xs) * 0.78); border: 1px solid; padding: 0 calc(var(--u) * 3);
          letter-spacing: 0.04em;
        }
        .feed-row .body { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .empty { letter-spacing: 0.12em; }
      `}</Style>
    </div>
  );
}
