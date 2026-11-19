"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";

/**
 * Live AGENTS — visual embodiment of the bull/bear fight:
 *  - green blob-agents (bulls) vs red blob-agents (bears), counts ∝ real probabilities;
 *  - they WALK around the panel (smooth slot jitter), breathe, blink, track the cursor;
 *  - CABLES connect them (running dash packets) — team links and cross-team links;
 *  - when two agents TALK they get a dome of their own colour + speech bubbles with
 *    REAL numbers from the forecast (nothing is invented);
 *  - most of the time somebody is ANALYZING: a small radar scope spins over their head.
 */

type Side = "bull" | "bear";
type Look = { x: number; y: number };
type Pos = { x: number; y: number };
type Link = { id: number; a: number; b: number; kind: "team" | "cross" | "talk"; born: number };
type Dialog = { a: number; b: number; kind: "team" | "cross"; born: number; turn: 0 | 1; lineA: string; lineB: string };
type Radar = { idx: number; born: number; label: string };

const MAX_AGENTS = 10;

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

/** Deterministic PRNG so SSR and first client render agree. */
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

// ---------------------------------------------------------------- slot geometry
// bulls patrol the upper band, bears the lower band; each has its own x-slot.

type Counts = { bull: number; bear: number };

function slotOf(idx: number, c: Counts) {
  const isBull = idx < c.bull;
  const i = isBull ? idx : idx - c.bull;
  const n = isBull ? c.bull : c.bear;
  const w = 86 / n;
  const x0 = 7 + i * w;
  const y0 = isBull ? 14 : 57;
  const ySpan = isBull ? 26 : 25;
  return { cx: x0 + w / 2, xJit: w * 0.3, y0, ySpan };
}

function initPos(c: Counts): Pos[] {
  const rnd = mulberry32(777);
  return Array.from({ length: MAX_AGENTS }, (_, i) => {
    const s = slotOf(i, c);
    return { x: s.cx + (rnd() - 0.5) * s.xJit, y: s.y0 + rnd() * s.ySpan };
  });
}

function jitterPos(idx: number, c: Counts): Pos {
  const s = slotOf(idx, c);
  return { x: s.cx + rr(-s.xJit, s.xJit), y: s.y0 + rr(0, s.ySpan) };
}

// ---------------------------------------------------------------- speech pool (real numbers only)

function bullLines(f: any, ctx: { chg?: number; fng?: number }): string[] {
  if (!f) return ["⌁ сканирую рынок…"];
  return [
    `P↑ ${pct0(f.probUp)} — входим?`,
    f.best ? `аналог ${Math.round(f.best.sim * 100)}% · ${f.best.label}` : "⌁ ищу аналоги",
    `Δ7д ${sgn(f.medianMove?.d7)}`,
    `уверенность ${pct0(f.confidence)}`,
    ctx.chg !== undefined ? `24ч ${sgn(ctx.chg / 100)}` : `FLAT ${pct0(f.probFlat)}`,
    ctx.fng !== undefined ? `F&G ${ctx.fng} → жадность?` : `история: ${f.upCount}/${f.count} вверх`,
  ];
}

function bearLines(f: any, ctx: { chg?: number; funding?: number }): string[] {
  if (!f) return ["⌁ ищу риск…"];
  return [
    `P↓ ${pct0(f.probDown)} — шортим?`,
    ctx.funding !== undefined ? `funding ${(ctx.funding * 100).toFixed(4)}%` : `σ разброс ${sgn(f.spread?.d7)}`,
    f.second ? `контр-аналог ${f.second.label}` : `FLAT ${pct0(f.probFlat)}`,
    `риск растёт · conf ${pct0(f.confidence)}`,
    ctx.chg !== undefined ? `24ч ${sgn(ctx.chg / 100)}` : `медиана ${sgn(f.medianMove?.d30)}`,
    `доминирование ↓ ${pct0(f.probDown)}`,
  ];
}

function scanLabels(f: any): string[] {
  if (!f) return ["⌁ RSI …", "⌁ MACD …"];
  return [
    `⌁ RSI-сигнал`,
    `⌁ корреляция ${(f.components?.analogs?.p ?? 0.5) * 100 | 0}%`,
    `⌁ окно 336 / 7д`,
    `⌁ топ-${f.count ?? 50} аналогов`,
    `⌁ micro ${pct0(f.components?.micro?.p)}`,
    `⌁ режим ${pct0(f.components?.regime?.p)}`,
  ];
}

// ---------------------------------------------------------------- one agent

export function Agent({
  idx,
  side,
  look,
  hop,
  calm,
  dome,
  radar,
  speech,
  thought,
  size,
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

      {speech && (
        <span className={`speech mono s-${side}`} key={speech}>
          {speech}
        </span>
      )}
      {thought && (
        <span className="think mono" key={thought.tok}>
          {thought.text}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- hero swarm (sphere panel)

export function AgentSwarm() {
  const { forecast, events, symbol, reduced, eco, stats, fng } = useStore();
  const calm = reduced || eco;

  const fRef = useRef(forecast);
  fRef.current = forecast;
  const ctxRef = useRef({ chg: stats[symbol]?.chg, fng: fng?.value, funding: forecast?.micro?.funding });
  ctxRef.current = { chg: stats[symbol]?.chg, fng: fng?.value, funding: forecast?.micro?.funding };

  const counts = useMemo(
    () => squadCounts(forecast?.probUp ?? 0.5, forecast?.probDown ?? 0.5),
    [forecast?.probUp, forecast?.probDown],
  );
  const countsRef = useRef(counts);
  countsRef.current = counts;

  const fieldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 340 });

  // ---- state -------------------------------------------------------------
  const [looks, setLooks] = useState<Look[]>(() =>
    Array.from({ length: MAX_AGENTS }, () => ({ x: 0, y: 0 })),
  );
  const baseRef = useRef<Look[]>(Array.from({ length: MAX_AGENTS }, () => ({ x: 0, y: 0 })));
  const targRef = useRef<Look[]>(
    Array.from({ length: MAX_AGENTS }, (_, i) => {
      const r = mulberry32(i * 31 + 5);
      return { x: (r() - 0.5) * 2, y: (r() - 0.5) * 1.2 };
    }),
  );
  const ptrRef = useRef<{ x: number; y: number } | null>(null);

  const [pos, setPos] = useState<Pos[]>(() => initPos(counts));
  const [hops, setHops] = useState<Record<number, number>>({});
  const [links, setLinks] = useState<Link[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [radars, setRadars] = useState<Radar[]>([]);
  const [thought, setThought] = useState<{ idx: number; text: string; tok: number } | null>(null);

  const linksRef = useRef(links);
  linksRef.current = links;
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const radarsRef = useRef(radars);
  radarsRef.current = radars;
  const posRef = useRef(pos);
  posRef.current = pos;
  const lastEvt = useRef(0);
  const clearThought = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reset patrol zones when squad sizes change (probabilities moved)
  useEffect(() => {
    setPos((p) => p.map((_, i) => jitterPos(i, counts)));
  }, [counts.bull, counts.bear]);

  // ---- field size --------------------------------------------------------
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0) setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // ---- hop reactions on trades/walls ------------------------------------
  const hopSide = (side: Side, times = 1) => {
    const c = countsRef.current;
    setHops((h) => {
      const next = { ...h };
      const [from, to] = side === "bull" ? [0, c.bull] : [c.bull, c.bull + c.bear];
      const i = from + Math.floor(Math.random() * Math.max(1, to - from));
      next[i] = (next[i] ?? 0) + times;
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

  // ---- eyes: cursor tracking + saccades ---------------------------------
  useEffect(() => {
    if (calm) return;
    const onMove = (e: PointerEvent) => {
      ptrRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove);
    const id = setInterval(() => {
      const base = baseRef.current;
      const targ = targRef.current;
      for (let i = 0; i < MAX_AGENTS; i++) {
        if (Math.random() < 0.035) targ[i] = { x: rr(-1.3, 1.3), y: rr(-0.8, 0.8) };
        base[i].x += (targ[i].x - base[i].x) * 0.16;
        base[i].y += (targ[i].y - base[i].y) * 0.16;
      }
      const p = ptrRef.current;
      const field = fieldRef.current;
      const nodes = field ? Array.from(field.querySelectorAll<HTMLElement>("[data-agent]")) : [];
      const next: Look[] = [];
      for (let i = 0; i < MAX_AGENTS; i++) {
        let x = base[i].x;
        let y = base[i].y;
        const el = nodes.find((n) => Number(n.dataset.agent) === i);
        if (p && el) {
          const b = el.getBoundingClientRect();
          const dx = (p.x - (b.left + b.width / 2)) / (b.width * 4);
          const dy = (p.y - (b.top + b.height / 2)) / (b.height * 4);
          x += clamp(dx, -1.2, 1.2);
          y += clamp(dy, -1.2, 1.2);
        }
        next.push({ x: clamp(x, -1.8, 1.8), y: clamp(y, -1.3, 1.3) });
      }
      setLooks(next);
    }, 170);
    return () => {
      window.removeEventListener("pointermove", onMove);
      clearInterval(id);
    };
  }, [calm]);

  // ---- life loop: walking, cables, talks, analysis ----------------------
  useEffect(() => {
    if (calm) return;
    let linkId = 1;
    let lastAction = 0;
    let lastDialogAt = Date.now() - 3000;
    let lastThink = Date.now() - 2000;
    let lastWalk = 0;

    const occupied = (list: Link[], except?: number) => {
      const s = new Set<number>();
      for (const l of list) {
        if (l.id !== except) {
          s.add(l.a);
          s.add(l.b);
        }
      }
      if (dialogRef.current) {
        s.add(dialogRef.current.a);
        s.add(dialogRef.current.b);
      }
      return s;
    };

    const randomPair = (allowCross: boolean): [number, number] | null => {
      const c = countsRef.current;
      const total = c.bull + c.bear;
      if (total < 2) return null;
      const busy = occupied(linksRef.current);
      const cross = allowCross && Math.random() < 0.55;
      let a = -1,
        b = -1;
      for (let t = 0; t < 8; t++) {
        if (cross) {
          const bullI = Math.floor(Math.random() * c.bull);
          const bearI = c.bull + Math.floor(Math.random() * c.bear);
          a = bullI;
          b = bearI;
        } else {
          const side = Math.random() < 0.5;
          const from = side ? 0 : c.bull;
          const n = side ? c.bull : c.bear;
          if (n < 2) continue;
          const i1 = from + Math.floor(Math.random() * n);
          const i2 = from + Math.floor(Math.random() * n);
          if (i1 === i2) continue;
          a = Math.min(i1, i2);
          b = Math.max(i1, i2);
        }
        if (a >= 0 && b >= 0 && a !== b && !busy.has(a) && !busy.has(b)) return [a, b];
      }
      return null;
    };

    const tick = () => {
      const now = Date.now();
      const c = countsRef.current;
      const f = fRef.current;
      const ctx = ctxRef.current;

      // expire
      setLinks((ls) => ls.filter((l) => now - l.born < 2400));
      setRadars((rs) => rs.filter((r) => now - r.born < 2300));
      if (dialogRef.current && now - dialogRef.current.born > 3200) setDialog(null);

      // second turn of the conversation (both agents reply)
      const d = dialogRef.current;
      if (d && d.turn === 0 && now - d.born > 1500) {
        const lineA = pick(bullLines(f, ctx));
        const lineB = pick(bearLines(f, ctx));
        setDialog({ ...d, turn: 1, lineA, lineB });
      }

      if (now - lastWalk > 2200 && Math.random() < 0.75) {
        lastWalk = now;
        setPos((p) => {
          const next = p.slice();
          const moves = 1 + Math.floor(Math.random() * 2);
          for (let m = 0; m < moves; m++) {
            const idx = Math.floor(Math.random() * (c.bull + c.bear));
            next[idx] = jitterPos(idx, c);
          }
          return next;
        });
      }

      if (now - lastAction > 1500) {
        lastAction = now;
        // new cable
        if (linksRef.current.length < 3 && Math.random() < 0.75) {
          const pair = randomPair(true);
          if (pair) {
            const cross = pair[0] < c.bull && pair[1] >= c.bull;
            const kind = cross ? "cross" : "team";
            setLinks((ls) => [...ls, { id: linkId++, a: pair[0], b: pair[1], kind, born: now }]);
          }
        }
        // radar analysis
        if (radarsRef.current.length < 2 && Math.random() < 0.7) {
          const idx = Math.floor(Math.random() * (c.bull + c.bear));
          if (!radarsRef.current.some((r) => r.idx === idx)) {
            setRadars((rs) => [...rs, { idx, born: now, label: pick(scanLabels(f)) }]);
          }
        }
        // conversation
        if (!dialogRef.current && now - lastDialogAt > 4200 && Math.random() < 0.5) {
          const pair = randomPair(true);
          if (pair) {
            lastDialogAt = now;
            const kind = pair[0] < c.bull && pair[1] >= c.bull ? "cross" : "team";
            setDialog({
              a: pair[0],
              b: pair[1],
              kind,
              born: now,
              turn: 0,
              lineA: pick(bullLines(f, ctx)),
              lineB: pick(bearLines(f, ctx)),
            });
            setLinks((ls) => [...ls.filter((l) => l.kind !== "talk"), { id: linkId++, a: pair[0], b: pair[1], kind: "talk", born: now }]);
          }
        }
        // idle hop somewhere
        if (Math.random() < 0.6) {
          const idx = Math.floor(Math.random() * (c.bull + c.bear));
          setHops((h) => ({ ...h, [idx]: (h[idx] ?? 0) + 1 }));
        }
      }

      // analysing-thought bubble
      if (now - lastThink > 2700) {
        lastThink = now;
        const total = c.bull + c.bear;
        const idx = Math.floor(Math.random() * total);
        const side: Side = idx < c.bull ? "bull" : "bear";
        const text = !f
          ? "⌁ анализ…"
          : side === "bull"
            ? pick(bullLines(f, ctx).slice(1))
            : pick(bearLines(f, ctx).slice(1));
        if (clearThought.current) clearTimeout(clearThought.current);
        setThought({ idx, text, tok: now });
        clearThought.current = setTimeout(() => setThought(null), 1900);
      }
    };

    const id = setInterval(tick, 700);
    return () => {
      clearInterval(id);
      if (clearThought.current) clearTimeout(clearThought.current);
    };
  }, [calm]);

  // ---- cable geometry ----------------------------------------------------
  const toXY = (i: number): [number, number] => {
    const p = pos[i] ?? { x: 50, y: 50 };
    return [(p.x / 100) * size.w, (p.y / 100) * size.h];
  };

  const cablePath = (a: number, b: number) => {
    const [x1, y1] = toXY(a);
    const [x2, y2] = toXY(b);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const bend = 14;
    const cx = mx + (-dy / len) * bend;
    const cy = my + (dx / len) * bend;
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  const render = (n: number) => {
    const total = counts.bull + counts.bear;
    return Array.from({ length: n }, (_, i) => i).filter((i) => i < total);
  };

  return (
    <div className={`swarm${calm ? " calm" : ""}`} ref={fieldRef} aria-hidden>
      {/* ---- cable layer ---- */}
      <svg className="cables" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
        {links.map((l) => {
          const cls = `cable c-${l.kind}`;
          return <path key={l.id} className={cls} d={cablePath(l.a, l.b)} />;
        })}
        {links.map((l) => (
          <circle key={`n${l.id}`} className={`node n-a n-${l.kind}`} r="3" cx={toXY(l.a)[0]} cy={toXY(l.a)[1]} />
        ))}
        {links.map((l) => (
          <circle key={`m${l.id}`} className={`node n-b n-${l.kind}`} r="3" cx={toXY(l.b)[0]} cy={toXY(l.b)[1]} />
        ))}
      </svg>

      {/* ---- flags ---- */}
      <div className={`flag f-bull mono`}>
        <b>BULL-АГЕНТЫ</b><i>▲ {pct0(forecast?.probUp)}</i>
        <s>{forecast ? `команда ${counts.bull}` : "…"}</s>
      </div>
      <div className={`flag f-bear mono`}>
        <b>BEAR-АГЕНТЫ</b><i>▼ {pct0(forecast?.probDown)}</i>
        <s>{forecast ? `команда ${counts.bear}` : "…"}</s>
      </div>
      <div className="flag f-flat mono">
        <b>FLAT {pct0(forecast?.probFlat)}</b>
      </div>

      {/* ---- agents ---- */}
      {render(MAX_AGENTS).map((idx) => {
        const side: Side = idx < counts.bull ? "bull" : "bear";
        const p = pos[idx] ?? { x: 50, y: 50 };
        const d = dialog;
        const inDialog = d && (d.a === idx || d.b === idx);
        const radar = radars.find((r) => r.idx === idx);
        return (
          <div
            key={idx}
            data-agent={idx}
            className="slot"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <Agent
              idx={idx}
              side={side}
              look={looks[idx] ?? { x: 0, y: 0 }}
              hop={hops[idx] ?? 0}
              calm={calm}
              dome={!!inDialog}
              radar={radar ? radar.label : null}
              speech={inDialog ? (d!.a === idx ? d!.lineA : d!.lineB) : null}
              thought={thought?.idx === idx ? thought : null}
              size="var(--ag-size)"
            />
          </div>
        );
      })}

      <style>{agentCss}</style>
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

  const [looks, setLooks] = useState<Look[]>(() =>
    Array.from({ length: total }, () => ({ x: 0, y: 0 })),
  );
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
      const bullSide = a < bullN;
      const line = !f
        ? "⌁ …"
        : bullSide
          ? pick([`P↑ ${pct0(f.probUp)}`, `Δ7д ${sgn(f.medianMove?.d7)}`, `F&G ${v}`])
          : pick([`P↓ ${pct0(f.probDown)}`, `FLAT ${pct0(f.probFlat)}`, `F&G ${v}`]);
      setDialog({ a, b, line });
      setTimeout(() => setDialog(null), 2600);
    }, 900);

    return () => {
      clearInterval(eyes);
      clearInterval(talk);
    };
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
      <style>{moodCss}</style>
    </div>
  );
}

// ---------------------------------------------------------------- styles

const agentCss = `
.swarm {
  position: absolute; inset: 0; z-index: 6; pointer-events: none;
  --ag-size: calc(var(--u) * 46);
  overflow: hidden;
}
.swarm .cables { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; overflow: visible; }
.cable { fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: 7 9; animation: cable-run 0.85s linear infinite; }
.cable.c-team { stroke: rgba(45, 212, 255, 0.8); filter: drop-shadow(0 0 3px rgba(45,212,255,0.8)); }
.cable.c-cross { stroke: rgba(216, 230, 245, 0.75); stroke-dasharray: 3 10; animation-duration: 0.65s; filter: drop-shadow(0 0 3px rgba(216,230,245,0.7)); }
.cable.c-talk { stroke-width: 2.2; animation-duration: 0.5s; }
.cable.c-talk.c-team, .cable.c-talk { stroke: #2DD4FF; filter: drop-shadow(0 0 6px rgba(45,212,255,0.9)); }
.node { fill: #2DD4FF; opacity: 0.9; animation: node-pulse 1.1s ease-in-out infinite; }
.node.n-bull { fill: var(--bull); }
.node.n-bear { fill: var(--bear); }
@keyframes cable-run { to { stroke-dashoffset: -32; } }
@keyframes node-pulse { 0%,100% { r: 3; opacity: 1; } 50% { r: 4.6; opacity: 0.55; } }

.flag {
  position: absolute; z-index: 7; pointer-events: none;
  display: flex; align-items: baseline; gap: calc(var(--u) * 7);
  font-size: calc(var(--fs-xs) * 0.85); letter-spacing: 0.1em;
  background: rgba(5,10,18,0.55);
  border: 1px solid rgba(27,58,92,0.7);
  padding: calc(var(--u) * 3) calc(var(--u) * 8);
  backdrop-filter: blur(3px);
}
.flag b { font-weight: 700; }
.flag i { font-style: normal; font-variant-numeric: tabular-nums; }
.flag s { text-decoration: none; color: var(--dim); }
.f-bull { top: calc(var(--u) * 8); left: calc(var(--u) * 8); border-color: rgba(25,245,138,0.45); }
.f-bull b, .f-bull i { color: var(--bull); text-shadow: 0 0 calc(var(--u)*6) rgba(25,245,138,0.6); }
.f-bear { bottom: calc(var(--u) * 8); right: calc(var(--u) * 8); border-color: rgba(255,59,92,0.45); }
.f-bear b, .f-bear i { color: var(--bear); text-shadow: 0 0 calc(var(--u)*6) rgba(255,59,92,0.6); }
.f-flat { top: calc(var(--u) * 8); right: calc(var(--u) * 8); color: var(--dim); }
.f-flat b { color: var(--dim); }

.slot {
  position: absolute; z-index: 6;
  transform: translate(-50%, -50%);
  transition: left 1.5s cubic-bezier(0.4, 0.1, 0.2, 1), top 1.5s cubic-bezier(0.4, 0.1, 0.2, 1);
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

/* dome over a talking agent — colour of their side */
.dome {
  position: absolute; left: 50%; bottom: 8%;
  width: 215%; aspect-ratio: 2 / 1.25;
  transform: translateX(-50%);
  border-radius: 50% 50% 14% 14% / 74% 74% 8% 8%;
  border: 1.5px solid; border-bottom: none;
  pointer-events: none; z-index: 1;
  animation: dome-in 0.32s ease both, dome-pulse 1.05s ease-in-out 0.32s infinite;
}
.dome.d-bull {
  border-color: rgba(25, 245, 138, 0.85);
  background:
    radial-gradient(130% 100% at 50% 105%, rgba(25,245,138,0.32), rgba(25,245,138,0.05) 72%);
  box-shadow: 0 0 calc(var(--u) * 14) rgba(25, 245, 138, 0.45), inset 0 -8px 18px rgba(25, 245, 138, 0.16);
}
.dome.d-bear {
  border-color: rgba(255, 59, 92, 0.85);
  background:
    radial-gradient(130% 100% at 50% 105%, rgba(255,59,92,0.32), rgba(255,59,92,0.05) 72%);
  box-shadow: 0 0 calc(var(--u) * 14) rgba(255, 59, 92, 0.45), inset 0 -8px 18px rgba(255, 59, 92, 0.16);
}
@keyframes dome-in { from { opacity: 0; transform: translateX(-50%) scale(0.55); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
@keyframes dome-pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }

/* radar scope — "I am analysing right now" */
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
  font-size: calc(var(--fs-xs) * 0.9);
  letter-spacing: 0.05em; white-space: nowrap;
  padding: calc(var(--u) * 4) calc(var(--u) * 7);
  background: rgba(5, 10, 18, 0.96);
  border: 1px solid; z-index: 8;
  animation: speech-in 0.28s ease both;
  font-variant-numeric: tabular-nums;
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

/* eco / reduced-motion: keep them alive but quiet */
.swarm.calm .slot { transition: none; }
.swarm.calm .agent *, .swarm.calm .agent,
.mood-squad.calm .agent, .mood-squad.calm .agent * { animation: none !important; }
.swarm.calm .cable, .mood-squad .cable { animation: none; stroke-dasharray: none; opacity: 0.55; }

@media (max-width: 1024px) {
  .swarm { --ag-size: calc(var(--u) * 34); }
  .flag { font-size: calc(var(--fs-xs) * 0.75); padding: calc(var(--u) * 2) calc(var(--u) * 5); }
  .speech, .think { font-size: calc(var(--fs-xs) * 0.75); max-width: 44vw; white-space: normal; text-align: center; }
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
.mood-squad .dome { width: 200%; }
@media (max-width: 1024px) { .mood-squad { --ag-mini: calc(var(--u) * 20); } }
`;
