"use client";

import { Style } from "@/components/Style";

/**
 * ARC CARD — карточка-спутник орбиты (ТЗ v3 §B2): ~280u × 84u, слева цветная
 * полоска-акцент 3u, сверху подпись капсом + подзаголовок dim, справа крупное
 * значение моно, внизу спарклайн на всю ширину. Луч — от внутреннего края (§B3).
 */
export function ArcCard({
  id,
  label,
  sub,
  accent,
  value,
  valueTone,
  spark,
  children,
  className = "",
}: {
  id: string;
  label: string;
  sub?: string;
  accent: string;
  value?: React.ReactNode;
  valueTone?: string;
  spark?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mc-sat ${className}`} id={id} style={{ ["--acc" as string]: accent } as React.CSSProperties}>
      <span className="acc" aria-hidden />
      <div className="mc-body">
        <div className="mc-head">
          <span className="mc-lbl mono">{label}</span>
          {sub && <span className="mc-sub mono">{sub}</span>}
          {value !== undefined && (
            <span className="mc-val mono" style={valueTone ? { color: valueTone } : undefined}>
              {value}
            </span>
          )}
        </div>
        {children}
        {spark && <div className="mc-spark">{spark}</div>}
      </div>
      <Style>{`
        .mc-sat {
          position: relative; display: flex; min-width: 0; min-height: calc(var(--u) * 84);
          background: rgba(5,10,18,0.55); border: 1px solid rgba(27,58,92,0.7);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          transition: transform 0.3s ease, border-radius 0.3s ease, box-shadow 0.25s ease;
          cursor: default;
        }
        .mc-sat .acc { flex: 0 0 calc(var(--u) * 3); background: var(--acc); box-shadow: 0 0 calc(var(--u) * 8) var(--acc); }
        .mc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: calc(var(--u) * 3);
          padding: calc(var(--u) * 5) calc(var(--u) * 8); }
        .mc-head { display: flex; align-items: baseline; gap: calc(var(--u) * 6); }
        .mc-lbl { font-size: calc(var(--fs-xs) * 0.78); letter-spacing: 0.12em; color: var(--dim);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; }
        .mc-sub { font-size: calc(var(--fs-xs) * 0.72); color: var(--dim); opacity: 0.75;
          white-space: nowrap; margin-right: auto; }
        .mc-val { margin-left: auto; font-size: var(--fs-m); font-weight: 700; font-variant-numeric: tabular-nums;
          white-space: nowrap; color: var(--ink); }
        .mc-spark svg { display: block; width: 100%; height: calc(var(--u) * 18); }
        /* hover: подсветить свою карточку (§B7) — луч подсвечивается через [data-lit] в Orbit */
        .mc-sat:hover { border-color: var(--acc); box-shadow: 0 0 calc(var(--u) * 14) color-mix(in srgb, var(--acc) 35%, transparent); }
        @container (max-width: 250px) { .mc-sub { display: none; } }
      `}</Style>
    </div>
  );
}
