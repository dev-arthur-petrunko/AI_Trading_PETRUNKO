"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { fmtPrice, fmtPct, COLORS } from "@/lib/format";
import { Style } from "@/components/Style";

/**
 * Dashboard AGENTS — a roaming swarm over ALL 10 dashboard windows:
 *  - green bulls / red bears, counts ∝ real probabilities;
 *  - each agent walks panel → panel (patrol), SCANS it (radar + reading with REAL
 *    numbers taken from that window), then TRANSMITS the packet along a cable to
 *    the central NEURAL SPHERE (core flashes + counter "ПРИЁМ");
 *  - agents EXCHANGE readings when they talk (speech = what THEY took from their
 *    current window), with a transparent dome of their own colour;
 *  - cables between agents (team/cross), gaze logic, hops, cursor tracking;
 *  - eco / prefers-reduced-motion → quiet static mode.
 */

type Side = "bull" | "bear";
type Look = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Rects = Record<string, Rect>;
type Link = { id: number; a: number; b: number; kind: "team" | "cross" | "talk"; born: number };
type Dialog = { a: number; b: number; born: number; lineA: string; lineB: string };
type Packet = { id: number; x: number; y: number; tx: number; ty: number; color: string; label: string; panel: string };
type Phase = "move" | "scan" | "rest";

type ANode = { panel: string; phase: Phase; until: number; radar: string | null };

const MAX_AGENTS = 10;
export const PANEL_IDS = [
  "g-price", "g-candles", "g-book", "g-fng", "g-metrics",
  "g-sphere", "g-feed", "g-timeline", "g-fan", "g-tape",
];

const BULL_PREF = ["g-price", "g-candles", "g-tape", "g-fan", "g-metrics", "g-sphere", "g-timeline"];
const BEAR_PREF = ["g-book", "g-feed", "g-fng", "g-timeline", "g-sphere", "g-fan", "g-tape"];

const RADAR: Record<string, string> = {
  "g-price": "⌁ PRICE SCAN",
  "g-candles": "⌁ CANDLE SCAN",
  "g-book": "⌁ DEPTH SCAN",
  "g-fng": "⌁ MOOD SCAN",
  "g-metrics": "⌁ RSI/MACD SCAN",
  "g-sphere": "⌁ CORE SYNC",
  "g-feed": "⌁ EVENT SCAN",
  "g-timeline": "⌁ ANALOG SCAN",
  "g-fan": "⌁ FAN SCAN",
  "g-tape": "⌁ TAPE SCAN",
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const rr = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pct0 = (v: number | undefined) => (v === undefined ? "—" : `${(v * 100).toFixed(0)}%`);
const sgn = (v: number | undefined, d = 1) =>
  v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

function squadCounts(up: number, down: number) {
  const s = up + down || 1;
  return {
    bull: clamp(Math.round((up / s) * MAX_AGENTS), 2, 5),
    bear: clamp(Math.round((down / s) * MAX_AGENTS), 2, 5),
  };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quickRsi(v: number[], p = 14): number {
  if (v.length < p + 1) return 50;
  let g = 0, l = 0;
  for (let i = v.length - p; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / p / (l / p));
}

// ---------------------------------------------------------------- readings (real numbers only)

type Ctx = {
  symbol: string;
  tf: string;
  price?: number;
  chg?: number;
  candles: number;
  imb?: number;
  fngV?: number;
  fngL?: string;
  rsi: number;
  conf?: number;
  probUp?: number;
  bestLabel?: string;
  bestSim?: number;
  med7?: number;
  lastEvent?: string;
};

function readingsOf(c: Ctx): Record<string, string> {
  const sign = (c.imb ?? 0) >= 0 ? "+" : "";
  return {
    "g-price": `$${fmtPrice(c.price, c.symbol)} · 24ч ${fmtPct((c.chg ?? 0) / 100)}`,
    "g-candles": `${c.tf} · ${c.candles} свечей`,
    "g-book": `дисбаланс ${sign}${((c.imb ?? 0) * 100).toFixed(0)}% ${sign === "+" ? "bid" : "ask"}`,
    "g-fng": c.fngV !== undefined ? `F&G ${c.fngV} · ${c.fngL ?? ""}` : "F&G …",
    "g-metrics": `RSI ${c.rsi.toFixed(0)} · conf ${pct0(c.conf)}`,
    "g-sphere": `P↑ ${pct0(c.probUp)} → ядро`,
    "g-feed": c.lastEvent ?? "ожидание событий",
    "g-timeline": c.bestLabel ? `аналог ${c.bestLabel} ${pct0(c.bestSim)}` : "поиск аналогов…",
    "g-fan": `медиана ${fmtPct(c.med7)}`,
    "g-tape": c.lastEvent ?? "ожидание сделок",
  };
}

function shortEvent(e: { kind: string; side?: string; price?: number; sym?: string; text?: string } | null | undefined): string | undefined {
  if (!e) return undefined;
  if (e.kind === "ai" || e.kind === "sys") return (e.text || "").slice(0, 30);
  if (e.kind === "trade" || e.kind === "whale" || e.kind === "wall")
    return `${e.sym} ${e.side === "buy" || e.side === "bid" ? "▲" : "▼"} ${fmtPrice(e.price, e.sym || "BTC")}`;
  return undefined;
}

// ---------------------------------------------------------------- one agent (primitive)

export function Agent({
  idx, side, look, hop, calm, dome, radar, speech, thought, size,
}: {
  idx: number;
  side: Side;
  look: Look;
  hop: number;
  calm: boolean;
  dome?: boolean;
  radar?: string | null;
  speech?: string | null;
  thought?: { text: string; tok: number } | null;
  size: string;
}) {
  const seed = (idx * 0.6180339887498949) % 1;
  const delay = (-(seed * 4.6)).toFixed(2);
  const blinkDur = (3.2 + seed * 2.1).toFixed(2);
  return (
    <div
      className={`agent a-${side}${hop ? " hop" : ""}${calm ? " calm" : ""}`}
      style={{ width: size, height: size, "--bd": `${delay}s`, "--bl": `${blinkDur}s` } as React.CSSProperties}
    >
      {dome && <span className={`dome d-${side}`} aria-hidden />}
      <div className="agent-bob">
        <svg viewBox="0 0 24 24" aria-hidden focusable="false">
          <ellipse className="body" cx="12" cy="12.3" rx="9.5" ry="9.9" />
          <ellipse className="gloss" cx="8.4" cy="7.7" rx="3.5" ry="2.05" transform="rotate(-16 8.4 7.7)" />
          <g className="eye-look" style={{ transform: `translate(${look.x}px, ${look.y}px)` }}>
            <g className="eye-blink">
              <rect className="eye" x="7.1" y="8.6" width="3.4" height="6.4" rx="1.7" />
              <rect className="eye" x="13.5" y="8.6" width="3.4" height="6.4" rx="1.7" />
            </g>
          </g>
        </svg>
      </div>
      {radar && (
        <span className="radar" aria-hidden>
          <svg viewBox="0 0 28 28">
            <circle className="rr r1" cx="14" cy="14" r="12" />
            <circle className="rr r2" cx="14" cy="14" r="7.5" />
            <circle className="rr r3" cx="14" cy="14" r="3" />
            <path className="beam" d="M14 14 L14 2 A12 12 0 0 1 24.4 8 Z" />
            <circle className="blip" cx="19" cy="9" r="1.4" />
          </svg>
          <em className="mono">{radar}</em>
        </span>
      )}
      {speech && <span className={`speech mono s-${side}`}>{speech}</span>}
      {thought && <span className="think mono" key={thought.tok}>{thought.text}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- roaming swarm (dashboard overlay)

export function DashboardAgents() {
  const { forecast, events, symbol, tf, candles, depth, fng, stats, reduced, eco } = useStore();
  const calm = reduced || eco;

  const overlayRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rects>({});
  const [ready, setReady] = useState(false);

  const counts = useMemo(
    () => squadCounts(forecast?.probUp ?? 0.5, forecast?.probDown ?? 0.5),
    [forecast?.probUp, forecast?.probDown],
  );
  const countsRef = useRef(counts);
  countsRef.current = counts;

  const ctxRef = useRef<Ctx>({ symbol, tf, candles: 0, rsi: 50 });
  ctxRef.current = {
    symbol,
    tf,
    price: stats[symbol]?.price,
    chg: stats[symbol]?.chg,
    candles: candles.length,
    imb: depth?.imbalance,
    fngV: fng?.value,
    fngL: fng?.label,
    rsi: quickRsi(candles.map((c) => c.c)),
    conf: forecast?.confidence,
    probUp: forecast?.probUp,
    bestLabel: forecast?.best?.label,
    bestSim: forecast?.best?.sim,
    med7: forecast?.medianMove?.d7,
    lastEvent: shortEvent(events[0]),
  };

  const [looks, setLooks] = useState<Look[]>(() => Array.from({ length: MAX_AGENTS }, () => ({ x: 0, y: 0 })));
  const baseRef = useRef<Look[]>(Array.from({ length: MAX_AGENTS }, () => ({ x: 0, y: 0 })));
  const targRef = useRef<Look[]>(
    Array.from({ length: MAX_AGENTS }, (_, i) => {
      const r = mulberry32(i * 31 + 5);
      return { x: (r() - 0.5) * 2, y: (r() - 0.5) * 1.2 };
    }),
  );
  const ptrRef = useRef<{ x: number; y: number } | null>(null);

  const [pos, setPos] = useState<{ x: number; y: number }[]>(() =>
    Array.from({ length: MAX_AGENTS }, () => ({ x: -999, y: -999 })),
  );
  const posRef = useRef(pos);
  posRef.current = pos;

  const nodesRef = useRef<ANode[]>(
    Array.from({ length: MAX_AGENTS }, (_, i) => ({
      panel: PANEL_IDS[i % PANEL_IDS.length],
      phase: "rest" as Phase,
      until: 0,
      radar: null,
    })),
  );

  const [hops, setHops] = useState<Record<number, number>>({});
  const [links, setLinks] = useState<Link[]>([]);
  const linksRef = useRef(links);
  linksRef.current = links;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const [packets, setPackets] = useState<Packet[]>([]);
  const [thought, setThought] = useState<{ idx: number; text: string; tok: number } | null>(null);
  const radarView = useRef<(string | null)[]>(Array(MAX_AGENTS).fill(null));

  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const lastEvt = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const after = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);

  // ---- measure panel rects relative to the overlay ----------------------
  useEffect(() => {
    const el = overlayRef.current;
    const grid = el?.closest(".dash-grid");
    if (!el || !grid) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const next: Rects = {};
      for (const id of PANEL_IDS) {
        const node = grid.querySelector("." + id);
        if (!node) continue;
        const r = node.getBoundingClientRect();
        next[id] = { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
      }
      setRects(next);
      if (Object.keys(next).length >= 5) setReady(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid as Element);
    const t1 = setTimeout(measure, 600);
    const t2 = setTimeout(measure, 2600); // after intro reveal
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const inside = (id: string): { x: number; y: number } | null => {
    const r = rectsRef.current[id];
    if (!r) return null;
    if (id === "g-sphere") {
      const side = Math.random() < 0.5;
      return {
        x: r.x + (side ? rr(0.05, 0.2) : rr(0.78, 0.93)) * r.w,
        y: r.y + rr(0.42, 0.78) * r.h,
      };
    }
    return {
      x: r.x + rr(0.1, 0.86) * r.w,
      y: r.y + rr(0.55, 0.82) * r.h,
    };
  };

  const choosePanel = (i: number): string => {
    const c = countsRef.current;
    const side: Side = i < c.bull ? "bull" : "bear";
    const pref = side === "bull" ? BULL_PREF : BEAR_PREF;
    const cur = nodesRef.current[i].panel;
    const pool = Math.random() < 0.68 ? pref : PANEL_IDS;
    for (let t = 0; t < 6; t++) {
      const p = pick(pool);
      if (p !== cur) return p;
    }
    return pick(PANEL_IDS);
  };

  const hop = (i: number) => setHops((h) => ({ ...h, [i]: (h[i] ?? 0) + 1 }));

  const emitPacket = (i: number, panel: string) => {
    const r = rectsRef.current["g-sphere"];
    const from = posRef.current[i];
    if (!r || !from || from.x < 0) return;
    const c = countsRef.current;
    const side: Side = i < c.bull ? "bull" : "bear";
    const rd = readingsOf(ctxRef.current);
    const label = (rd[panel] || "").slice(0, 26);
    const id = Date.now() + Math.random();
    setPackets((ps) => [
      ...ps.slice(-6),
      { id, x: from.x, y: from.y, tx: r.x + r.w * (0.3 + Math.random() * 0.4), ty: r.y + r.h * (0.3 + Math.random() * 0.4), color: side === "bull" ? COLORS.bull : COLORS.bear, label, panel },
    ]);
    after(560, () => {
      window.dispatchEvent(new CustomEvent("aps-packet", { detail: { side, panel, label } }));
    });
    after(1150, () => setPackets((ps) => ps.filter((p) => p.id !== id)));
  };

  // ---- life loop: roam → scan → transmit, talks, cables, thoughts -------
  useEffect(() => {
    if (calm) return;
    let linkId = 1;
    let lastAction = 0;
    let lastTalk = Date.now() - 2500;
    let lastThink = Date.now() - 1500;

    const tick = () => {
      if (!rectsRef.current || Object.keys(rectsRef.current).length < 5) return;
      const now = Date.now();
      const c = countsRef.current;
      const total = c.bull + c.bear;
      const rd = readingsOf(ctxRef.current);

      setLinks((ls) => ls.filter((l) => now - l.born < 2400));
      if (dialogRef.current && now - dialogRef.current.born > 3600) setDialog(null);

      const moves: { i: number; panel: string; at: { x: number; y: number } }[] = [];
      const scans: number[] = [];
      for (let i = 0; i < total; i++) {
        const n = nodesRef.current[i];
        if (now < n.until) continue;
        if (n.phase === "move") {
          n.phase = "scan";
          n.radar = RADAR[n.panel] ?? "⌁ SCAN";
          n.until = now + 2300;
        } else if (n.phase === "scan") {
          scans.push(i);
          n.radar = null;
          n.phase = "rest";
          n.until = now + rr(300, 900);
        } else {
          const p = choosePanel(i);
          const at = inside(p);
          if (!at) { n.until = now + 500; continue; }
          n.panel = p;
          n.phase = "move";
          n.radar = null;
          n.until = now + 1750;
          moves.push({ i, panel: p, at });
        }
      }
      radarView.current = nodesRef.current.map((n) => (n.phase === "scan" ? n.radar : null));
      setPos((prev) => {
        if (!moves.length) return prev;
        const next = prev.slice();
        for (const m of moves) next[m.i] = m.at;
        return next;
      });
      for (const i of scans) emitPacket(i, nodesRef.current[i].panel);

      if (now - lastAction > 1500) {
        lastAction = now;
        if (linksRef.current.length < 3 && Math.random() < 0.7) {
          const a = Math.floor(Math.random() * total);
          let b = Math.floor(Math.random() * total);
          if (a === b) b = (b + 1) % total;
          const cross = (a < c.bull) !== (b < c.bull);
          setLinks((ls) => [...ls, { id: linkId++, a, b, kind: cross ? "cross" : "team", born: now }]);
        }
        if (Math.random() < 0.55) hop(Math.floor(Math.random() * total));

        if (!dialogRef.current && now - lastTalk > 4500 && Math.random() < 0.55) {
          const a = Math.floor(Math.random() * total);
          let b = -1;
          for (let t = 0; t < 6; t++) {
            const x = Math.floor(Math.random() * total);
            if (x !== a && nodesRef.current[x].panel !== nodesRef.current[a].panel) { b = x; break; }
          }
          if (b < 0) b = (a + 1) % total;
          lastTalk = now;
          const pa = nodesRef.current[a].panel;
          const pb = nodesRef.current[b].panel;
          setDialog({ a, b, born: now, lineA: rd[pa] || "…", lineB: rd[pb] || "…" });
          const cross = (a < c.bull) !== (b < c.bull);
          setLinks((ls) => [...ls.filter((l) => l.kind !== "talk"), { id: linkId++, a, b, kind: "talk", born: now }]);
        }
      }

      if (now - lastThink > 2800) {
        lastThink = now;
        const f = forecast;
        const idx = Math.floor(Math.random() * total);
        const side: Side = idx < c.bull ? "bull" : "bear";
        const text = !f
          ? "⌁ анализ…"
          : side === "bull"
            ? pick([`P↑ ${pct0(f.probUp)}`, f.best ? `аналог ${pct0(f.best.sim)}` : "⌁ …", `Δ7д ${sgn(f.medianMove?.d7)}`])
            : pick([`P↓ ${pct0(f.probDown)}`, `σ ${sgn(f.spread?.d7)}`, `flat ${pct0(f.probFlat)}`]);
        setThought({ idx, text, tok: now });
        after(1900, () => setThought((t) => (t && t.tok === now ? null : t)));
      }
      void rd;
    };

    const id = setInterval(tick, 750);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm, ready]);

  // ---- hops on trades/walls (from live feed) ----------------------------
  const hopSide = (side: Side) => {
    const c = countsRef.current;
    setHops((h) => {
      const next = { ...h };
      const [from, to] = side === "bull" ? [0, c.bull] : [c.bull, c.bull + c.bear];
      const i = from + Math.floor(Math.random() * Math.max(1, to - from));
      next[i] = (next[i] ?? 0) + 1;
      return next;
    });
  };
  useEffect(() => {
    const e = events[0];
    if (!e || e.id === lastEvt.current) return;
    const first = lastEvt.current === 0;
    lastEvt.current = e.id;
    if (first || e.sym !== symbol) return;
    if (e.kind !== "trade" && e.kind !== "whale" && e.kind !== "wall") return;
    hopSide(e.side === "buy" || e.side === "bid" ? "bull" : "bear");
  }, [events, symbol]);

  // ---- gaze: partner / own radar / cursor / elsewhere --------------------
  useEffect(() => {
    if (calm) return;
    const onMove = (e: PointerEvent) => { ptrRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", onMove);
    const id = setInterval(() => {
      const base = baseRef.current;
      const targ = targRef.current;
      const posNow = posRef.current;
      const dlg = dialogRef.current;
      const lks = linksRef.current;
      const nodes = overlayRef.current
        ? Array.from(overlayRef.current.querySelectorAll<HTMLElement>("[data-agent]"))
        : [];
      const ptr = ptrRef.current;
      const next: Look[] = [];
      for (let i = 0; i < MAX_AGENTS; i++) {
        if (Math.random() < 0.04) targ[i] = { x: rr(-1.4, 1.4), y: rr(-0.9, 0.9) };
        base[i].x += (targ[i].x - base[i].x) * 0.14;
        base[i].y += (targ[i].y - base[i].y) * 0.14;
        let x = base[i].x;
        let y = base[i].y;
        let partner = -1;
        if (dlg && (dlg.a === i || dlg.b === i)) partner = dlg.a === i ? dlg.b : dlg.a;
        else {
          const l = lks.find((k) => (k.a === i || k.b === i) && k.kind !== "talk");
          if (l) partner = l.a === i ? l.b : l.a;
        }
        const me = posNow[i];
        const him = partner >= 0 ? posNow[partner] : null;
        if (partner >= 0 && me && him && me.x > -100) {
          x = clamp((him.x - me.x) / 70, -1.7, 1.7);
          y = clamp((him.y - me.y) / 85, -1.5, 1.5);
        } else if (radarView.current[i]) {
          x = 0.9; y = -1.1;
        } else if (i % 3 === 0 && ptr) {
          const el = nodes.find((n) => Number(n.dataset.agent) === i);
          if (el) {
            const b = el.getBoundingClientRect();
            x += clamp((ptr.x - (b.left + b.width / 2)) / (b.width * 4), -1.3, 1.3);
            y += clamp((ptr.y - (b.top + b.height / 2)) / (b.height * 4), -1.3, 1.3);
          }
        }
        next.push({ x: clamp(x, -1.8, 1.8), y: clamp(y, -1.4, 1.4) });
      }
      setLooks(next);
    }, 170);
    return () => {
      window.removeEventListener("pointermove", onMove);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm]);

  // ---- static layout for eco / reduced-motion ---------------------------
  useEffect(() => {
    if (!calm || !ready) return;
    const place: { x: number; y: number }[] = [];
    for (let i = 0; i < MAX_AGENTS; i++) {
      const c = countsRef.current;
      const side: Side = i < c.bull ? "bull" : "bear";
      const r = rectsRef.current["g-sphere"];
      const col = i % 5;
      const row = side === "bull" ? 0 : 1;
      place.push({
        x: r ? r.x + r.w * (0.12 + col * 0.19) : -999,
        y: r ? r.y + r.h * (0.55 + row * 0.22) : -999,
      });
    }
    setPos(place);
  }, [calm, ready, counts.bull, counts.bear]);

  if (!ready) {
    // MUST keep the container mounted: the measure effect needs overlayRef + .dash-grid
    // to compute panel rects; returning null here would deadlock (ready never flips).
    return (
      <div className={`agents-overlay${calm ? " calm" : ""}`} ref={overlayRef} aria-hidden>
        <Style>{agentCss}</Style>
      </div>
    );
  }

  const sph = rects["g-sphere"];
  const total = counts.bull + counts.bear;

  const toXY = (i: number): [number, number] => {
    const p = pos[i] ?? { x: -999, y: -999 };
    return [p.x, p.y];
  };
  const cablePath = (a: number, b: number) => {
    const [x1, y1] = toXY(a);
    const [x2, y2] = toXY(b);
    if (x1 < -100 || x2 < -100) return "";
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const bend = 16;
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(mx + (-dy / len) * bend).toFixed(1)} ${(my + (dx / len) * bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  return (
    <div className={`agents-overlay${calm ? " calm" : ""}`} ref={overlayRef} aria-hidden>
      <svg className="cables">
        {links.map((l) => (
          <path key={l.id} className={`cable c-${l.kind}`} d={cablePath(l.a, l.b)} />
        ))}
        {links.map((l) => {
          const [ax, ay] = toXY(l.a);
          const [bx, by] = toXY(l.b);
          return ax < -100 ? null : (
            <g key={`n${l.id}`}>
              <circle className={`node n-${l.kind}`} cx={ax} cy={ay} r="3" />
              <circle className={`node n-${l.kind}`} cx={bx} cy={by} r="3" />
            </g>
          );
        })}
        {packets.map((p) => {
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          return (
            <g key={p.id} className="packet" style={{ "--c": p.color } as React.CSSProperties}>
              <line className="pk-line" x1={p.x} y1={p.y} x2={p.tx} y2={p.ty} />
              <circle className="pk-dot" cx={p.x} cy={p.y} r="4.5" style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties} />
            </g>
          );
        })}
      </svg>

      {packets.map((p) => (
        <div
          key={`t${p.id}`}
          className="pk-label mono"
          style={{ left: p.x, top: p.y, color: p.color, borderColor: p.color }}
        >
          ⌁ {p.label}
        </div>
      ))}

      {sph && (
        <>
          <div className="oflag f-bull mono" style={{ left: sph.x + 8, top: sph.y + 8 }}>
            <b>BULL-АГЕНТЫ</b><i>▲ {pct0(forecast?.probUp)}</i><s>{counts.bull}</s>
          </div>
          <div className="oflag f-bear mono" style={{ right: "auto", left: sph.x + sph.w - 178, top: sph.y + sph.h - 34 }}>
            <b>BEAR-АГЕНТЫ</b><i>▼ {pct0(forecast?.probDown)}</i><s>{counts.bear}</s>
          </div>
        </>
      )}

      {Array.from({ length: total }, (_, i) => i).map((idx) => {
        const side: Side = idx < counts.bull ? "bull" : "bear";
        const p = pos[idx] ?? { x: -999, y: -999 };
        if (p.x < -100) return null;
        const d = dialog;
        const inDialog = d && (d.a === idx || d.b === idx);
        return (
          <div key={idx} data-agent={idx} className="a-slot" style={{ left: p.x, top: p.y }}>
            <Agent
              idx={idx}
              side={side}
              look={looks[idx] ?? { x: 0, y: 0 }}
              hop={hops[idx] ?? 0}
              calm={calm}
              dome={!!inDialog}
              radar={calm ? null : radarView.current[idx]}
              speech={inDialog ? (d!.a === idx ? d!.lineA : d!.lineB) : null}
              thought={thought?.idx === idx ? thought : null}
              size="var(--ag-size)"
            />
          </div>
        );
      })}

      <Style>{agentCss}</Style>
    </div>
  );
}

// ---------------------------------------------------------------- mini squad (Fear & Greed)

export function MoodSquad() {
  const { fng, reduced, eco, forecast } = useStore();
  const calm = reduced || eco;
  const v = fng?.value ?? 50;
  const total = 6;
  const bullN = v >= 75 ? 5 : v >= 55 ? 4 : v >= 45 ? 3 : v >= 25 ? 2 : 1;

  const [looks, setLooks] = useState<Look[]>(() => Array.from({ length: total }, () => ({ x: 0, y: 0 })));
  const base = useRef<Look[]>(Array.from({ length: total }, () => ({ x: 0, y: 0 })));
  const targ = useRef<Look[]>(
    Array.from({ length: total }, (_, i) => {
      const r = mulberry32(i * 17 + 3);
      return { x: (r() - 0.5) * 1.6, y: (r() - 0.5) * 1 };
    }),
  );
  const [dialog, setDialog] = useState<{ a: number; b: number; line: string } | null>(null);
  const fRef = useRef(forecast);
  fRef.current = forecast;

  useEffect(() => {
    if (calm) return;
    const eyes = setInterval(() => {
      const b = base.current;
      const t = targ.current;
      for (let i = 0; i < total; i++) {
        if (Math.random() < 0.05) t[i] = { x: rr(-1.2, 1.2), y: rr(-0.7, 0.7) };
        b[i].x += (t[i].x - b[i].x) * 0.15;
        b[i].y += (t[i].y - b[i].y) * 0.15;
      }
      setLooks(b.map((l) => ({ x: l.x, y: l.y })));
    }, 240);

    let last = Date.now() - 2500;
    const talk = setInterval(() => {
      const now = Date.now();
      if (dialog || now - last < 5000 || Math.random() < 0.45) return;
      last = now;
      const a = Math.floor(Math.random() * total);
      let b = a + (Math.random() < 0.5 ? 1 : -1);
      if (b < 0 || b >= total) b = (a + 1) % total;
      const f = fRef.current;
      const line = !f
        ? "⌁ …"
        : a < bullN
          ? pick([`P↑ ${pct0(f.probUp)}`, `Δ7д ${sgn(f.medianMove?.d7)}`, `F&G ${v}`])
          : pick([`P↓ ${pct0(f.probDown)}`, `FLAT ${pct0(f.probFlat)}`, `F&G ${v}`]);
      setDialog({ a, b, line });
      setTimeout(() => setDialog(null), 2600);
    }, 900);

    return () => { clearInterval(eyes); clearInterval(talk); };
  }, [calm, dialog, bullN, v]);

  const cx = (i: number) => ((i + 0.5) / total) * 100;

  return (
    <div className={`mood-squad mono${calm ? " calm" : ""}`}>
      <div className="ms-head">
        <span className="dim">ТОЛПА · F&G</span>
        <span className={`ms-v ${bullN >= 3 ? "bull" : "bear"}`}>{v}</span>
        <span className="dim">{fng?.label ?? "…"}</span>
      </div>
      <div className="ms-row">
        <svg className="ms-cables" viewBox="0 0 100 40" preserveAspectRatio="none">
          {dialog && (
            <path
              className="cable c-talk"
              d={`M ${cx(dialog.a)} 20 Q ${(cx(dialog.a) + cx(dialog.b)) / 2} ${dialog.a % 2 ? 4 : 36} ${cx(dialog.b)} 20`}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {Array.from({ length: total }, (_, i) => (
          <div className="ms-slot" key={i}>
            <Agent
              idx={100 + i}
              side={i < bullN ? "bull" : "bear"}
              look={looks[i] ?? { x: 0, y: 0 }}
              hop={0}
              calm={calm}
              dome={!!dialog && (dialog.a === i || dialog.b === i)}
              radar={null}
              speech={dialog && (dialog.a === i || dialog.b === i) ? (dialog.a === i ? dialog.line : "…") : null}
              thought={null}
              size="var(--ag-mini)"
            />
          </div>
        ))}
      </div>
      <Style>{moodCss}</Style>
    </div>
  );
}

// ---------------------------------------------------------------- styles

const agentCss = `
.agents-overlay {
  position: absolute; inset: 0; z-index: 25; pointer-events: none;
  --ag-size: calc(var(--u) * 42);
}
.agents-overlay .cables { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: none; overflow: visible; }

.cable { fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: 7 9; animation: cable-run 0.85s linear infinite; }
.cable.c-team { stroke: rgba(45, 212, 255, 0.8); filter: drop-shadow(0 0 3px rgba(45,212,255,0.8)); }
.cable.c-cross { stroke: rgba(216, 230, 245, 0.75); stroke-dasharray: 3 10; animation-duration: 0.65s; }
.cable.c-talk { stroke: #2DD4FF; stroke-width: 2.2; animation-duration: 0.5s; filter: drop-shadow(0 0 6px rgba(45,212,255,0.9)); }
.node { fill: #2DD4FF; animation: node-pulse 1.1s ease-in-out infinite; }
.node.n-bull, .node.n-team.bull { fill: var(--bull); }
.node.n-bear { fill: var(--bear); }
.node.n-cross { fill: #D8E6F5; }
@keyframes cable-run { to { stroke-dashoffset: -32; } }
@keyframes node-pulse { 0%,100% { r: 3; opacity: 1; } 50% { r: 4.6; opacity: 0.55; } }

/* uplink packet → neural sphere */
.packet .pk-line {
  stroke: var(--c); stroke-width: 1.5; stroke-dasharray: 6 8;
  animation: pkLine 1.1s ease both;
}
.packet .pk-dot {
  fill: var(--c);
  filter: drop-shadow(0 0 6px var(--c));
  animation: pkFly 1.1s cubic-bezier(0.4, 0, 0.6, 1) both;
}
@keyframes pkLine { 0% { opacity: 0; } 15% { opacity: 0.9; } 100% { opacity: 0; } }
@keyframes pkFly {
  0% { transform: translate(0, 0); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)); opacity: 0.2; }
}
.pk-label {
  position: absolute; z-index: 6;
  transform: translate(10px, -100%);
  font-size: calc(var(--fs-xs) * 0.85);
  background: rgba(5, 10, 18, 0.95);
  border: 1px solid;
  padding: calc(var(--u) * 3) calc(var(--u) * 6);
  white-space: nowrap; letter-spacing: 0.05em;
  animation: pkLabel 1.15s ease both;
  font-variant-numeric: tabular-nums;
}
@keyframes pkLabel {
  0% { opacity: 0; transform: translate(10px, -70%); }
  18% { opacity: 1; transform: translate(10px, -100%); }
  75% { opacity: 1; transform: translate(10px, -140%); }
  100% { opacity: 0; transform: translate(10px, -175%); }
}

.oflag {
  position: absolute; z-index: 26; pointer-events: none;
  display: flex; gap: calc(var(--u) * 7); align-items: baseline;
  font-size: calc(var(--fs-xs) * 0.85); letter-spacing: 0.1em;
  background: rgba(5,10,18,0.6);
  border: 1px solid rgba(27,58,92,0.7);
  padding: calc(var(--u) * 3) calc(var(--u) * 8);
}
.oflag b { font-weight: 700; }
.oflag i { font-style: normal; font-variant-numeric: tabular-nums; }
.oflag s { text-decoration: none; color: var(--dim); }
.oflag.f-bull { border-color: rgba(25,245,138,0.45); }
.oflag.f-bull b, .oflag.f-bull i { color: var(--bull); text-shadow: 0 0 calc(var(--u)*6) rgba(25,245,138,0.6); }
.oflag.f-bear { border-color: rgba(255,59,92,0.45); }
.oflag.f-bear b, .oflag.f-bear i { color: var(--bear); text-shadow: 0 0 calc(var(--u)*6) rgba(255,59,92,0.6); }

.a-slot {
  position: absolute; z-index: 6;
  transform: translate(-50%, -50%);
  transition: left 1.55s cubic-bezier(0.4, 0.1, 0.2, 1), top 1.55s cubic-bezier(0.4, 0.1, 0.2, 1);
}
.agent { position: relative; display: block; }
.agent .agent-bob {
  width: 100%; height: 100%;
  transform-origin: 50% 92%;
  animation: ag-breathe 2.9s ease-in-out infinite;
  animation-delay: var(--bd, 0s);
}
.agent svg { width: 100%; height: 100%; display: block; overflow: visible; }
.agent > div svg { position: relative; z-index: 2; }
.a-bull .agent-bob svg { filter: drop-shadow(0 0 calc(var(--u) * 5) rgba(25, 245, 138, 0.55)); }
.a-bear .agent-bob svg { filter: drop-shadow(0 0 calc(var(--u) * 5) rgba(255, 59, 92, 0.55)); }
.agent .body { fill: var(--bull); }
.a-bear .body { fill: var(--bear); }
.agent .gloss { fill: rgba(255, 255, 255, 0.4); }
.agent .eye { fill: #04141c; }
.agent .eye-blink {
  transform-box: fill-box; transform-origin: 50% 50%;
  animation: ag-blink var(--bl, 4s) infinite;
  animation-delay: var(--bd, 0s);
}
.agent.hop { animation: ag-hop 0.65s cubic-bezier(0.34, 0.12, 0.28, 1) 1; }

/* dome over a talking agent — small, glassy, transparent colour of their side */
.dome {
  position: absolute; left: 50%; bottom: 6%;
  width: 168%; aspect-ratio: 2 / 1.02;
  transform: translateX(-50%);
  border-radius: 50% 50% 18% 18% / 82% 82% 10% 10%;
  border: 1px solid; border-bottom: none;
  pointer-events: none; z-index: 1;
  animation: dome-in 0.3s ease both, dome-pulse 1.6s ease-in-out 0.3s infinite;
}
.dome::before {
  content: ""; position: absolute; left: 16%; right: 16%; top: 12%; height: 34%;
  border-radius: 50%; border-top: 1px solid rgba(255, 255, 255, 0.45);
  opacity: 0.7; pointer-events: none;
}
.dome::after {
  content: ""; position: absolute; left: 18%; right: 18%; bottom: -3px; height: 3px;
  border-radius: 50%; filter: blur(2px); opacity: 0.8;
}
.dome.d-bull {
  border-color: rgba(25, 245, 138, 0.75);
  background: radial-gradient(130% 140% at 50% 125%, rgba(25,245,138,0.22), rgba(25,245,138,0.05) 62%, rgba(25,245,138,0) 84%);
  box-shadow: 0 0 calc(var(--u) * 9) rgba(25, 245, 138, 0.3), inset 0 0 calc(var(--u) * 10) rgba(25, 245, 138, 0.08);
}
.dome.d-bull::after { background: rgba(25, 245, 138, 0.7); }
.dome.d-bear {
  border-color: rgba(255, 59, 92, 0.75);
  background: radial-gradient(130% 140% at 50% 125%, rgba(255,59,92,0.22), rgba(255,59,92,0.05) 62%, rgba(255,59,92,0) 84%);
  box-shadow: 0 0 calc(var(--u) * 9) rgba(255, 59, 92, 0.3), inset 0 0 calc(var(--u) * 10) rgba(255, 59, 92, 0.08);
}
.dome.d-bear::after { background: rgba(255, 59, 92, 0.7); }
@keyframes dome-in { from { opacity: 0; transform: translateX(-50%) scale(0.55); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
@keyframes dome-pulse { 0%,100% { opacity: 0.88; } 50% { opacity: 1; } }

/* radar scope — scanning the current window */
.radar {
  position: absolute; left: 72%; top: -78%;
  width: calc(var(--u) * 30); height: calc(var(--u) * 30);
  z-index: 3; pointer-events: none;
  animation: radar-pop 0.35s ease both;
}
.radar svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 4px rgba(45,212,255,0.7)); }
.radar .rr { fill: none; stroke: rgba(45, 212, 255, 0.55); stroke-width: 1; }
.radar .r2 { stroke-dasharray: 3 3; }
.radar .r3 { fill: rgba(45, 212, 255, 0.35); stroke: none; }
.radar .beam { fill: rgba(45, 212, 255, 0.35); transform-origin: 14px 14px; animation: radar-spin 1.1s linear infinite; }
.radar .blip { fill: #19F58A; animation: blip-blink 0.9s ease-in-out infinite; }
.radar em {
  position: absolute; left: calc(100% + calc(var(--u) * 5)); top: 30%;
  font-style: normal; font-size: calc(var(--fs-xs) * 0.8); color: var(--cyan);
  white-space: nowrap; letter-spacing: 0.06em;
  text-shadow: 0 0 calc(var(--u) * 6) rgba(45, 212, 255, 0.7);
}
@keyframes radar-pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
@keyframes radar-spin { to { transform: rotate(360deg); } }
@keyframes blip-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.15; } }

.speech {
  position: absolute; bottom: calc(100% + calc(var(--u) * 7)); left: 50%;
  transform: translateX(-50%);
  font-size: calc(var(--fs-xs) * 0.88);
  letter-spacing: 0.04em; white-space: nowrap;
  padding: calc(var(--u) * 4) calc(var(--u) * 7);
  background: rgba(5, 10, 18, 0.96);
  border: 1px solid; z-index: 8;
  animation: speech-in 0.28s ease both;
  font-variant-numeric: tabular-nums;
  max-width: calc(var(--u) * 240);
  overflow: hidden; text-overflow: ellipsis;
}
.speech::after {
  content: ""; position: absolute; top: 100%; left: 50%;
  transform: translateX(-50%);
  border: calc(var(--u) * 4) solid transparent;
}
.s-bull { color: var(--bull); border-color: rgba(25,245,138,0.8); box-shadow: 0 0 calc(var(--u)*10) rgba(25,245,138,0.35); }
.s-bull::after { border-top-color: rgba(25,245,138,0.8); }
.s-bear { color: var(--bear); border-color: rgba(255,59,92,0.8); box-shadow: 0 0 calc(var(--u)*10) rgba(255,59,92,0.35); }
.s-bear::after { border-top-color: rgba(255,59,92,0.8); }
@keyframes speech-in { from { opacity: 0; transform: translate(-50%, calc(var(--u) * 6)) scale(0.9); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }

.think {
  position: absolute; bottom: calc(100% + calc(var(--u) * 6)); left: 50%;
  transform: translateX(-50%);
  background: rgba(5, 10, 18, 0.95);
  border: 1px solid var(--cyan);
  box-shadow: 0 0 calc(var(--u) * 10) rgba(45, 212, 255, 0.35);
  color: var(--ink);
  font-size: calc(var(--fs-xs) * 0.85);
  letter-spacing: 0.06em;
  padding: calc(var(--u) * 3) calc(var(--u) * 7);
  white-space: nowrap; z-index: 7;
  animation: ag-think 1.9s ease both;
}
.think::after {
  content: ""; position: absolute; top: 100%; left: 50%;
  transform: translateX(-50%);
  border: calc(var(--u) * 4) solid transparent;
  border-top-color: var(--cyan);
}
@keyframes ag-think {
  0% { opacity: 0; transform: translate(-50%, calc(var(--u) * 8)) scale(0.8); }
  14% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  80% { opacity: 1; transform: translate(-50%, calc(var(--u) * -3)) scale(1); }
  100% { opacity: 0; transform: translate(-50%, calc(var(--u) * -9)) scale(0.94); }
}

@keyframes ag-breathe {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.04, 0.965); }
}
@keyframes ag-blink {
  0%, 91%, 100% { transform: scaleY(1); }
  94.5% { transform: scaleY(0.06); }
  97.5% { transform: scaleY(1); }
}
@keyframes ag-hop {
  0% { transform: translateY(0) scale(1, 1); }
  30% { transform: translateY(-46%) scale(0.93, 1.08); }
  62% { transform: translateY(5%) scale(1.06, 0.92); }
  82% { transform: translateY(-8%) scale(0.99, 1.02); }
  100% { transform: translateY(0) scale(1, 1); }
}

.agents-overlay.calm .a-slot { transition: none; }
.agents-overlay.calm .agent, .agents-overlay.calm .agent *,
.mood-squad.calm .agent, .mood-squad.calm .agent * { animation: none !important; }
.agents-overlay.calm .cable, .mood-squad .cable { animation: none; stroke-dasharray: none; opacity: 0.5; }
.agents-overlay.calm .packet, .agents-overlay.calm .pk-label { display: none; }

@media (max-width: 1024px) {
  .agents-overlay { --ag-size: calc(var(--u) * 32); }
  .oflag { font-size: calc(var(--fs-xs) * 0.7); padding: calc(var(--u) * 2) calc(var(--u) * 5); }
  .speech, .think { font-size: calc(var(--fs-xs) * 0.72); white-space: normal; text-align: center; max-width: 44vw; }
}
`;

const moodCss = `
.mood-squad { position: relative; flex: 0 0 auto; margin-top: calc(var(--u) * 8); --ag-mini: calc(var(--u) * 24); }
.ms-head {
  display: flex; gap: calc(var(--u) * 7); align-items: baseline;
  font-size: calc(var(--fs-xs) * 0.82); letter-spacing: 0.12em;
  margin-bottom: calc(var(--u) * 5);
}
.ms-v { font-weight: 700; font-variant-numeric: tabular-nums; }
.ms-row { position: relative; display: flex; gap: calc(var(--u) * 4); justify-content: center; padding-top: calc(var(--u) * 16); }
.ms-slot { position: relative; display: flex; }
.ms-cables { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.ms-cables .cable { stroke: #2DD4FF; stroke-width: 1.4; }
.mood-squad .speech { font-size: calc(var(--fs-xs) * 0.72); padding: calc(var(--u)*3) calc(var(--u)*5); }
.mood-squad .dome { width: 158%; }
@media (max-width: 1024px) { .mood-squad { --ag-mini: calc(var(--u) * 20); } }
`;
