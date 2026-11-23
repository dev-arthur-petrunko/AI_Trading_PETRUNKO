"use client";

import { StoreProvider, useStore } from "@/lib/store";
import { applyLayoutMode } from "@/lib/layout.config";
import { useEffect } from "react";
import { TopBar, TitleBlock, CoinPills, Ticker, Disclaimer, EfoToggle } from "@/components/Chrome";
import { IntroOverlay, LiveFeed } from "@/components/FeedPanels";
import { Panel } from "@/components/Panel";
import { Style } from "@/components/Style";
import { PriceSpot } from "@/components/panels/PriceSpot";
import { LiveCandles } from "@/components/panels/LiveCandles";
import { OrderBook } from "@/components/panels/OrderBook";
import { FngGauge } from "@/components/panels/FngGauge";
import { MetricCards } from "@/components/panels/MetricCards";
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

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="grid" />
      <div className="scanlines" />
      <div className="vignette" />
    </div>
  );
}

function Dashboard() {
  return (
    <div className="dash-grid">
      <OrbitLayer />
      <Panel title="Price / Spot" icon="¢" delay={100} className="g-price">
        <PriceSpot />
      </Panel>
      <Panel title="Live Candles" icon="▮" delay={180} className="g-candles" flush>
        <LiveCandles />
      </Panel>
      <Panel title="Order Book Depth" icon="⇅" delay={260} className="g-book">
        <OrderBook />
      </Panel>
      <Panel title="Fear & Greed + Mood" icon="◔" delay={340} className="g-fng">
        <FngGauge />
      </Panel>

      <Panel title="AI Metrics" icon="⌬" delay={420} className="g-metrics" flush>
        <div style={{ padding: "calc(var(--u) * 8)", height: "100%" }}>
          <MetricCards />
        </div>
      </Panel>
      <Panel title="Neural Sphere · исторические аналоги" icon="◉" delay={500} className="g-sphere">
        <NeuralSphere />
      </Panel>
      <Panel title="Live Feed" icon="≡" delay={580} className="g-feed">
        <LiveFeed />
      </Panel>
      <Panel title="Forecast Fan" icon="✳" delay={660} className="g-fan">
        <ForecastFan />
      </Panel>
      <Panel title="Analog Timeline" icon="▤" delay={740} className="g-timeline">
        <AnalogTimeline />
      </Panel>
      <Panel title="Execution Tape" icon="↧" delay={820} className="g-tape" flush>
        <div style={{ padding: "calc(var(--u) * 8)", height: "100%" }}>
          <ExecutionTape />
        </div>
      </Panel>

      {/* roaming agents overlay: patrol ALL panels → scan → transmit to the core */}
      <DashboardAgents />

      <Style>{`
        /* Текучая сетка (Exercise §A): колонки minmax(0,1fr) — содержимое не распирает ячейки;
           ряды в % + минимумы — при нехватке высоты страница ПРОКРУЧИВАЕТСЯ (min-height даша 720px),
           а не сжимается в нечитаемую мелочь. */
        .dash-grid {
          position: relative;
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          grid-template-rows: minmax(150px, 19%) minmax(0, 1fr) minmax(180px, 21%);
          gap: calc(var(--u) * 8);
          flex: 1;
          min-height: 720px; /* минимальная рабочая высота (Exercise §A) */
        }
        .dash-grid > .panel { min-width: 0; min-height: 0; }
        .g-price   { grid-column: 1 / span 2;  grid-row: 1; }
        .g-candles { grid-column: 3 / span 5;  grid-row: 1; }
        .g-book    { grid-column: 8 / span 3;  grid-row: 1; }
        .g-fng     { grid-column: 11 / span 2; grid-row: 1; }
        .g-metrics { grid-column: 1 / span 2;  grid-row: 2 / 4; }
        .g-sphere  { grid-column: 3 / span 6;  grid-row: 2 / 4; }
        .g-feed    { grid-column: 9 / span 2;  grid-row: 2; }
        .g-fan     { grid-column: 11 / span 2; grid-row: 2; }
        .g-timeline{ grid-column: 9 / span 3;  grid-row: 3; }
        .g-tape    { grid-column: 12 / span 1; grid-row: 3; }

        /* XL «Орбита» (≥1500 и шире 1.45): боковые колонки растут в узкий центр,
           свободная ширина уходит им, а не в пустые поля (Exercise §B). */
        @media (min-width: 1500px) and (min-aspect-ratio: 29 / 20) {
          .g-price   { grid-column: 1 / span 3; }
          .g-metrics { grid-column: 1 / span 3; }
          .g-sphere  { grid-column: 4 / span 6; }
          .g-candles { grid-column: 7 / span 3; }
          .g-book    { grid-column: 10 / span 3; }
          .g-fng     { grid-column: 10 / span 3; }
          .g-feed    { grid-column: 10 / span 3; }
          .g-fan     { grid-column: 10 / span 3; }
          .g-timeline{ grid-column: 10 / span 3; }
          .g-tape    { grid-column: 10 / span 3; }
        }

        /* M «Планшет» (700–1099 или портрет): шар сверху квадратом, под ним сетка 2 колонки */
        @media (max-width: 1099px), (orientation: portrait) and (max-width: 1499px) {
          .dash-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-template-rows: none;
            grid-auto-rows: minmax(190px, auto);
            min-height: 0;
            gap: calc(var(--u) * 10);
          }
          .dash-grid > .panel { grid-column: auto !important; grid-row: auto !important; }
          .g-sphere {
            grid-column: 1 / -1 !important;
            order: -1;
            min-height: min(88vw, 560px);
            aspect-ratio: 4 / 3;
          }
          .g-candles, .g-timeline { grid-column: 1 / -1 !important; }
          .g-feed, .g-tape, .g-fng { min-height: 180px; }
        }

        /* S «Телефон» (<700): формат 9:16 — шар первым, дальше карточки столбцом */
        @media (max-width: 699px) {
          .dash-grid {
            display: flex;
            flex-direction: column;
            gap: calc(var(--u) * 8);
            min-height: 0;
          }
          .dash-grid .panel { min-height: calc(var(--u) * 160); }
          .dash-grid .g-sphere { order: -1; min-height: min(92vw, 520px); aspect-ratio: 1 / 1; }
          .dash-grid .g-feed,
          .dash-grid .g-tape,
          .dash-grid .g-fng { min-height: calc(var(--u) * 150); }
        }
      `}</Style>
    </div>
  );
}

function Content() {
  const { sub, swapKey } = useStore();
  return (
    <div className="content" key={`${sub}-${swapKey}`}>
      {sub === "dash" && <Dashboard />}
      {sub === "markets" && <MarketsView />}
      {sub === "forecast" && <ForecastView />}
      {sub === "history" && <HistoryView />}
      {sub === "analogs" && <AnalogsView />}
      {sub === "backtest" && <BacktestView />}
      {sub === "ai" && <AiView />}
      {sub === "about" && <AboutView />}
      <Style>{`
        .content { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: calc(var(--u) * 8) calc(var(--u) * 12) calc(var(--u) * 6); }
        @media (max-width: 1099px), (orientation: portrait) and (max-width: 1499px) { .content { padding: calc(var(--u) * 8); } }
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
          padding: calc(var(--u) * 4) calc(var(--u) * 12);
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
          <TitleBlock />
          <CoinPills />
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
