"use client";

import { useEffect, useState } from "react";
import { Style } from "@/components/Style";
import { Panel } from "@/components/Panel";
import { useStore, apiGet } from "@/lib/store";
import { COLORS, fmtPct, fmtPrice } from "@/lib/format";
import { runAI, type AiInput, type AiVerdict } from "@/components/ai/engine";

type AiState = {
  hourly: { count: number; first: number; last: number };
  daily: { count: number; first: string | null; last: string | null };
  monthly: { count: number; first: string | null; last: string | null };
  fullDays: number;
  nextHourAt: number;
  perSymbol: Record<string, { n: number; last: number }>;
  lastSnapshotAt: number;
};

export function useAiState() {
  const [st, setSt] = useState<AiState | null>(null);
  useEffect(() => {
    let dead = false;
    const pull = () =>
      apiGet<AiState>("/api/ai/state")
        .then((r) => !dead && setSt(r))
        .catch(() => {});
    pull();
    const t = setInterval(pull, 30000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);
  return st;
}

/** Собирает вход для AI-движка из текущего состояния дашборда + базы. */
export function useAiInput(): AiInput | null {
  const { symbol, stats, forecast, depth, fng, backtest } = useStore();
  const st = useAiState();
  if (!forecast || !st) return null;
  const micro = (forecast as { micro?: { funding?: number; oiChange?: number } }).micro || {};
  return {
    symbol,
    ts: Date.now(),
    price: stats[symbol]?.price ?? null,
    probUp: forecast.probUp,
    probDown: forecast.probDown,
    probFlat: forecast.probFlat,
    confidence: forecast.confidence,
    horizonDays: forecast.horizonDays,
    rsi: null,
    volAnn: null,
    fng: fng?.value ?? null,
    imbalance: depth?.imbalance ?? null,
    funding: micro.funding ?? null,
    oiChange: micro.oiChange ?? null,
    analogs: (forecast.analogs || []).slice(0, 5).map((a) => ({ label: a.label, sim: a.sim, r7d: a.r7d })),
    base: { hourly: st.hourly.count, daily: st.daily.count, monthly: st.monthly.count, fullDays: st.fullDays },
    hitRate: backtest?.computed ? backtest.hitRateAll : null,
    baseline: backtest?.computed ? backtest.baselineUp : null,
  };
}

/** Панель AI-движка: подключён ли код + вердикт. Общая для окна AI и Прогнозов. */
export function AiEnginePanel() {
  const input = useAiInput();
  const st = useAiState();
  const [verdict, setVerdict] = useState<AiVerdict | null>(null);

  useEffect(() => {
    if (!input) return;
    try {
      setVerdict(runAI(input));
    } catch {
      setVerdict(null);
    }
  }, [input]);

  const ready = !!input && !!verdict;

  return (
    <div className="aieng">
      {!ready && (
        <div className="stub mono">
          <div className="stub-h">AI-КОД НЕ ПОДКЛЮЧЁН</div>
          <p>
            Место под твой код: <b>components/ai/engine.ts</b> → <b>runAI()</b>.
            Промт и формат полей: <b>docs/AI_DATA.md</b>.
          </p>
          <p className="dim">
            Материал для анализа уже копится:{" "}
            {st ? (
              <>
                часовых <b className="cy">{st.hourly.count}</b> · суток{" "}
                <b className="cy">{st.fullDays}</b> полных · месяцев{" "}
                <b className="cy">{st.monthly.count}</b>
              </>
            ) : (
              "загрузка…"
            )}
          </p>
          <p className="dim">
            Следующий часовой снимок:{" "}
            <b className="amber">
              {st ? new Date(st.nextHourAt).toISOString().slice(11, 16) + " UTC" : "…"}
            </b>
          </p>
        </div>
      )}

      {ready && verdict && (
        <div className="vd">
          <div className="vd-top mono">
            <span className={`vd-tag v-${verdict.verdict.toLowerCase()}`}>{verdict.verdict}</span>
            <span className="vd-conf">уверенность {Math.round(verdict.confidence)}%</span>
          </div>
          <p className="vd-sum">{verdict.summary}</p>
          <div className="vd-tags mono">
            {verdict.tags?.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      )}
      <Style>{aiEngCss}</Style>
    </div>
  );
}

const aiEngCss = `
.aieng { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.stub { font-size: calc(var(--fs-xs) * 0.9); line-height: 1.6; color: var(--dim); border: 1px dashed rgba(45,212,255,0.45); padding: calc(var(--u) * 9); background: rgba(45,212,255,0.05); height: 100%; overflow: hidden; }
.stub-h { color: var(--cyan); letter-spacing: 0.14em; font-weight: 700; margin-bottom: calc(var(--u) * 6); }
.stub p { margin: 0 0 calc(var(--u) * 5); }
.stub b { color: var(--ink); font-weight: 600; }
.vd { display: flex; flex-direction: column; gap: calc(var(--u) * 6); height: 100%; }
.vd-top { display: flex; align-items: center; gap: calc(var(--u) * 8); }
.vd-tag { font-size: var(--fs-m); font-weight: 700; border: 1px solid; padding: 0 calc(var(--u) * 8); letter-spacing: 0.1em; }
.vd-tag.v-up { color: var(--bull); border-color: var(--bull); background: rgba(25,245,138,0.08); }
.vd-tag.v-down { color: var(--bear); border-color: var(--bear); background: rgba(255,59,92,0.08); }
.vd-tag.v-flat { color: var(--dim); border-color: var(--dim); }
.vd-conf { color: var(--cy, var(--cyan)); font-size: var(--fs-s); }
.vd-sum { font-size: var(--fs-s); line-height: 1.6; margin: 0; }
.vd-tags { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 5); font-size: calc(var(--fs-xs) * 0.8); }
.vd-tags span { border: 1px solid var(--stroke); color: var(--cyan); padding: 0 calc(var(--u) * 6); }
`;

/** ============================================================
 * ОКНО «AI» — состояние базы накопления + история для анализа.
 * ============================================================ */
export function AiView() {
  const { symbol, swapKey } = useStore();
  const st = useAiState();
  const [hourly, setHourly] = useState<Snapshot[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);

  useEffect(() => {
    let dead = false;
    const pull = () => {
      Promise.all([
        apiGet<{ rows: Snapshot[] }>("/api/ai/series", { symbol, level: "hourly", limit: 48 }),
        apiGet<{ rows: DailyRow[] }>("/api/ai/series", { symbol, level: "daily", limit: 14 }),
        apiGet<{ rows: MonthlyRow[] }>("/api/ai/series", { symbol, level: "monthly", limit: 12 }),
      ])
        .then(([h, d, m]) => {
          if (dead) return;
          setHourly(h.rows || []);
          setDaily(d.rows || []);
          setMonthly(m.rows || []);
        })
        .catch(() => {});
    };
    pull();
    const t = setInterval(pull, 60000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [symbol, swapKey]);

  const counts = [
    { k: "ЧАСОВЫХ СНИМКОВ", v: st?.hourly.count ?? "…", sub: st ? `след. ${new Date(st.nextHourAt).toISOString().slice(11, 16)} UTC` : "" },
    { k: "ПОЛНЫХ СУТОК", v: st?.fullDays ?? "…", sub: st ? `дней в базе ${st.daily.count}` : "" },
    { k: "МЕСЯЦЕВ", v: st?.monthly.count ?? "…", sub: st ? `период ${st.monthly.first ?? "—"} → ${st.monthly.last ?? "—"}` : "" },
    { k: "МОНЕТ", v: st ? Object.keys(st.perSymbol).length : "…", sub: symbol },
  ];

  return (
    <div className="ai">
      <Panel title="Накопление данных · каждый час" icon="◷" delay={80} className="ai-kpi">
        <div className="kpis">
          {counts.map((c) => (
            <div className="k" key={c.k}>
              <span className="kl mono">{c.k}</span>
              <span className="kv mono">{c.v}</span>
              <span className="ks mono dim">{c.sub}</span>
            </div>
          ))}
        </div>
        <p className="note mono dim">
          Логика: каждый час фиксируется снимок (прогноз + метрики + бэктест) → за сутки складывается
          суточная сводка → за месяц месячная. Чем дольше работает — тем глубже материал для AI.
          Подробно: <b className="cy">docs/AI_DATA.md</b>
        </p>
      </Panel>

      <Panel title="AI engine" icon="⌬" delay={160} className="ai-engine">
        <AiEnginePanel />
      </Panel>

      <Panel title={`Почасовая кривая ${symbol} · вероятность роста`} icon="∿" delay={240} className="ai-chart">
        <HourlyChart rows={hourly} />
      </Panel>

      <Panel title="Суточные сводки" icon="▤" delay={320} className="ai-daily" flush>
        <div className="tbl scroll-thin mono">
          <div className="h"><span>СУТКИ</span><span>N</span><span>P↑</span><span>CONF</span><span>ЦЕНА</span><span>HIT</span></div>
          {daily.map((d) => (
            <div className="r" key={d.day}>
              <span className="cy">{d.day.slice(5)}</span>
              <span className="dim">{d.n}</span>
              <span className={d.probUpAvg >= 0.5 ? "bull" : "bear"}>{fmtPct((d.probUpAvg ?? 0) - 0, 0)}</span>
              <span>{Math.round((d.confAvg ?? 0) * 100)}%</span>
              <span className="dim">{fmtPrice(d.priceClose ?? undefined, symbol)}</span>
              <span className="dim">{d.hitRate != null ? Math.round(d.hitRate * 100) + "%" : "—"}</span>
            </div>
          ))}
          {!daily.length && <div className="empty">ожидание суток…</div>}
        </div>
      </Panel>

      <Panel title="Месячные сводки" icon="▦" delay={400} className="ai-monthly" flush>
        <div className="tbl scroll-thin mono">
          <div className="h"><span>МЕСЯЦ</span><span>ДНЕЙ</span><span>P↑</span><span>ЦЕНА</span><span>HIT</span></div>
          {monthly.map((m) => (
            <div className="r" key={m.month}>
              <span className="cy">{m.month}</span>
              <span className="dim">{m.days}</span>
              <span className={(m.probUpAvg ?? 0) >= 0.5 ? "bull" : "bear"}>{fmtPct(m.probUpAvg ?? 0, 0)}</span>
              <span className="dim">{fmtPrice(m.priceClose ?? undefined, symbol)}</span>
              <span className="dim">{m.hitRate != null ? Math.round(m.hitRate * 100) + "%" : "—"}</span>
            </div>
          ))}
          {!monthly.length && <div className="empty">ожидание месяцев…</div>}
        </div>
      </Panel>

      <Style>{aiCss}</Style>
    </div>
  );
}

type Snapshot = {
  ts: number;
  price: number | null;
  probUp: number;
  confidence: number;
  rsi: number | null;
  fng: number | null;
  hitRate: number | null;
};
type DailyRow = { day: string; n: number; probUpAvg: number; confAvg: number; priceClose: number | null; hitRate: number | null };
type MonthlyRow = { month: string; days: number; n: number; probUpAvg: number; priceClose: number | null; hitRate: number | null };

function HourlyChart({ rows }: { rows: Snapshot[] }) {
  if (!rows.length) return <div className="empty mono">ожидание часовых снимков…</div>;
  const W = 600, H = 170;
  const pts = rows.map((r, i) => ({ x: (i / Math.max(1, rows.length - 1)) * W, v: r.probUp }));
  const toY = (v: number) => H - 10 - ((v - 0.3) / 0.4) * (H - 20); // 0.3..0.7 → 0..H
  const path = pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)},${toY(clamp01(p.v)).toFixed(1)}`).join(" ");
  const last = rows[rows.length - 1];
  const above = pts.filter((p) => p.v >= 0.5).length / pts.length;

  return (
    <div className="hchart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="hc-svg">
        <line x1="0" y1={toY(0.5)} x2={W} y2={toY(0.5)} stroke={COLORS.dim} strokeWidth="0.7" strokeDasharray="5 6" opacity="0.6" />
        <path d={path} fill="none" stroke={COLORS.cyan} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1].x} cy={toY(clamp01(last.probUp))} r="4" fill={COLORS.cyan} />
      </svg>
      <div className="hc-note mono dim">
        вероятность роста ≥50% в <b className="cy">{Math.round(above * 100)}%</b> часов ·
        последний снимок {fmtPct(last.probUp, 0)} (conf {Math.round((last.confidence ?? 0) * 100)}%) ·{" "}
        {new Date(last.ts).toISOString().slice(0, 16).replace("T", " ")} UTC
      </div>
      <Style>{`
        .hchart { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: calc(var(--u) * 5); }
        .hc-svg { flex: 1; min-height: 0; width: 100%; background: rgba(5,10,18,0.5); border: 1px solid rgba(27,58,92,0.55); }
        .hc-note { font-size: calc(var(--fs-xs) * 0.82); flex: 0 0 auto; }
        .empty { color: var(--dim); font-size: var(--fs-xs); display: flex; align-items: center; justify-content: center; height: 100%; letter-spacing: 0.08em; }
      `}</Style>
    </div>
  );
}

const clamp01 = (v: number) => Math.max(0.3, Math.min(0.7, v));

const aiCss = `
.ai { display: grid; grid-template-columns: repeat(12, 1fr); grid-template-rows: calc(var(--u) * 165) calc(var(--u) * 300) 1fr; gap: calc(var(--u) * 8); flex: 1; min-height: 0; }
.ai-kpi { grid-column: span 5; }
.ai-engine { grid-column: span 3; }
.ai-daily { grid-column: span 4; }
.ai-chart { grid-column: span 5; }
.ai-monthly { grid-column: span 3; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(var(--u) * 8); }
.k { border-left: calc(var(--u) * 3) solid var(--cyan); padding-left: calc(var(--u) * 8); display: flex; flex-direction: column; gap: calc(var(--u) * 3); min-width: 0; }
.kl { font-size: calc(var(--fs-xs) * 0.78); color: var(--dim); letter-spacing: 0.1em; white-space: nowrap; }
.kv { font-size: var(--fs-xl); font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.1; }
.ks { font-size: calc(var(--fs-xs) * 0.76); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note { font-size: calc(var(--fs-xs) * 0.86); line-height: 1.55; margin-top: calc(var(--u) * 8); border-left: 2px solid var(--amber); padding-left: calc(var(--u) * 8); }
.tbl { height: 100%; overflow: auto; font-size: calc(var(--fs-xs) * 0.9); }
.tbl .h, .tbl .r { display: grid; grid-template-columns: 1.1fr 0.7fr 0.9fr 0.9fr 1.3fr 0.8fr; gap: calc(var(--u) * 6); padding: calc(var(--u) * 4) calc(var(--u) * 9); align-items: center; }
.ai-monthly .tbl .h, .ai-monthly .tbl .r { grid-template-columns: 1.1fr 0.8fr 0.9fr 1.3fr 0.8fr; }
.tbl .h { color: var(--dim); letter-spacing: 0.08em; position: sticky; top: 0; background: rgba(5,10,18,0.95); border-bottom: 1px solid var(--stroke); font-size: calc(var(--fs-xs) * 0.8); }
.tbl .r { border-bottom: 1px solid rgba(27,58,92,0.35); font-variant-numeric: tabular-nums; }
.tbl .r:hover { background: rgba(45,212,255,0.06); }
.tbl .empty { grid-column: 1 / -1; color: var(--dim); letter-spacing: 0.08em; padding: calc(var(--u) * 14); }
@media (max-width: 1024px) {
  .ai { display: flex; flex-direction: column; }
  .ai .panel { min-height: calc(var(--u) * 220); }
  .kpis { grid-template-columns: repeat(2, 1fr); }
}
`;
