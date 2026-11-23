"use client";

import { useEffect, useRef, useState } from "react";
import { Style } from "@/components/Style";
import { useStore } from "@/lib/store";
import { pickMode } from "@/lib/layout.config";
import { COLORS } from "@/lib/format";

/**
 * OrbitLayer (Exercise §C2–C3):
 *  - orbit offset per card: R − √(R² − dy²) → data-orbit + --arc-offset (inner edge turns toward the sphere);
 *  - SVG rays: from the middle of the card's inner edge to P = C + r·(Q−C)/|Q−C| on the sphere surface,
 *    running dash + glowing dot;
 *  - three concentric dial arcs (1.15D/2 · 1.3D/2 · 1.5D/2), the outer one rotates;
 *  - data packets fly along a ray to the sphere on aps-out and on a slow timer;
 *  - rays/arcs off in modes M/S (agents draw short cables there).
 * First child of .dash-grid → below panels in paint order (panels later in DOM), data never covered.
 */

type R = { x: number; y: number; w: number; h: number };

const CARD_IDS = [
  "g-price", "g-candles", "g-book", "g-fng", "g-metrics",
  "g-feed", "g-fan", "g-timeline", "g-tape",
] as const;

/** accent per panel (top arc cold, sides by semantics, bottom arc warm) */
const ACCENT: Record<string, string> = {
  "g-price": COLORS.cyan,
  "g-candles": COLORS.cyan,
  "g-book": COLORS.bear,
  "g-fng": COLORS.amber,
  "g-metrics": COLORS.bull,
  "g-feed": COLORS.cyan,
  "g-fan": COLORS.bull,
  "g-timeline": "#FF7A45",
  "g-tape": "#FF7A45",
};

type Ray = { id: string; ax: number; ay: number; bx: number; by: number; color: string };
type Geo = { cx: number; cy: number; D: number; rays: Ray[] };
type Pkt = { id: number; x1: number; y1: number; tx: number; ty: number; color: string };

export function OrbitLayer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [mode, setMode] = useState("xl");
  const [pkts, setPkts] = useState<Pkt[]>([]);
  const seq = useRef(0);
  const geoRef = useRef<Geo | null>(null);
  geoRef.current = geo;
  const { reduced, eco } = useStore();
  const calm = reduced || eco;

  // ---- measure panels + sphere → orbit attributes & ray geometry ----
  useEffect(() => {
    const host = hostRef.current;
    const grid = host ? host.parentElement : null;
    if (!host || !grid) return;

    const measure = () => {
      const box = grid.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) return;
      const m = pickMode(window.innerWidth, window.innerHeight);
      setMode(m);
      const orbit = m === "xl" || m === "l";

      const sphEl = grid.querySelector(".g-sphere");
      const sphR = sphEl ? sphEl.getBoundingClientRect() : null;
      if (!sphR || sphR.width < 10) return;
      const cx = sphR.left - box.left + sphR.width / 2;
      const cy = sphR.top - box.top + sphR.height / 2;
      const D = Math.min(sphR.width, sphR.height) * 0.9;
      const R = D / 2 + D * 0.12;

      const rays: Ray[] = [];
      for (let k = 0; k < CARD_IDS.length; k++) {
        const id = CARD_IDS[k];
        const el = grid.querySelector("." + id);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        const r: R = { x: b.left - box.left, y: b.top - box.top, w: b.width, h: b.height };
        const dx = r.x + r.w / 2 - cx;
        const dy = r.y + r.h / 2 - cy;

        if (orbit) {
          let side: "left" | "right" | "top" | "bottom";
          let offset: number;
          if (Math.abs(dx) >= Math.abs(dy)) {
            side = dx < 0 ? "left" : "right";
            const t = Math.min(R, Math.abs(dy));
            offset = R - Math.sqrt(Math.max(0, R * R - t * t));
          } else {
            side = dy < 0 ? "top" : "bottom";
            const t = Math.min(R, Math.abs(dx));
            offset = R - Math.sqrt(Math.max(0, R * R - t * t));
          }
          el.setAttribute("data-orbit", side);
          (el as HTMLElement).style.setProperty("--arc-offset", offset.toFixed(1) + "px");
        } else {
          el.removeAttribute("data-orbit");
          (el as HTMLElement).style.setProperty("--arc-offset", "0px");
        }

        if (!orbit) continue;

        let ax: number, ay: number;
        if (Math.abs(dx) >= Math.abs(dy)) {
          ax = dx < 0 ? r.x + r.w : r.x;
          ay = r.y + r.h / 2;
        } else {
          ax = r.x + r.w / 2;
          ay = dy < 0 ? r.y + r.h : r.y;
        }
        const ex = ax - cx, ey = ay - cy;
        const len = Math.hypot(ex, ey) || 1;
        const rr = D / 2;
        rays.push({
          id: id, ax: ax, ay: ay,
          bx: cx + (ex / len) * rr,
          by: cy + (ey / len) * rr,
          color: ACCENT[id] || COLORS.cyan,
        });
      }

      setGeo({ cx: cx, cy: cy, D: D, rays: rays });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    const iv = setInterval(measure, 3500);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      clearInterval(iv);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ---- data packets along rays toward the sphere ----
  useEffect(() => {
    if (calm) return;
    const fly = (from: { x: number; y: number }, color: string) => {
      const g = geoRef.current;
      if (!g || mode === "m" || mode === "s") return;
      const dx = g.cx - from.x, dy = g.cy - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const stop = len - g.D / 2 - 4;
      if (stop <= 4) return;
      const id = ++seq.current;
      setPkts((p) => p.slice(-3).concat([{ id: id, x1: from.x, y1: from.y, tx: (dx / len) * stop, ty: (dy / len) * stop, color: color }]));
      setTimeout(() => setPkts((p) => p.filter((q) => q.id !== id)), 950);
    };

    const onOut = (e: Event) => {
      const d = (e as CustomEvent).detail as { label?: string };
      if (!d || !d.label) return;
      const g = geoRef.current;
      if (!g) return;
      for (let i = 0; i < g.rays.length; i++) {
        if (g.rays[i].id === "g-metrics") {
          fly({ x: g.rays[i].ax, y: g.rays[i].ay }, g.rays[i].color);
          break;
        }
      }
    };
    window.addEventListener("aps-out", onOut);

    const iv = setInterval(() => {
      if (document.hidden || !geoRef.current || !geoRef.current.rays.length) return;
      const rays = geoRef.current.rays;
      const ray = rays[Math.floor(Math.random() * rays.length)];
      fly({ x: ray.ax, y: ray.ay }, ray.color);
    }, 5200);

    return () => {
      window.removeEventListener("aps-out", onOut);
      clearInterval(iv);
    };
  }, [calm, mode]);

  const active = mode === "xl" || mode === "l";
  const rays = geo ? geo.rays : [];
  const orbits = geo ? [1.15 * geo.D * 0.5, 1.3 * geo.D * 0.5, 1.5 * geo.D * 0.5] : [];

  return (
    <div ref={hostRef} className="orbit-host" aria-hidden>
      {geo && active && (
        <svg className="orbit-svg" width={geo.cx * 2} height={geo.cy * 2} data-calm={calm ? "1" : "0"}>
          {orbits.map((r, i) => (
            <circle
              key={"o" + i}
              className={i === 2 ? "arc arc-spin" : "arc"}
              cx={geo.cx}
              cy={geo.cy}
              r={r}
              fill="none"
              stroke="rgba(45,212,255,0.15)"
              strokeWidth={i === 2 ? 1.4 : 1}
              strokeDasharray={i === 1 ? "3 7" : undefined}
            />
          ))}
          {rays.map((r) => (
            <g key={r.id}>
              <line className="ray" x1={r.ax} y1={r.ay} x2={r.bx} y2={r.by} stroke={r.color} strokeWidth="1.2" opacity="0.75" />
              <circle className="ray-dot" cx={r.bx} cy={r.by} r="3" fill={r.color} />
            </g>
          ))}
          {pkts.map((p) => (
            <circle
              key={p.id}
              className="ray-pkt"
              cx={p.x1}
              cy={p.y1}
              r="4"
              fill={p.color}
              style={{ "--tx": p.tx + "px", "--ty": p.ty + "px" } as React.CSSProperties}
            />
          ))}
        </svg>
      )}

      <Style>{`
        .orbit-host { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
        .orbit-svg { position: absolute; left: 0; top: 0; overflow: visible; }
        .orbit-svg .arc-spin { transform-box: fill-box; transform-origin: center; animation: arcSpin 90s linear infinite; }
        .orbit-svg .ray { stroke-dasharray: 6 10; animation: rayRun 2.6s linear infinite; }
        .orbit-svg .ray-dot { animation: dotBlink 2.4s ease-in-out infinite; }
        .ray-pkt { animation: pktFly 0.95s cubic-bezier(0.4,0,0.6,1) both; }
        @keyframes rayRun { to { stroke-dashoffset: -32; } }
        @keyframes arcSpin { to { transform: rotate(360deg); } }
        @keyframes pktFly {
          0% { transform: translate(0, 0); opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)); opacity: 0.05; }
        }
        .orbit-svg[data-calm="1"] .arc-spin,
        .orbit-svg[data-calm="1"] .ray,
        .orbit-svg[data-calm="1"] .ray-dot { animation: none; stroke-dasharray: none; }
        .orbit-svg[data-calm="1"] .ray { opacity: 0.35; }
      `}</Style>
    </div>
  );
}
