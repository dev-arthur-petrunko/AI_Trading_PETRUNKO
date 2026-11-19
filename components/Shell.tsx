"use client";

import { StoreProvider, useStore } from "@/lib/store";
import { Style } from "./Style";
import { TopBar, TitleBlock, CoinPills, Ticker, Disclaimer, EfoToggle } from "@/components/Chrome";
import { IntroOverlay, LiveFeed } from "@/components/FeedPanels";
import { Panel } from "@/components/Panel";
import { PriceSpot } from "@/components/panels/PriceSpot";
import { LiveCandles } from "@/components/panels/LiveCandles";
import { OrderBook } from "@/components/panels/OrderBook";
import { FngGauge } from "@/components/panels/FngGauge";
import { MetricCards } from "@/components/panels/MetricCards";
import { NeuralSphere } from "@/components/panels/NeuralSphere";
import { AnalogTimeline } from "@/components/panels/AnalogTimeline";
import { ForecastFan } from "@/components/panels/ForecastFan";
import { ExecutionTape } from "@/components/panels/ExecutionTape";
import { MarketsView } from "@/components/views/MarketsView";
import { ForecastView } from "@/components/views/ForecastView";
import { HistoryView } from "@/components/views/HistoryView";
import { AnalogsView } from "@/components/views/AnalogsView";
import { BacktestView } from "@/components/views/BacktestView";
import { AboutView } from "@/components/views/AboutView";

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

      <Panel title="Analog Timeline" icon="▤" delay={660} className="g-timeline">
        <AnalogTimeline />
      </Panel>
      <Panel title="Forecast Fan" icon="✳" delay={740} className="g-fan">
        <ForecastFan />
      </Panel>
      <Panel title="Execution Tape" icon="↧" delay={820} className="g-tape" flush>
        <div style={{ padding: "calc(var(--u) * 8)", height: "100%" }}>
          <ExecutionTape />
        </div>
      </Panel>

      <Style>{`
        .dash-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          grid-template-rows: calc(var(--u) * 216) 1fr calc(var(--u) * 224);
          gap: calc(var(--u) * 8);
          flex: 1; min-height: 0;
        }
        .g-price   { grid-column: span 2; }
        .g-candles { grid-column: span 4; }
        .g-book    { grid-column: span 3; }
        .g-fng     { grid-column: span 3; }
        .g-metrics { grid-column: span 2; }
        .g-sphere  { grid-column: span 7; }
        .g-feed    { grid-column: span 3; }
        .g-timeline{ grid-column: span 4; }
        .g-fan     { grid-column: span 4; }
        .g-tape    { grid-column: span 4; }
        @media (max-width: 1024px) {
          .dash-grid { display: flex; flex-direction: column; }
          .dash-grid .panel { min-height: calc(var(--u) * 240); }
          .dash-grid .g-sphere { min-height: calc(var(--u) * 420); order: -1; }
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
      {sub === "about" && <AboutView />}
      <Style>{`
        .content { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: calc(var(--u) * 8) calc(var(--u) * 12) calc(var(--u) * 6); }
        @media (max-width: 1024px) { .content { padding: calc(var(--u) * 8); } }
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
        @media (max-width: 1024px) { .foot { flex-wrap: wrap; justify-content: center; } }
      `}</Style>
    </footer>
  );
}

function Shell() {
  const { swapKey } = useStore();
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
        .shell-root { min-height: 100vh; background: var(--bg); }
        .stage-inner {
          position: relative; z-index: 10;
          height: 100%; display: flex; flex-direction: column;
          min-height: 0;
        }
        @media (max-width: 1024px) {
          .stage { display: block; }
          .stage-inner { height: auto; min-height: 100vh; }
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
