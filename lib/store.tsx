"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { API, WS_URL, apiGet } from "./api";
import type {
  Stats,
  StatsRow,
  FeedEvent,
  DepthMsg,
  FngData,
  RankRow,
  ForecastBrief,
  BacktestBrief,
  Health,
} from "./types";
import type { Candle } from "./types";

export type Sub = "dash" | "markets" | "forecast" | "history" | "analogs" | "backtest" | "ai" | "about";

export type Store = {
  symbol: string;
  setSymbol: (s: string) => void;
  tf: string;
  setTf: (t: string) => void;
  sub: Sub;
  setSub: (s: Sub) => void;

  source: string;
  setSource: (s: "auto" | "binance" | "bybit") => void;
  health: Health;

  connected: boolean;
  latencyMs: number; // client-observed round-trip
  stats: Stats;
  stat: StatsRow | undefined;

  candles: Candle[]; // current tf series
  m1: Candle | null; // latest 1m bar for live patches
  depth: DepthMsg | null;
  events: FeedEvent[];
  forecast: ForecastBrief | null;
  backtest: BacktestBrief | null;
  fng: FngData | null;
  rank: RankRow[];
  swapKey: number; // increments on symbol change → triggers glitch

  eco: boolean;
  setEco: (v: boolean) => void;
  reduced: boolean;
  intro: boolean;
  setIntro: (v: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

export const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"];

const MAX_EVENTS = 60;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [symbol, setSymbolRaw] = useState("BTC");
  const [tf, setTf] = useState("1h");
  const [sub, setSub] = useState<Sub>("dash");

  const [source, setSourceRaw] = useState("auto");
  const [health, setHealth] = useState<Health>({
    source: "auto",
    active: "binance",
    alive: { binance: true, bybit: true },
    ws: { binance: false, bybit: false },
    latency: { binance: 0, bybit: 0 },
  });

  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);
  const [stats, setStats] = useState<Stats>({});
  const [candles, setCandles] = useState<Candle[]>([]);
  const [m1, setM1] = useState<Candle | null>(null);
  const [depth, setDepth] = useState<DepthMsg | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [forecast, setForecast] = useState<ForecastBrief | null>(null);
  const [backtest, setBacktest] = useState<BacktestBrief | null>(null);
  const [fng, setFng] = useState<FngData | null>(null);
  const [rank, setRank] = useState<RankRow[]>([]);
  const [swapKey, setSwapKey] = useState(0);

  const [eco, setEco] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [intro, setIntro] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const rttRef = useRef<number[]>([]);
  const [rtt, setRtt] = useState(0);
  const symRef = useRef(symbol);
  const tfRef = useRef(tf);
  const retryRef = useRef(0);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentAt = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches || ecoRef.current);
    const ecoRef2 = { current: eco };
    void ecoRef2;
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [eco]);

  // ---- websocket ---------------------------------------------------------
  const pushEvent = useCallback((ev: FeedEvent) => {
    setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
  }, []);

  const handleMessage = useCallback(
    (data: any) => {
      switch (data.type) {
        case "hello":
          setConnected(true);
          setHealth((h) => ({ ...h, source: data.source, active: data.active, latency: data.latency }));
          if (data.stats) setStats(data.stats);
          break;
        case "tick":
          if (data.stats) setStats(data.stats);
          if (data.latency) setHealth((h) => ({ ...h, latency: data.latency }));
          break;
        case "health":
          setHealth((h) => ({
            ...h,
            alive: data.alive ?? h.alive,
            ws: data.ws ?? h.ws,
            latency: data.latency ?? h.latency,
            active: data.active ?? h.active,
          }));
          break;
        case "source":
          setHealth((h) => ({ ...h, source: data.source }));
          break;
        case "klines":
          if (data.symbol === symRef.current && data.tf === tfRef.current) setCandles(data.candles || []);
          break;
        case "m1":
          if (data.symbol === symRef.current) {
            if (tfRef.current === "1m") {
              setCandles((prev) => {
                if (!prev.length) return prev;
                const last = prev[prev.length - 1];
                if (last.t === data.candle.t) {
                  const next = prev.slice();
                  next[next.length - 1] = data.candle;
                  return next;
                }
                return [...prev.slice(-599), data.candle];
              });
            } else if (tfRef.current === "5m" || tfRef.current === "1h" || tfRef.current === "1d") {
              // patch the forming bar of the higher tf
              setCandles((prev) => {
                if (!prev.length) return prev;
                const span =
                  tfRef.current === "5m" ? 5 * 60_000 : tfRef.current === "1h" ? 3_600_000 : 86_400_000;
                const bucket = Math.floor(data.candle.t / span) * span;
                const last = prev[prev.length - 1];
                if (last.t === bucket) {
                  const next = prev.slice();
                  next[next.length - 1] = {
                    ...last,
                    c: data.candle.c,
                    h: Math.max(last.h, data.candle.h),
                    l: Math.min(last.l, data.candle.l),
                    v: last.v + (data.candle.v || 0),
                  };
                  return next;
                }
                if (bucket > last.t) {
                  return [...prev.slice(-599), { ...data.candle, t: bucket }];
                }
                return prev;
              });
            }
          }
          break;
        case "depth":
          if (data.symbol === symRef.current) setDepth(data);
          break;
        case "depth-lite":
          if (data.symbol === symRef.current)
            setDepth((prev) => (prev ? { ...prev, imbalance: data.imbalance, ts: data.ts } : prev));
          break;
        case "event":
          if (data.ev) pushEvent(data.ev);
          break;
        case "event-batch":
          if (Array.isArray(data.events) && data.events.length) setEvents(data.events);
          break;
        case "forecast":
          if (data.symbol === symRef.current) setForecast(data.forecast);
          break;
        case "backtest":
          if (data.symbol === symRef.current) setBacktest(data.backtest);
          break;
        case "fng":
          if (data.fng) setFng(data.fng);
          break;
        case "rank":
          if (data.rank) setRank(data.rank);
          break;
        case "pong": {
          const ms = Date.now() - sentAt.current;
          if (ms >= 0 && ms < 5000) {
            rttRef.current = [...rttRef.current.slice(-9), ms];
            const avg = rttRef.current.reduce((a, b) => a + b, 0) / rttRef.current.length;
            setRtt(Math.round(avg));
          }
          break;
        }
      }
    },
    [pushEvent],
  );

  const subscribe = useCallback((sym: string, timeframe: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "sub", symbol: sym, tf: timeframe }));
    }
  }, []);

  useEffect(() => {
    let closed = false;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: "sub", symbol: symRef.current, tf: tfRef.current }));
        if (pingTimer.current) clearInterval(pingTimer.current);
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            sentAt.current = Date.now();
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 2000);
      };

      ws.onmessage = (e) => {
        try {
          handleMessage(JSON.parse(e.data));
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingTimer.current) clearInterval(pingTimer.current);
        if (closed) return;
        retryRef.current += 1;
        const delay = Math.min(8000, 500 * 2 ** Math.min(retryRef.current, 4)) + Math.random() * 400;
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    };

    connect();
    return () => {
      closed = true;
      if (pingTimer.current) clearInterval(pingTimer.current);
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, [handleMessage]);

  // REST fallback for forecast/backtest on symbol change (WS also pushes, this is belt & braces)
  const refRest = useCallback(async (sym: string) => {
    try {
      const [f, b] = await Promise.all([
        apiGet<any>("/api/forecast", { symbol: sym }),
        apiGet<any>("/api/backtest", { symbol: sym }),
      ]);
      if (sym === symRef.current) {
        setForecast(f.forecast ?? null);
        setBacktest(b ?? null);
      }
    } catch {}
  }, []);

  // refetch series when symbol/tf changes
  useEffect(() => {
    let dead = false;
    setCandles([]);
    setM1(null);
    subscribe(symbol, tf);
    apiGet<{ candles: Candle[] }>("/api/candles", { symbol, tf, limit: 600 })
      .then((r) => !dead && setCandles(r.candles || []))
      .catch(() => {});
    refRest(symbol);
    return () => {
      dead = true;
    };
  }, [symbol, tf, subscribe, refRest]);

  // order book refresh fallback (keeps the book alive when another tab steals server "focus")
  useEffect(() => {
    const pull = () => {
      apiGet<any>("/api/depth", { symbol })
        .then((d) => setDepth((prev) => ({ ...d, symbol, imbalance: d.imbalance } as any)))
        .catch(() => {});
    };
    pull();
    const t = setInterval(pull, 4500);
    return () => clearInterval(t);
  }, [symbol]);

  // slow REST poll keeps stats fresh even if WS hiccups
  useEffect(() => {
    const t = setInterval(() => {
      apiGet<any>("/api/status")
        .then((s) => {
          if (s.stats) setStats(s.stats);
          setHealth((h) => ({ ...h, source: s.source, active: s.active, alive: s.alive, ws: s.ws, latency: s.latency }));
          if (s.fng) setFng(s.fng);
          if (s.rank) setRank(s.rank);
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const setSymbol = useCallback((s: string) => {
    if (s === symRef.current) return;
    symRef.current = s;
    setSymbolRaw(s);
    setSwapKey((k) => k + 1);
  }, []);

  const setSource = useCallback((s: "auto" | "binance" | "bybit") => {
    setSourceRaw(s);
    apiGet("/api/source", { s }).catch(() => {});
  }, []);

  // intro auto-dismiss
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 2200);
    return () => clearTimeout(t);
  }, []);

  const ecoRef = useRef(eco);
  ecoRef.current = eco;
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches || eco);
  }, [eco]);

  const value: Store = useMemo(
    () => ({
      symbol,
      setSymbol,
      tf,
      setTf,
      sub,
      setSub,
      source: health.source,
      setSource,
      health,
      connected,
      latencyMs: rtt,
      stats,
      stat: stats[symbol],
      candles,
      m1,
      depth,
      events,
      forecast,
      backtest,
      fng,
      rank,
      swapKey,
      eco,
      setEco,
      reduced,
      intro,
      setIntro,
    }),
    [
      symbol, setSymbol, tf, setTf, sub, setSub, health, setSource, connected, rtt, stats, candles,
      m1, depth, events, forecast, backtest, fng, rank, swapKey, eco, reduced, intro,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}

/** REST helper re-export for components. */
export { API, apiGet };
