"use client";

import { StoreProvider, useStore } from "@/lib/store";
import { applyLayoutMode } from "@/lib/layout.config";
import { useEffect } from "react";
import { TopBar, TitleBlock, CoinPills, Ticker, Disclaimer, EfoToggle } from "@/components/Chrome";
import { IntroOverlay, LiveFeed } from "@/components/FeedPanels";
import { Panel } from "@/components/Panel";
import { Style } from "@/components/Style";
import { ArcCard } from "@/components/ArcCard";
import { HeroStrip } from "@/components/panels/HeroStrip";
import { MetricCards } from "@/components/panels/MetricCards";
import { LiveCandles } from "@/components/panels/LiveCandles";
import { OrderBook } from "@/components/panels/OrderBook";
import { FngGauge } from "@/components/panels/FngGauge";
import { NeuralSphere } from "@/components/panels/NeuralSphere";
import { DashboardAgents } from "@/components/panels/Agents";
import { OrbitLayer } from "@/components/Orbit";
import { AnalogTimeline } from "@/components/panels/AnalogTimeline";
import { ForecastFan } from "@/components/panels/ForecastFan";
import { ExecutionTape } from "@/components/panels/ExecutionTape";
import { MarketsView } from "@/components/views/MarketsView";
import { ForecastView } from "@/components/views/ForecastView";
import { HistoryView } from "@/components/views/HistoryView";
import { AnalogsView } from "@/components/views/AnalogsView";
import { BacktestView } from "@/components/views/BacktestView";
import { AboutView } from "@/components/views/AboutView";
import { AiView } from "@/components/views/AiView";
import { COLORS, fmtPct } from "@/lib/format";

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="grid" />
      <div className="scanlines" />
      <div className="vignette" />
    </div>
  );
}

/** Правая дуга орбиты (ТЗ v3 §B2): мини-Fan, риски, топ-3, hit-rate, лента. */
function HeroRightCards() {
  const { forecast, backtest, depth, fng, symbol, t } = useStore();

  const q = forecast?.implied?.d7;
  const m7 = forecast?.medianMove?.d7;
  const spread = forecast?.spread?.d7 ?? 0.02;
  const risk = [
    { n: "Funding", v: forecast?.micro?.funding !== undefined ? `${(forecast.micro.funding * 100).toFixed(4)}%` : "—" },
    { n: "Дисбаланс", v: depth ? `${depth.imbalance >= 0 ? "+" : ""}${(depth.imbalance * 100).toFixed(1)}%` : "—" },
    { n: "F&G", v: fng ? String(fng.value) : "—" },
  ];
  const top3 = (forecast?.analogs ?? []).slice(0, 3);

  return (
    <>
      <ArcCard id="sat-fan" className="mr-1" label={t("sat.fan")} sub="10/50/90" accent="#2DD4FF"
        value={m7 !== undefined ? fmtPct(m7, 1) : "—"} valueTone={(m7 ?? 0) >= 0 ? COLORS.bull : COLORS.bear}>
        <MiniFan p10={q?.p10 ?? -spread} p50={q?.p50 ?? m7 ?? 0} p90={q?.p90 ?? spread} />
      </ArcCard>

      <ArcCard id="sat-risk" className="mr-2" label={t("sat.risk")} sub="live" accent={COLORS.amber}>
        <div className="sat-rows mono">
          {risk.map((r) => (
            <div className="sat-row" key={r.n}><span className="dim">{r.n}</span><b>{r.v}</b></div>
          ))}
        </div>
      </ArcCard>

      <ArcCard id="sat-top3" className="mr-3" label={t("sat.top3")} sub={symbol} accent={COLORS.bull}>
        <div className="sat-rows mono">
          {top3.length === 0 && <div className="sat-row dim">поиск аналогов…</div>}
          {top3.map((a, i) => (
            <div className="sat-row" key={i}>
              <span className="dim">{a.label}</span>
              <b className={(a.r7d ?? 0) >= 0 ? "bull" : "bear"}>
                {Math.round(a.sim * 100)}% · {fmtPct(a.r7d, 1)}
              </b>
            </div>
          ))}
        </div>
      </ArcCard>

      <ArcCard id="sat-hit" className="mr-4" label={t("sat.hit")} sub="2 года · walk-forward"
        accent="#2DD4FF"
        value={backtest?.taken ? `${(backtest.hitRateTaken * 100).toFixed(1)}%` : "—"}>
        <div className="sat-rows mono">
          <div className="sat-row">
            <span className="dim">покрытие</span>
            <b>{backtest ? `${(backtest.coverage * 100).toFixed(0)}% (${backtest.taken})` : "—"}</b>
          </div>
          <div className="sat-row">
            <span className="dim">vs «всегда вверх»</span>
            <b>{backtest ? fmtPct((backtest.hitRateAll - backtest.baselineUp), 1) : "—"}</b>
          </div>
        </div>
      </ArcCard>

      <ArcCard id="sat-feed" className="mr-5" label={t("sat.feed")} accent={COLORS.cyan}>
        <LiveFeed max={4} />
      </ArcCard>

      <Style>{`
        .sat-rows { display: flex; flex-direction: column; gap: calc(var(--u) * 2); font-size: calc(var(--fs-xs) * 0.9); }
        .sat-row { display: flex; justify-content: space-between; gap: calc(var(--u) * 6); line-height: 1.35; }
        .sat-row b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
        /* мини-Fan: клин 10/50/90 на всю ширину карточки */
        .mf { display: block; width: 100%; height: calc(var(--u) * 26); }
      `}</Style>
    </>
  );
}

/** Мини-веер прогноза (§B2 правая дуга): клин от 0 до p10/p50/p90. */
function MiniFan({ p10, p50, p90 }: { p10: number; p50: number; p90: number }) {
  const W = 240, H = 26, MID = H / 2;
  const lim = Math.max(Math.abs(p10), Math.abs(p90), 0.005);
  const y = (v: number) => MID - (v / lim) * (MID - 3);
  const pts = `0,${MID} ${W},${y(p90)} ${W},${y(p10)}`;
  return (
    <svg className="mf" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={pts} fill="rgba(45,212,255,0.14)" />
      <line x1="0" y1={MID} x2={W} y2={MID} stroke="rgba(45,212,255,0.45)" strokeWidth="1" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1={MID} x2={W} y2={y(p50)} stroke={p50 >= 0 ? COLORS.bull : COLORS.bear} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={W} cy={y(p50)} r="2.4" fill={p50 >= 0 ? COLORS.bull : COLORS.bear} />
    </svg>
  );
}

/** HERO (ТЗ v3 §A): TopBar(липкий) + заголовок + пилюли + лента цены + орбита + ↓. */
function HeroOrbit() {
  return (
    <section className="hero" id="sec-hero">
      <TitleBlock />
      <CoinPills />
      <HeroStrip />
      <div className="dash-grid orbit-grid">
        <OrbitLayer />
        <MetricCards />
        <Panel title="Neural Sphere · исторические аналоги" icon="◉" delay={500} className="g-sphere">
          <NeuralSphere />
        </Panel>
        <HeroRightCards />
        <DashboardAgents />
        <Style>{heroCss}</Style>
      </div>
      <a className="more mono" href="#sec-market" aria-label="К разделу «Рынок»">
        <span className="arr">↓</span>
        <span className="lbl">{useHeroMoreLabel()}</span>
      </a>
    </section>
  );
}

// маленький хак: label нужен внутри Style-независимого компонента, тянем через стор
function useHeroMoreLabel() {
  const { t } = useStore();
  return t("hero.more");
}

const heroCss = `
.orbit-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: repeat(6, minmax(0, 1fr));
  gap: calc(var(--u) * 8);
  flex: 1;
  min-height: 0;
  transition: grid-template-columns 0.3s ease, grid-template-rows 0.3s ease;
}
.orbit-grid > .panel, .orbit-grid > .mc-sat { min-width: 0; min-height: 0; }
/* шар в центре, карточки-спутники по дугам слева (6 метрик) и справа (5 карточек) */
.orbit-grid > .g-sphere { grid-column: 3 / span 8; grid-row: 1 / -1; }
/* правая дуга (§B2) */
.orbit-grid > .mr-1 { grid-column: 11 / span 2; grid-row: 1; }
.orbit-grid > .mr-2 { grid-column: 11 / span 2; grid-row: 2; }
.orbit-grid > .mr-3 { grid-column: 11 / span 2; grid-row: 3; }
.orbit-grid > .mr-4 { grid-column: 11 / span 2; grid-row: 4; }
.orbit-grid > .mr-5 { grid-column: 11 / span 2; grid-row: 5 / span 2; }

/* дыхание орбиты (≥1100px): карточка отступает внутри ячейки —
   орбитальный шаг упирается в margin+gap и никогда не достаёт соседа */
@media (min-width: 1100px) {
  .dash-grid > .panel, .dash-grid > .mc-sat { margin: calc(var(--u) * 10) calc(var(--u) * 16); }
}

/* M «Планшет» (700–1099 или портрет): шар сверху, под ним сетка 2 колонки */
@media (max-width: 1099px), (orientation: portrait) and (max-width: 1499px) {
  .dash-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-template-rows: none !important;
    grid-auto-rows: minmax(190px, auto) !important;
    min-height: 0 !important;
    gap: calc(var(--u) * 10) !important;
  }
  .dash-grid > .panel, .dash-grid > .mc-sat { grid-column: auto !important; grid-row: auto !important; margin: 0; }
  .dash-grid > .g-sphere {
    grid-column: 1 / -1 !important;
    order: -1;
    min-height: min(88vw, 560px);
    aspect-ratio: 4 / 3;
  }
  .dash-grid .g-candles, .dash-grid .g-timeline { grid-column: 1 / -1 !important; }
  .dash-grid .g-feed, .dash-grid .g-tape, .dash-grid .g-fng { min-height: 180px; }
}

/* S «Телефон» (<700): формат 9:16 — шар первым, дальше карточки столбцом */
@media (max-width: 699px) {
  .dash-grid {
    display: flex !important;
    flex-direction: column !important;
    gap: calc(var(--u) * 8) !important;
    min-height: 0 !important;
  }
  .dash-grid .panel, .dash-grid .mc-sat { grid-column: auto !important; grid-row: auto !important; margin: 0; }
  .dash-grid .panel { min-height: calc(var(--u) * 160); }
  .dash-grid .g-sphere { order: -1; min-height: min(92vw, 520px); aspect-ratio: 1 / 1; }
  .dash-grid .g-feed,
  .dash-grid .g-tape,
  .dash-grid .g-fng { min-height: calc(var(--u) * 150); }
}
`;

/** Секция «Рынок» (§A): Live Candles 8 колонок + Order Book 4. */
function MarketSection() {
  return (
    <section className="sec" id="sec-market">
      <div className="sec-head">
        <h2 className="sec-title mono">РЫНОК · LIVE</h2>
      </div>
      <div className="dash-grid sec-market">
        <Panel title="Live Candles" icon="▮" delay={80} className="g-candles" flush>
          <LiveCandles />
        </Panel>
        <Panel title="Order Book Depth" icon="⇅" delay={160} className="g-book">
          <OrderBook />
        </Panel>
        <Style>{`
          .sec-market {
            display: grid;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            grid-template-rows: clamp(320px, 30vw, 470px);
            gap: calc(var(--u) * 8);
            flex: 1; min-height: 0;
          }
          .sec-market > .g-candles { grid-column: 1 / span 8; }
          .sec-market > .g-book { grid-column: 9 / span 4; }
        `}</Style>
      </div>
    </section>
  );
}

/** Секция «Прогноз» (§A): Fan большой + Feed + Tape + Timeline + F&G. */
function ForecastSection() {
  return (
    <section className="sec" id="sec-forecast">
      <div className="sec-head">
        <h2 className="sec-title mono">ПРОГНОЗ · ВЕЕР · СОБЫТИЯ</h2>
      </div>
      <div className="dash-grid sec-forecast">
        <Panel title="Forecast Fan" icon="✳" delay={80} className="g-fan">
          <ForecastFan />
        </Panel>
        <Panel title="Live Feed" icon="≡" delay={160} className="g-feed">
          <LiveFeed />
        </Panel>
        <Panel title="Execution Tape" icon="↧" delay={240} className="g-tape" flush>
          <div style={{ padding: "calc(var(--u) * 8)", height: "100%" }}>
            <ExecutionTape />
          </div>
        </Panel>
        <Panel title="Analog Timeline" icon="▤" delay={320} className="g-timeline">
          <AnalogTimeline />
        </Panel>
        <Panel title="Fear & Greed + Mood" icon="◔" delay={400} className="g-fng">
          <FngGauge />
        </Panel>
        <Style>{`
          .sec-forecast {
            display: grid;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            grid-template-rows: clamp(340px, 27vw, 430px) clamp(300px, 25vw, 400px);
            gap: calc(var(--u) * 8);
            flex: 1; min-height: 0;
          }
          .sec-forecast > .g-fan { grid-column: 1 / span 8; grid-row: 1; }
          .sec-forecast > .g-feed { grid-column: 9 / span 4; grid-row: 1; }
          .sec-forecast > .g-tape { grid-column: 1 / span 4; grid-row: 2; }
          .sec-forecast > .g-timeline { grid-column: 5 / span 4; grid-row: 2; }
          .sec-forecast > .g-fng { grid-column: 9 / span 4; grid-row: 2; }
        `}</Style>
      </div>
    </section>
  );
}

function Content() {
  const { sub, swapKey } = useStore();
  return (
    <div className="content" key={`${sub}-${swapKey}`}>
      {sub === "dash" && (
        <>
          <HeroOrbit />
          <MarketSection />
          <ForecastSection />
        </>
      )}
      {sub === "markets" && <MarketsView />}
      {sub === "forecast" && <ForecastView />}
      {sub === "history" && <HistoryView />}
      {sub === "analogs" && <AnalogsView />}
      {sub === "backtest" && <BacktestView />}
      {sub === "ai" && <AiView />}
      {sub === "about" && <AboutView />}
      <Style>{`
        .content {
          flex: 1; min-height: 0; display: flex; flex-direction: column;
          padding: calc(var(--u) * 8) calc(var(--u) * 12) calc(var(--u) * 6);
          gap: calc(var(--u) * 18);
        }
        @media (max-width: 1099px), (orientation: portrait) and (max-width: 1499px) {
          .content { padding: calc(var(--u) * 8); gap: calc(var(--u) * 14); }
        }
        /* HERO: первый экран по высоте ТЗ §A, дальше страница ПРОКРУЧИВАЕТСЯ */
        .hero {
          min-height: clamp(820px, 56vw, 1240px);
          display: flex; flex-direction: column; gap: calc(var(--u) * 8);
          scroll-margin-top: calc(var(--u) * 64);
        }
        /* заголовок секции капсом с линией (§B7) */
        .sec { display: flex; flex-direction: column; gap: calc(var(--u) * 8); scroll-margin-top: calc(var(--u) * 64); }
        .sec-head { display: flex; align-items: center; gap: calc(var(--u) * 10); }
        .sec-title {
          margin: 0; font-size: var(--fs-s); letter-spacing: 0.28em; color: var(--dim);
          text-transform: uppercase; white-space: nowrap;
        }
        .sec-head::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(27,58,92,0.7), transparent); }
        /* стрелка ↓ под HERO с мягкой пульсацией (§A) */
        .more {
          align-self: center; display: inline-flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 3);
          color: var(--dim); text-decoration: none; font-size: var(--fs-xs); letter-spacing: 0.3em;
          text-transform: uppercase; padding: calc(var(--u) * 6) calc(var(--u) * 12); cursor: pointer;
          transition: color 0.2s ease;
        }
        .more .arr { font-size: calc(var(--fs-l) * 1.2); color: var(--cyan); animation: morePulse 1.8s ease-in-out infinite; }
        .more:hover { color: var(--cyan); }
        @keyframes morePulse {
          0%, 100% { transform: translateY(0); opacity: 0.7; text-shadow: 0 0 6px rgba(45,212,255,0.3); }
          50% { transform: translateY(6px); opacity: 1; text-shadow: 0 0 16px rgba(45,212,255,0.8); }
        }
        @media (prefers-reduced-motion: reduce) { .more .arr { animation: none; opacity: 1; } }
        @media (max-width: 699px) {
          .hero { min-height: 0; }
          .more .lbl { display: none; }
        }
      `}</Style>
    </div>
  );
}

function FooterLine() {
  const { health, connected, symbol } = useStore();
  return (
    <footer className="foot">
      <span className="mono dim">
        {symbol} · src {health.active.toUpperCase()} · ws {connected ? "●" : "○"} · binance {health.latency?.binance ?? 0}ms / bybit {health.latency?.bybit ?? 0}ms
      </span>
      <Disclaimer compact />
      <EfoToggle />
      <Style>{`
        .foot {
          display: flex; align-items: center; gap: calc(var(--u) * 14);
          padding: calc(var(--u) * 6) calc(var(--u) * 12);
          border-top: 1px solid rgba(27,58,92,0.6);
          font-size: var(--fs-xs); flex: 0 0 auto;
        }
        .foot .disclaimer { flex: 1; }
        @media (max-width: 1099px), (orientation: portrait) and (max-width: 1499px) { .foot { flex-wrap: wrap; justify-content: center; } }
      `}</Style>
    </footer>
  );
}

function Shell() {
  const { swapKey } = useStore();

  // режимы адаптива XL/L/M/S — класс на <html> (lib/layout.config.ts)
  useEffect(() => {
    applyLayoutMode();
    const on = () => applyLayoutMode();
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);

  return (
    <div className="shell-root">
      <IntroOverlay />
      <div className="stage" key={swapKey}>
        <Backdrop />
        <div className="stage-inner">
          <TopBar />
          <Content />
          <FooterLine />
          <Ticker />
        </div>
      </div>
      <Style>{`
        .shell-root { min-height: 100dvh; background: var(--bg); }
        .stage-inner {
          position: relative; z-index: 10;
          min-height: 100dvh; display: flex; flex-direction: column;
          min-width: 0;
        }
      `}</Style>
    </div>
  );
}

export function AppShell() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
