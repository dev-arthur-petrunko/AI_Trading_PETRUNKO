"use client";

import { useEffect, useState } from "react";
import { useStore, apiGet } from "@/lib/store";
import { Panel } from "@/components/Panel";
import { AnalogTimeline } from "@/components/panels/AnalogTimeline";
import { COLORS, fmtPct, fmtDate } from "@/lib/format";
import type { Analog } from "@/lib/types";

type Resp = {
  symbol: string;
  analogs: Analog[];
  windowLen: number;
  horizonDays: number;
  tf: string;
  t0: number;
  t1: number;
  current: number;
  currentT: number;
};

/** АНАЛОГИ: full timeline + table of the top matches with their outcomes. */
export function AnalogsView() {
  const { symbol, swapKey, forecast } = useStore();
  const [data, setData] = useState<Resp | null>(null);
  const [sel, setSel] = useState<Analog | null>(null);

  useEffect(() => {
    let dead = false;
    apiGet<Resp>("/api/analogs", { symbol, top: 50 })
      .then((r) => !dead && setData(r))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [symbol, swapKey, forecast?.computedAt]);

  return (
    <div className="an">
      <Panel title="Таймлайн аналогов по месяцам (клик — наложение)" icon="▤" delay={80} className="an-tl">
        <AnalogTimeline />
      </Panel>

      <Panel title={`Топ аналогов ${symbol} · окно ${data?.windowLen ?? "—"} свечей`} icon="≡" delay={160} className="an-list" flush>
        <div className="lst scroll-thin">
          <div className="h mono">
            <span>ПЕРИОД</span><span>СХОЖЕСТЬ</span><span>ЧЕРЕЗ 24Ч</span><span>7Д</span><span>30Д</span>
          </div>
          {(data?.analogs ?? []).map((a) => (
            <div key={a.t} className={`r ${sel?.t === a.t ? "on" : ""}`} onClick={() => setSel(a)}>
              <span className="cy">{fmtDate(a.t)}</span>
              <span className="mono">
                <span className="simbar" style={{ width: `${a.sim * 100}%` }} />
                {(a.sim * 100).toFixed(0)}%
              </span>
              <span className={`mono ${a.r1d >= 0 ? "bull" : "bear"}`}>{fmtPct(a.r1d, 1)}</span>
              <span className={`mono ${a.r7d >= 0 ? "bull" : "bear"}`}>{fmtPct(a.r7d, 1)}</span>
              <span className={`mono ${a.r30d >= 0 ? "bull" : "bear"}`}>{fmtPct(a.r30d, 1)}</span>
            </div>
          ))}
          {!data?.analogs?.length && <div className="empty mono dim">аналоги ещё не посчитаны…</div>}
        </div>
      </Panel>

      <Panel title="Как это работает" icon="?" delay={240} className="an-how">
        <p className="how mono">
          1. Окно {data?.windowLen ?? "—"} свечей ({data?.tf === "1d" ? "дневные" : "часовые"}) превращается в «форму кривой»:
          нормируем лог-возвраты, чтобы сравнивать 2018 год с 2025-м.
          <br />2. Скользим по всей истории: косинусная схожесть/корреляция Пирсона — грубая фильтрация,
          затем DTW (динамическое выравнивание времени) уточняет ранжир.
          <br />3. Топ-50 без пересечения с текущим окном. Для каждого — доходность через 24ч / 7д / 30д.
          <br />4. P(up) — взвешенная доля «вверх» (более похожие весят больше: вес = схожесть³).
          <br />5. Дальше — смесь с техникой, микроструктурой и режимом рынка.
        </p>
      </Panel>

      <style>{`
        .an { display: grid; grid-template-columns: repeat(12, 1fr); grid-template-rows: calc(var(--u) * 300) 1fr; gap: calc(var(--u) * 8); flex: 1; min-height: 0; }
        .an-tl { grid-column: span 8; grid-row: span 2; }
        .an-list { grid-column: span 4; }
        .an-how { grid-column: span 4; }
        .lst { height: 100%; overflow: auto; font-family: "JetBrains Mono", monospace; font-size: var(--fs-xs); }
        .lst .h, .lst .r { display: grid; grid-template-columns: 1.2fr 1fr 0.9fr 0.9fr 0.9fr; gap: calc(var(--u) * 6); padding: calc(var(--u) * 5) calc(var(--u) * 9); align-items: center; }
        .lst .h { color: var(--dim); letter-spacing: 0.08em; position: sticky; top: 0; background: rgba(5,10,18,0.95); border-bottom: 1px solid var(--stroke); }
        .lst .r { cursor: pointer; border-bottom: 1px solid rgba(27,58,92,0.35); position: relative; }
        .lst .r:hover { background: rgba(45,212,255,0.07); }
        .lst .r.on { background: rgba(255,176,32,0.1); box-shadow: inset 3px 0 0 var(--amber); }
        .simbar { display: inline-block; height: calc(var(--u) * 5); background: linear-gradient(90deg, ${COLORS.cyan}, ${COLORS.bull}); margin-right: calc(var(--u) * 6); vertical-align: middle; opacity: 0.8; }
        .how { font-size: calc(var(--fs-xs) * 0.95); line-height: 1.75; color: var(--dim); }
        .empty { padding: calc(var(--u) * 10); }
        @media (max-width: 1024px) { .an { display: flex; flex-direction: column; } .an .panel { min-height: calc(var(--u) * 300); } }
      `}</style>
    </div>
  );
}
