// Client-side types mirroring the server payloads.

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type StatsRow = {
  price?: number;
  chg?: number;
  high?: number;
  low?: number;
  vol?: number;
  src?: string;
  altPrice?: number;
};

export type Stats = Record<string, StatsRow>;

export type Analog = {
  t: number;
  idx?: number;
  sim: number;
  r1d: number;
  r7d: number;
  r30d: number;
  label: string;
};

export type TimelineEntry = { t: number; sim: number; r7d: number; r30d: number; src: string };

export type ForecastBrief = {
  probUp: number;
  probDown: number;
  probFlat: number;
  confidence: number;
  clearEdge: boolean;
  edge: number;
  horizonDays: number;
  count: number;
  upCount: number;
  best: { label: string; t: number; sim: number; r?: number } | null;
  second: { label: string; t: number; sim: number } | null;
  components: {
    analogs: { w: number; p: number };
    technical: { w: number; p: number };
    micro: { w: number; p: number };
    regime: { w: number; p: number };
    total: number;
  };
  medianMove: { d1: number; d7: number; d30: number };
  spread: { d7: number };
  bins: { centers: number[]; shares: number[] };
  implied?: {
    d1: { p10: number; p50: number; p90: number; mean: number };
    d7: { p10: number; p50: number; p90: number; mean: number };
    d30: { p10: number; p50: number; p90: number; mean: number };
  };
  analogs?: Analog[];
  computedAt: number;
  enoughData: boolean;
  timelineTop: number;
  text: string;
  meta: { tf: string; windowLen: number; bpd: number; bars: number; at: number } | null;
  micro: { funding?: number; oiChange?: number; oi?: number };
};

export type BacktestBrief = {
  computed: boolean;
  n: number;
  taken: number;
  coverage: number;
  hitRateAll: number;
  hitRateTaken: number;
  baselineUp: number;
  horizonDays: number;
  note: string;
  from: number;
  to: number;
  tf: string;
  ms: number;
  calibration?: { lo: number; hi: number; predicted: number; realized: number; n: number }[];
  equity?: { strategy: number; hold: number };
};

export type FeedEvent = {
  id: number;
  icon: string;
  kind: "trade" | "whale" | "wall" | "ai" | "sys";
  sym?: string;
  side?: "buy" | "sell" | "bid" | "ask";
  price?: number;
  qty?: number;
  usd?: number;
  text?: string;
  t: number;
};

export type DepthMsg = {
  symbol: string;
  imbalance: number;
  bids: [number, number][];
  asks: [number, number][];
  ts: number;
};

export type FngData = {
  value: number;
  label: string;
  updatedAt: number;
  history: { t: number; v: number }[];
};

export type RankRow = { id: string; mcap: number; change: number };

export type Health = {
  source: string;
  active: string;
  alive: Record<string, boolean>;
  ws: Record<string, boolean>;
  latency: Record<string, number>;
};
