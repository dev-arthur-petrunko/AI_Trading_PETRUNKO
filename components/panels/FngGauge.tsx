"use client";

import { useEffect, useRef, useState } from "react";
import { Style } from "@/components/Style";
import { useStore } from "@/lib/store";
import { COLORS } from "@/lib/format";
import { MoodSquad } from "@/components/panels/Agents";

/** FEAR & GREED: semicircular gauge with a smoothly swinging needle. */
export function FngGauge() {
  const { fng } = useStore();
  const value = fng?.value ?? 50;
  const [shown, setShown] = useState(50);

  // smooth needle swing toward the value
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setShown((s) => {
        const d = value - s;
        if (Math.abs(d) < 0.3) return value;
        return s + d * 0.08;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const angle = -90 + (shown / 100) * 180; // -90..+90

  const color =
    value < 25 ? COLORS.bear : value < 45 ? "#FF7A45" : value < 55 ? COLORS.amber : value < 75 ? "#9BE85B" : COLORS.bull;
  const label = fng?.label ?? "—";

  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);

  return (
    <div className="fng">
      <svg viewBox="0 0 200 118" className="gauge" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="fgArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={COLORS.bear} />
            <stop offset="45%" stopColor={COLORS.amber} />
            <stop offset="100%" stopColor={COLORS.bull} />
          </linearGradient>
          <filter id="fgGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#fgArc)" strokeWidth="10" opacity="0.35" />

        {ticks.map((t) => {
          const a = ((-90 + (t / 100) * 180) * Math.PI) / 180;
          const x1 = 100 + Math.sin(a) * 72;
          const y1 = 100 - Math.cos(a) * 72;
          const x2 = 100 + Math.sin(a) * 64;
          const y2 = 100 - Math.cos(a) * 64;
          const xt = 100 + Math.sin(a) * 56;
          const yt = 100 - Math.cos(a) * 56;
          return (
            <g key={t}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.dim} strokeWidth="1" />
              <text x={xt} y={yt} fill={COLORS.dim} fontSize="7" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
                {t}
              </text>
            </g>
          );
        })}

        <g transform={`rotate(${angle} 100 100)`} style={{ transition: "none" }}>
          <line x1="100" y1="100" x2="100" y2="34" stroke={color} strokeWidth="2.5" filter="url(#fgGlow)" />
          <circle cx="100" cy="100" r="6" fill={color} filter="url(#fgGlow)" />
        </g>

        <text x="100" y="84" fill={color} fontSize="26" textAnchor="middle" fontWeight="700" fontFamily="JetBrains Mono, monospace" filter="url(#fgGlow)">
          {Math.round(shown)}
        </text>
        <text x="100" y="114" fill={COLORS.dim} fontSize="8" textAnchor="middle" letterSpacing="2" fontFamily="JetBrains Mono, monospace">
          {label.toUpperCase()}
        </text>
      </svg>

      <div className="legend mono" data-prio="3">
        <span className="bear">FEAR</span>
        <span className="dim">страх ↔ жадность · обновлено {fng ? new Date(fng.updatedAt).toISOString().slice(5, 10) : "—"}</span>
        <span className="bull">GREED</span>
      </div>

      <MoodSquad />

      <Style>{`
        .fng { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: calc(var(--u) * 3); }
        .gauge { flex: 0 1 auto; min-height: 0; width: 100%; max-height: calc(var(--u) * 148); }
        .legend { display: flex; justify-content: space-between; font-size: calc(var(--fs-xs) * 0.76); letter-spacing: 0.06em; margin-top: calc(var(--u) * -2); }
        /* компактная толпа в узкой панели */
        .fng .mood-squad { --ag-mini: calc(var(--u) * 17); margin-top: calc(var(--u) * 3); }
        .fng .ms-head { margin-bottom: calc(var(--u) * 3); font-size: calc(var(--fs-xs) * 0.74); gap: calc(var(--u) * 5); }
        .fng .ms-row { padding-top: calc(var(--u) * 9); gap: calc(var(--u) * 3); }
      `}</Style>
    </div>
  );
}
