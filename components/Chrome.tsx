"use client";

import { useEffect, useRef, useState } from "react";
import { Style } from "./Style";
import { useStore, SYMBOLS } from "@/lib/store";
import { LANGS, type TKey } from "@/lib/i18n";
import { utcClock, fmtPrice, fmtCompact, fmtPct, COLORS } from "@/lib/format";
import type { Sub } from "@/lib/store";

const NAV: { id: Sub; key: TKey }[] = [
  { id: "dash", key: "nav.dash" },
  { id: "markets", key: "nav.markets" },
  { id: "forecast", key: "nav.forecast" },
  { id: "history", key: "nav.history" },
  { id: "analogs", key: "nav.analogs" },
  { id: "backtest", key: "nav.backtest" },
  { id: "ai", key: "nav.ai" },
  { id: "about", key: "nav.about" },
];

export function TopBar() {
  const { sub, setSub, source, setSource, health, connected, latencyMs, rank, t, lang, setLang } = useStore();
  const [clock, setClock] = useState<string | null>(null);

  useEffect(() => {
    setClock(utcClock());
    const t = setInterval(() => setClock(utcClock()), 1000);
    return () => clearInterval(t);
  }, []);

  const pills = rank.length
    ? rank.map((r) => r.id)
    : SYMBOLS;

  return (
    <header className="topbar">
      <div className="brand" onClick={() => setSub("dash")}>
        <span className="logo">⟁</span>
        <span className="brand-name head-font">PETRUNKO<span className="cy">.AI</span></span>
      </div>

      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${sub === n.id ? "on" : ""}`}
            onClick={() => setSub(n.id)}
          >
            {t(n.key)}
          </button>
        ))}
      </nav>

      <div className="right">
        <div className="lang" role="group" aria-label="Language / Язык / Мова">
          {LANGS.map((l) => (
            <button
              key={l.id}
              className={`lang-btn ${lang === l.id ? "on" : ""}`}
              onClick={() => setLang(l.id)}
              aria-pressed={lang === l.id}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="clock mono">{clock ?? "--:--:-- UTC"}</span>
        <span className="live-dot" title={connected ? "WebSocket подключён" : "переподключение…"}>
          <i style={{ background: connected ? undefined : COLORS.dim }} />
          {connected ? t("live") : t("sync")}
        </span>
        <span className="lat mono" title="задержка клиент ↔ сервер">
          {latencyMs}ms
        </span>
        <div className="src" role="group" aria-label="Источник данных">
          {(["binance", "bybit", "auto"] as const).map((s) => (
            <button
              key={s}
              className={`src-btn ${source === s ? "on" : ""}`}
              onClick={() => setSource(s)}
              title={
                s === "auto"
                  ? "Автопереключение"
                  : `${s.toUpperCase()}: ${health.alive[s] ? "● доступен" : "● недоступен"} · ${health.latency[s] ?? 0} мс`
              }
            >
              {s === "auto" ? t("src.auto") : s.toUpperCase()}
              <em
                className="src-dot"
                style={{
                  background: s === "auto" ? COLORS.cyan : health.alive[s] ? COLORS.bull : COLORS.bear,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      <Style>{`
        .topbar {
          height: calc(var(--u) * 56);
          min-height: 44px;
          display: flex; align-items: center; gap: calc(var(--u) * 14);
          padding: 0 calc(var(--u) * 16);
          border-bottom: 1px solid var(--stroke);
          background: linear-gradient(180deg, rgba(10,20,35,0.9), rgba(5,10,18,0.7));
          backdrop-filter: blur(6px);
          position: relative; z-index: 30;
        }
        .brand { display: flex; align-items: center; gap: calc(var(--u) * 8); cursor: pointer; }
        .brand .logo { color: var(--cyan); font-size: calc(var(--u) * 22); text-shadow: 0 0 12px var(--cyan); }
        .brand-name { font-size: var(--fs-m); letter-spacing: 0.22em; font-weight: 700; }
        .nav { display: flex; gap: calc(var(--u) * 2); flex: 1; min-width: 0; overflow: hidden; }
        .nav-item {
          background: transparent; border: 1px solid transparent; color: var(--dim);
          font-family: "Rajdhani", sans-serif; font-weight: 600;
          font-size: var(--fs-s); letter-spacing: 0.12em; text-transform: uppercase;
          padding: calc(var(--u) * 6) calc(var(--u) * 10); cursor: pointer;
          transition: all 0.16s ease; white-space: nowrap;
        }
        .nav-item:hover { color: var(--ink); border-color: rgba(45,212,255,0.35); }
        .nav-item.on {
          color: #03130b; background: var(--cyan); border-color: var(--cyan);
          box-shadow: 0 0 14px rgba(45,212,255,0.45); font-weight: 700;
        }
        .right { display: flex; align-items: center; gap: calc(var(--u) * 12); }
        .clock { font-size: var(--fs-s); color: var(--cyan); letter-spacing: 0.08em; }
        .lat { font-size: var(--fs-xs); color: var(--dim); }
        .src { display: flex; gap: calc(var(--u) * 4); }
        .src-btn {
          display: inline-flex; align-items: center; gap: 5px;
          background: rgba(10,20,35,0.8); border: 1px solid var(--stroke); color: var(--dim);
          font-family: "JetBrains Mono", monospace; font-size: var(--fs-xs);
          padding: calc(var(--u) * 5) calc(var(--u) * 8); cursor: pointer;
          letter-spacing: 0.08em; transition: all 0.16s;
        }
        .src-btn:hover { color: var(--ink); border-color: var(--cyan); }
        .src-btn.on { color: var(--ink); border-color: var(--cyan); background: rgba(45,212,255,0.12); box-shadow: 0 0 10px rgba(45,212,255,0.3) inset; }
        .src-dot { width: calc(var(--u) * 6); height: calc(var(--u) * 6); min-width: 5px; min-height: 5px; border-radius: 50%; display: inline-block; }
        @media (max-width: 1024px) {
          .topbar { flex-wrap: wrap; height: auto; padding: calc(var(--u) * 8); }
          .nav { order: 3; width: 100%; overflow-x: auto; }
          .right { flex-wrap: wrap; }
        }
      `}</Style>
    </header>
  );
}

export function TitleBlock() {
  const { swapKey, t } = useStore();
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const wait = 8000 + Math.random() * 2000; // rare glitch every 8–10s
      setTimeout(() => {
        if (!alive) return;
        setGlitch(true);
        setTimeout(() => alive && setGlitch(false), 300);
        loop();
      }, wait);
    };
    loop();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="title-block" key={swapKey}>
      <h1 className={`glitch title-breath ${glitch ? "on" : ""}`} data-text="AI TRADING PETRUNKO">
        AI TRADING PETRUNKO
      </h1>
      <p className="sub mono">{t("brand.sub")}</p>
      <Style>{`
        .title-block { text-align: center; padding: calc(var(--u) * 6) 0 calc(var(--u) * 4); position: relative; z-index: 5; }
        h1 {
          margin: 0;
          font-family: "Orbitron", sans-serif;
          font-size: var(--fs-xl);
          font-weight: 800;
          letter-spacing: 0.28em;
          color: var(--ink);
        }
        .sub { margin: calc(var(--u) * 4) 0 0; font-size: var(--fs-xs); letter-spacing: 0.32em; color: var(--dim); text-transform: uppercase; }
        @media (max-width: 1024px) {
          h1 { font-size: calc(var(--u) * 34); letter-spacing: 0.16em; }
          .sub { letter-spacing: 0.14em; }
        }
      `}</Style>
    </div>
  );
}

export function CoinPills() {
  const { symbol, setSymbol, rank, stats, swapKey } = useStore();
  const pills = rank.length ? rank.map((r) => r.id) : SYMBOLS;
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="pills-wrap" key={swapKey}>
      <div className="pills" ref={ref}>
        {pills.map((s, i) => {
          const chg = stats[s]?.chg;
          return (
            <button
              key={s}
              className={`pill ${symbol === s ? "on" : ""}`}
              onClick={() => setSymbol(s)}
              title={`#${i + 1} по капитализации`}
            >
              <span className="sym">{s}</span>
              {chg !== undefined && (
                <span className={`chg mono ${chg >= 0 ? "bull" : "bear"}`}>{fmtPct(chg / 100, 1)}</span>
              )}
            </button>
          );
        })}
      </div>
      <Style>{`
        .pills-wrap { display: flex; justify-content: center; padding: calc(var(--u) * 4) 0; }
        .pills { display: flex; gap: calc(var(--u) * 6); flex-wrap: wrap; justify-content: center; }
        .pill {
          display: inline-flex; align-items: center; gap: calc(var(--u) * 7);
          border: 1px solid var(--stroke); background: rgba(10,20,35,0.7); color: var(--dim);
          font-family: "JetBrains Mono", monospace; font-size: var(--fs-xs);
          padding: calc(var(--u) * 5) calc(var(--u) * 11); cursor: pointer;
          letter-spacing: 0.1em; transition: all 0.18s ease;
        }
        .pill:hover { border-color: var(--cyan); color: var(--ink); transform: translateY(-1px); }
        .pill.on {
          color: #03130b; background: var(--bull); border-color: var(--bull);
          box-shadow: 0 0 16px rgba(25,245,138,0.5); font-weight: 700;
        }
        .pill .chg { font-size: calc(var(--fs-xs) * 0.92); }
        .pill.on .chg { color: #03130b !important; }
      `}</Style>
    </div>
  );
}

export function Ticker() {
  const { stats, setSymbol, symbol, rank } = useStore();
  const pills = rank.length ? rank.map((r) => r.id) : SYMBOLS;
  const row = pills.map((id) => ({ id, ...stats[id] }));

  const strip = (
    <>
      {row.map((r, i) => (
        <span
          key={`${r.id}-${i}`}
          className={`tick-item ${r.id === symbol ? "active" : ""}`}
          onClick={() => setSymbol(r.id)}
        >
          <b>{r.id}</b>{" "}
          <span className="mono">{fmtPrice(r.price, r.id)}</span>{" "}
          <span className={`mono ${r.chg !== undefined && r.chg >= 0 ? "bull" : "bear"}`}>
            {r.chg !== undefined ? `${r.chg >= 0 ? "▲" : "▼"}${Math.abs(r.chg).toFixed(2)}%` : "—"}
          </span>
          <span className="dim mono"> · VOL ${fmtCompact(r.vol)} · </span>
        </span>
      ))}
    </>
  );

  return (
    <div className="ticker">
      <div className="ticker-inner">
        {strip}
        {strip}
        {strip}
      </div>
      <Style>{`
        .ticker { height: calc(var(--u) * 28); min-height: 24px; font-size: var(--fs-s); position: relative; z-index: 20; }
        .ticker-inner { display: inline-block; white-space: nowrap; line-height: calc(var(--u) * 28); }
        .tick-item { cursor: pointer; padding: 0 calc(var(--u) * 4); }
        .tick-item b { color: var(--cyan); font-family: "JetBrains Mono", monospace; letter-spacing: 0.06em; }
        .tick-item.active b { color: var(--bull); }
        .tick-item:hover { background: rgba(45,212,255,0.08); }
        .dim { color: var(--dim); opacity: 0.7; }
      `}</Style>
    </div>
  );
}

export function EfoToggle() {
  const { eco, setEco, reduced } = useStore();
  return (
    <button
      className={`eco ${eco || reduced ? "on" : ""}`}
      onClick={() => setEco(!eco)}
      title="Упрощённая анимация (также включается автоматически при prefers-reduced-motion)"
    >
      {eco || reduced ? "◼ ЭКО-РЕЖИМ" : "◻ ЭКО-РЕЖИМ"}
      <Style>{`
        .eco {
          background: rgba(10,20,35,0.8); border: 1px solid var(--stroke); color: var(--dim);
          font-family: "JetBrains Mono", monospace; font-size: var(--fs-xs);
          padding: calc(var(--u) * 5) calc(var(--u) * 8); cursor: pointer; letter-spacing: 0.08em;
        }
        .eco.on { color: var(--amber); border-color: var(--amber); box-shadow: 0 0 10px rgba(255,176,32,0.35); }
      `}</Style>
    </button>
  );
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  const { t } = useStore();
  return (
    <p className={`disclaimer ${compact ? "compact" : ""}`}>
      {t("disclaimer")}
      <Style>{`
        .disclaimer { color: var(--dim); font-size: var(--fs-xs); letter-spacing: 0.06em; text-align: center; margin: calc(var(--u) * 6) 0 0; }
        .disclaimer.compact { margin: 0; }
      `}</Style>
    </p>
  );
}
