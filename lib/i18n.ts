// i18n — три языка интерфейса: ru (по умолчанию) / en / uk.
// Точное совпадение ключей между языками проверяется типами: Record<Lang, Dict>.
// Данные (цены, вероятности) не переводятся — только статичные подписи UI.

export type Lang = "ru" | "en" | "uk";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "ru", label: "RU" },
  { id: "en", label: "EN" },
  { id: "uk", label: "UA" },
];

type Val = string | ((...args: any[]) => string);
type RecVal = { [k: string]: string };
/** Ключи-словари: значение — запись строк, а не переводимая строка. */
type RecKeys = "mk.col" | "an.col";
/** Публичный тип всех переводимых ключей (без ключей-записей). */
export type TKey = Exclude<keyof Dict, RecKeys>;
type Dict = {
  // --- topbar / chrome ---
  "nav.dash": string;
  "nav.markets": string;
  "nav.forecast": string;
  "nav.history": string;
  "nav.analogs": string;
  "nav.backtest": string;
  "nav.ai": string;
  "nav.about": string;
  "src.auto": string;
  "live": string;
  "sync": string;
  "eco": string;
  "brand.sub": string;
  "disclaimer": string;
  "intro": string;
  // --- panels ---
  "p.price": string;
  "p.candles": string;
  "p.book": string;
  "p.fng": string;
  "p.metrics": string;
  "p.sphere": string;
  "p.feed": string;
  "p.timeline": string;
  "p.fan": string;
  "p.tape": string;
  // --- price / feed / tape ---
  "price.24h": string;
  "price.vol": string;
  "price.high": string;
  "price.low": string;
  "price.src": string;
  "feed.empty": string;
  "feed.buy": string;
  "feed.sell": string;
  "feed.wall": string;
  "tape.time": string;
  "tape.price": string;
  "tape.qty": string;
  "tape.usd": string;
  "tape.side": string;
  "tape.buy": string;
  "tape.sell": string;
  "tape.empty": string;
  // --- sphere / agents ---
  "sph.up": string;
  "sph.down": string;
  "sph.flat": string;
  "sph.loading": string;
  "sph.recv": string;
  "agents.bull": string;
  "agents.bear": string;
  "agents.scan": string;
  // --- markets ---
  "mk.tv": string;
  "mk.own": Val;
  "mk.table": string;
  "mk.col": { [k: string]: string };
  // --- forecast ---
  "fc.title": Val;
  "fc.why": string;
  "fc.ai": string;
  "fc.hor": string;
  "fc.dist": string;
  "fc.risk": string;
  "fc.fanTitle": string;
  "fc.h24": string;
  "fc.d7": string;
  "fc.d30": string;
  "fc.ensemble": string;
  "fc.horizon": string;
  "fc.analogs": string;
  "fc.upCount": string;
  "fc.conf": string;
  "fc.noEdge": string;
  "fc.total": string;
  "fc.microNote": string;
  "fc.risk1": string;
  "fc.risk2": string;
  "fc.risk3": string;
  "fc.risk4": string;
  "fc.risk5": string;
  // --- analogs ---
  "an.timeline": string;
  "an.list": Val;
  "an.how": string;
  "an.howText": string;
  "an.empty": string;
  "an.col": { [k: string]: string };
  // --- history ---
  "hs.title": Val;
  "hs.stats": string;
  "hs.note": string;
  "hs.rows": string;
  "hs.from": string;
  "hs.to": string;
  "hs.tf": string;
  "hs.vol": string;
  // --- backtest ---
  "bt.title": Val;
  "bt.wait": string;
  "bt.calib": string;
  "bt.intervals": string;
  "bt.curve": string;
  "bt.kpi1": string;
  "bt.kpi1s": string;
  "bt.kpi2": string;
  "bt.kpi2s": string;
  "bt.kpi3": string;
  "bt.kpi3s": string;
  "bt.kpi4": string;
  "bt.kpi4s": string;
  "bt.disc": string;
  "bt.eqStrategy": string;
  "bt.eqHold": string;
  "bt.calHint": string;
  "bt.all": string;
  "bt.confOnly": string;
  "bt.base": string;
  "bt.coverage": string;
  "bt.vsBase": string;
  "bt.multiTitle": string;
  "bt.explain": string;
  "bt.months": string;
  "bt.explainBase": string;
  "bt.explainConf": string;
  "bt.explainHorizon": string;
  "bt.monthsHint": string;
  "bt.multiHint": string;
  "bt.pred": string;
  "bt.real": string;
  "bt.noBuckets": string;
  "bt.noData": string;
  // --- AI view ---
  "ai.nav": string;
  "ai.h1": string;
  "ai.h2": string;
  "ai.h3": string;
  "ai.hourly": string;
  "ai.fullDays": string;
  "ai.monthly": string;
  "ai.symbols": string;
  "ai.next": string;
  "ai.daysIn": string;
  "ai.period": string;
  "ai.note": string;
  "ai.notConnected": string;
  "ai.howToConnect": string;
  "ai.material": string;
  "ai.hourlyPts": string;
  "ai.days": string;
  "ai.monthsN": string;
  "ai.curveTitle": string;
  "ai.curveNote": string;
  "ai.curveEmpty": string;
  "ai.dailyTitle": string;
  "ai.monthlyTitle": string;
  "ai.colDay": string;
  "ai.colN": string;
  "ai.colPup": string;
  "ai.colConf": string;
  "ai.colPrice": string;
  "ai.colHit": string;
  "ai.colMonth": string;
  "ai.colDays": string;
  "ai.emptyWait": string;
  // --- about ---
  "ab.title": string;
  // --- common ---
  "common.loading": string;
  "common.update": string;
  "common.analogsN": string;
  "common.median": string;
  "common.core50": string;
  "common.range90": string;
  "common.threat": string;
  "common.threatUp": string;
  "common.threatDn": string;
  "common.recalculated": string;
  // --- metrics ---
  "m.prob": string;
  "m.conf": string;
  "m.vol": string;
  "m.funding": string;
  // --- ТЗ v3: HERO / секции / карточки-спутники ---
  "hero.more": string;
  "sc.market": string;
  "sc.forecast": string;
  "sat.fan": string;
  "sat.risk": string;
  "sat.top3": string;
  "sat.hit": string;
  "sat.feed": string;
};

const ru: Dict = {
  "nav.dash": "Дашборд", "nav.markets": "Рынки", "nav.forecast": "Прогнозы", "nav.history": "История",
  "nav.analogs": "Аналоги", "nav.backtest": "Бэктест", "nav.ai": "AI", "nav.about": "О проекте",
  "src.auto": "АВТО", "live": "LIVE", "sync": "SYNC", "eco": "ЭКО-РЕЖИМ",
  "brand.sub": "Real-time market intelligence · BTC · ETH · SOL · BNB · XRP · DOGE · ADA · AVAX",
  "disclaimer": "Образовательный проект. Не является инвестиционной рекомендацией. Торговля криптовалютой связана с высоким риском потери средств.",
  "intro": "НЕЙРО-ЯДРО ЗАПУСКАЕТСЯ · ЗАГРУЗКА СТРУКТУРЫ РЫНКА",

  "p.price": "ЦЕНА / СПОТ", "p.candles": "LIVE-СВЕЧИ", "p.book": "СТАКАН ЗАЯВОК",
  "p.fng": "СТРАХ & ЖАДНОСТЬ + ТОЛПА", "p.metrics": "AI-МЕТРИКИ",
  "p.sphere": "НЕЙРОСФЕРА · исторические аналоги", "p.feed": "ЖИВАЯ ЛЕНТА",
  "p.timeline": "ШКАЛА АНАЛОГОВ", "p.fan": "ВЕЕР ПРОГНОЗА", "p.tape": "ЛЕНТА СДЕЛОК",

  "price.24h": "24Ч", "price.vol": "ОБЪЁМ", "price.high": "МАКС", "price.low": "МИН", "price.src": "источник",
  "feed.empty": "ожидание событий рынка…", "feed.buy": "покупка", "feed.sell": "продажа", "feed.wall": "стенка",
  "tape.time": "ВРЕМЯ", "tape.price": "ЦЕНА", "tape.qty": "ОБЪЁМ", "tape.usd": "USD", "tape.side": "СТОРОНА",
  "tape.buy": "BUY ▲", "tape.sell": "SELL ▼", "tape.empty": "ожидание сделок…",

  "sph.up": "ВВЕРХ", "sph.down": "ВНИЗ", "sph.flat": "РАВНО", "sph.loading": "поиск исторических аналогов…",
  "sph.recv": "ПРИЁМ",
  "agents.bull": "BULL-АГЕНТЫ", "agents.bear": "BEAR-АГЕНТЫ", "agents.scan": "СКАН",

  "mk.tv": "TradingView · Advanced Chart (официальный виджет)",
  "mk.own": (f: string) => `${f} · LIVE`,
  "mk.table": "Рыночная таблица · топ по капитализации",
  "mk.col": { n: "#", sym: "МОНЕТА", price: "ЦЕНА", chg: "24Ч", high: "МАКС", low: "МИН", vol: "ОБЪЁМ", src: "ИСТОЧНИК" },

  "fc.title": (f: string) => `Прогноз ${f} · ансамбль`,
  "fc.why": "Почему такой прогноз · веса ансамбля",
  "fc.ai": "AI engine · вердикт модели",
  "fc.hor": "Ожидаемые ходы по горизонтам",
  "fc.dist": "Распределение исходов · 50 аналогов",
  "fc.risk": "Риск-факторы · live",
  "fc.fanTitle": "Веер прогноза · куда разлетаются аналоги",
  "fc.h24": "24 часа", "fc.d7": "7 дней", "fc.d30": "30 дней",
  "fc.ensemble": "ГОРИЗОНТ", "fc.horizon": "горизонт", "fc.analogs": "аналогов", "fc.upCount": "вверх",
  "fc.conf": "уверенность", "fc.noEdge": "· НЕТ ЯВНОГО ПРЕИМУЩЕСТВА",
  "fc.total": "Итог: взвешенная смесь",
  "fc.microNote": "Микроструктура — live; в бэктесте её вес честно перераспределён.",
  "fc.risk1": "Ставка финансирования", "fc.risk2": "ΔOI (24ч)", "fc.risk3": "Дисбаланс стакана",
  "fc.risk4": "Изменение 24ч", "fc.risk5": "Страх & Жадность",

  "an.timeline": "Шкала аналогов по месяцам (клик — наложение)",
  "an.list": (f: string) => `Топ аналогов ${f}`,
  "an.how": "Как это работает",
  "an.howText": "1. Окно свечей → лог-возвраты (форма кривой, не доллары). 2. Поиск по всей истории: косинус/Пирсон → уточнение DTW. 3. Топ-50 без пересечения с текущим окном: доходность 24ч/7д/30д. 4. P(up) — взвешенная доля «вверх» (вес = схожесть³). 5. Дальше — смесь с техникой, микроструктурой и режимом рынка.",
  "an.empty": "аналоги ещё не посчитаны…",
  "an.col": { period: "ПЕРИОД", sim: "СХОЖЕСТЬ", d1: "ЧЕРЕЗ 24Ч", d7: "7Д", d30: "30Д" },

  "hs.title": (f: string, tf: string, note: string) => `История ${f} · ${tf} · ${note}`,
  "hs.stats": "Статистика истории",
  "hs.note": "Источник: Binance / Bybit REST (пагинация). Запас — CoinGecko (дневные свечи, без ключа). Данные TradingView не используются.",
  "hs.rows": "Свечей", "hs.from": "Начало", "hs.to": "Конец", "hs.tf": "Таймфрейм", "hs.vol": "Суммарный объём",

  "bt.title": (f: string) => `Бэктест ${f} · walk-forward, последние 2 года`,
  "bt.wait": "Расчёт выполняется (worker thread)…",
  "bt.calib": "КАЛИБРОВКА: обещано → сбылось",
  "bt.intervals": "ДОВЕРИТЕЛЬНЫЕ ИНТЕРВАЛЫ ПРОГНОЗА",
  "bt.curve": "КРИВЫЕ: стратегия vs покупка и держание",
  "bt.kpi1": "ТОЧНОСТЬ (все сигналы)", "bt.kpi1s": "сигналов",
  "bt.kpi2": "«ВСЕГДА ВВЕРХ» (база)", "bt.kpi2s": "доля роста в истории",
  "bt.kpi3": "ТОЛЬКО УВЕРЕННЫЕ", "bt.kpi3s": "порог 15%, покрытие",
  "bt.kpi4": "ГОРИЗОНТ", "bt.kpi4s": "часовые ряды",
  "bt.disc": "Это ретроспективная проверка, а не гарантия будущего: точность на прошлом не обещает точность на будущем. Проект образовательный, не является инвестиционной рекомендацией.",
  "bt.eqStrategy": "стратегия по сигналу (без комиссий):",
  "bt.eqHold": "купить и держать:",
  "bt.calHint": "уверенность сигнала (0.5–0.95), зелёный = сбылся, красный = нет",
  "bt.all": "по всем", "bt.confOnly": "только уверенные", "bt.base": "всегда-в-верх",
  "bt.coverage": "покрытие", "bt.vsBase": "vs база",
  "bt.multiTitle": "СРАВНЕНИЕ: точность по всем монетам",
  "bt.explain": "КАК ЧИТАТЬ",
  "bt.months": "ТОЧНОСТЬ ПО МЕСЯЦАМ",
  "bt.explainBase": "честный ориентир: доля «вверх» за период без всякого модели",
  "bt.explainConf": "отбрасываются слабые сигналы, берутся только P↑/P↓ ≥ 15 п.п.",
  "bt.explainHorizon": "через сколько дней проверяется исход; окно — свечей на момент прогноза",
  "bt.monthsHint": "столбец = месяц, линия = база «всегда вверх»; зелёный — месяц лучше базы",
  "bt.multiHint": "отсортировано по превышению над базой; текущая монета подсвечена",
  "bt.pred": "прогноз", "bt.real": "факт", "bt.noBuckets": "нет бакетов", "bt.noData": "нет данных",

  "ai.nav": "AI", "ai.h1": "AI-НАКОПИТЕЛЬ · каждый час анализ, слой за слоем",
  "ai.h2": "AI engine", "ai.h3": "Почасовая кривая вероятности роста",
  "ai.hourly": "ЧАСОВЫХ СНИМКОВ", "ai.fullDays": "ПОЛНЫХ СУТОК", "ai.monthly": "МЕСЯЦЕВ",
  "ai.symbols": "МОНЕТ", "ai.next": "след.", "ai.daysIn": "дней в базе", "ai.period": "период",
  "ai.note": "Каждый час фиксируется снимок (прогноз + метрики + бэктест) → суточная сводка → месячная. Чем дольше работает — тем глубже материал для AI. Подробно: docs/AI_DATA.md",
  "ai.notConnected": "AI-КОД НЕ ПОДКЛЮЧЁН",
  "ai.howToConnect": "Место под твой код: components/ai/engine.ts → runAI(). Промт и формат полей: docs/AI_DATA.md.",
  "ai.material": "Материал для анализа уже копится:",
  "ai.hourlyPts": "часовых", "ai.days": "суток", "ai.monthsN": "месяцев",
  "ai.curveTitle": "ПОЧАСОВАЯ КРИВАЯ · вероятность роста",
  "ai.curveNote": "доля часов с P↑ ≥ 50% · последний снимок · обновление каждый час",
  "ai.curveEmpty": "ожидание часовых снимков…",
  "ai.dailyTitle": "СУТОЧНЫЕ СВОДКИ", "ai.monthlyTitle": "МЕСЯЧНЫЕ СВОДКИ",
  "ai.colDay": "СУТКИ", "ai.colN": "N", "ai.colPup": "P↑", "ai.colConf": "CONF",
  "ai.colPrice": "ЦЕНА", "ai.colHit": "HIT", "ai.colMonth": "МЕСЯЦ", "ai.colDays": "ДНЕЙ",
  "ai.emptyWait": "ожидание…",

  "ab.title": "AI Trading Petrunko · о проекте",

  "common.loading": "загрузка…", "common.update": "обновлено",
  "common.analogsN": "аналогов", "common.median": "медиана", "common.core50": "ядро 50%",
  "common.range90": "диапазон 90%", "common.threat": "нить", "common.threatUp": "аналог вырос",
  "common.threatDn": "упал", "common.recalculated": "пересчёт",

  "m.prob": "ВЕРОЯТНОСТЬ РОСТА", "m.conf": "УВЕРЕННОСТЬ МОДЕЛИ", "m.vol": "ВОЛАТИЛЬНОСТЬ (30д)",
  "m.funding": "FUNDING RATE",

  "hero.more": "ещё анализ ↓",
  "sc.market": "РЫНОК", "sc.forecast": "ПРОГНОЗ",
  "sat.fan": "ВЕЕР ПРОГНОЗА 7Д", "sat.risk": "РИСК-ФАКТОРЫ",
  "sat.top3": "ТОП-3 АНАЛОГА", "sat.hit": "HIT-RATE БЭКТЕСТА", "sat.feed": "ЖИВАЯ ЛЕНТА",
};

type Vars = Record<string, string | number>;
const fmt = (s: string, v?: Vars) =>
  v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`)) : s;

const en: Dict = {
  "nav.dash": "Dashboard", "nav.markets": "Markets", "nav.forecast": "Forecasts", "nav.history": "History",
  "nav.analogs": "Analogs", "nav.backtest": "Backtest", "nav.ai": "AI", "nav.about": "About",
  "src.auto": "AUTO", "live": "LIVE", "sync": "SYNC", "eco": "ECO MODE",
  "brand.sub": "Real-time market intelligence · BTC · ETH · SOL · BNB · XRP · DOGE · ADA · AVAX",
  "disclaimer": "Educational project. Not investment advice. Cryptocurrency trading carries a high risk of losing funds.",
  "intro": "NEURAL CORE BOOTING · LOADING MARKET STRUCTURE",

  "p.price": "PRICE / SPOT", "p.candles": "LIVE CANDLES", "p.book": "ORDER BOOK DEPTH",
  "p.fng": "FEAR & GREED + MOOD", "p.metrics": "AI METRICS",
  "p.sphere": "NEURAL SPHERE · historical analogs", "p.feed": "LIVE FEED",
  "p.timeline": "ANALOG TIMELINE", "p.fan": "FORECAST FAN", "p.tape": "EXECUTION TAPE",

  "price.24h": "24H", "price.vol": "VOLUME", "price.high": "HIGH", "price.low": "LOW", "price.src": "source",
  "feed.empty": "waiting for market events…", "feed.buy": "buy", "feed.sell": "sell", "feed.wall": "wall",
  "tape.time": "TIME", "tape.price": "PRICE", "tape.qty": "QTY", "tape.usd": "USD", "tape.side": "SIDE",
  "tape.buy": "BUY ▲", "tape.sell": "SELL ▼", "tape.empty": "waiting for trades…",

  "sph.up": "UP", "sph.down": "DOWN", "sph.flat": "FLAT", "sph.loading": "searching historical analogs…",
  "sph.recv": "RECV",
  "agents.bull": "BULL AGENTS", "agents.bear": "BEAR AGENTS", "agents.scan": "SCAN",

  "mk.tv": "TradingView · Advanced Chart (official widget)",
  "mk.own": (f: string) => `${f} · LIVE`,
  "mk.table": "Market table · top by market cap",
  "mk.col": { n: "#", sym: "COIN", price: "PRICE", chg: "24H", high: "HIGH", low: "LOW", vol: "VOLUME", src: "SOURCE" },

  "fc.title": (f: string) => `Forecast ${f} · ensemble`,
  "fc.why": "Why this forecast · ensemble weights",
  "fc.ai": "AI engine · model verdict",
  "fc.hor": "Expected moves by horizon",
  "fc.dist": "Outcome distribution · 50 analogs",
  "fc.risk": "Risk factors · live",
  "fc.fanTitle": "Forecast fan · where the analogs spread",
  "fc.h24": "24 hours", "fc.d7": "7 days", "fc.d30": "30 days",
  "fc.ensemble": "HORIZON", "fc.horizon": "horizon", "fc.analogs": "analogs", "fc.upCount": "upside",
  "fc.conf": "confidence", "fc.noEdge": "· NO CLEAR EDGE",
  "fc.total": "Total: weighted blend",
  "fc.microNote": "Microstructure is live; its weight is honestly re-allocated in the backtest.",
  "fc.risk1": "Funding rate", "fc.risk2": "ΔOI (24h)", "fc.risk3": "Order book imbalance",
  "fc.risk4": "24h change", "fc.risk5": "Fear & Greed",

  "an.timeline": "Analog timeline by month (click to overlay)",
  "an.list": (f: string) => `Top analogs ${f}`,
  "an.how": "How it works",
  "an.howText": "1. A window of candles → log-returns (shape of the curve, not dollars). 2. Whole-history search: cosine/Pearson → DTW refinement. 3. Top-50 without overlap with the current window: returns at 24h/7d/30d. 4. P(up) — weighted share of rallies (weight = similarity³). 5. Blended with technicals, microstructure and market regime.",
  "an.empty": "analogs not computed yet…",
  "an.col": { period: "PERIOD", sim: "SIMILARITY", d1: "AFTER 24H", d7: "7D", d30: "30D" },

  "hs.title": (f: string, tf: string, note: string) => `History ${f} · ${tf} · ${note}`,
  "hs.stats": "History statistics",
  "hs.note": "Source: Binance / Bybit REST (paginated). Fallback — CoinGecko (daily candles, no key). TradingView data is not used.",
  "hs.rows": "Candles", "hs.from": "Start", "hs.to": "End", "hs.tf": "Timeframe", "hs.vol": "Total volume",

  "bt.title": (f: string) => `Backtest ${f} · walk-forward, last 2 years`,
  "bt.wait": "Computing (worker thread)…",
  "bt.calib": "CALIBRATION: predicted → realized",
  "bt.intervals": "CONFIDENCE INTERVALS OF THE FORECAST",
  "bt.curve": "CURVES: strategy vs buy & hold",
  "bt.kpi1": "ACCURACY (all signals)", "bt.kpi1s": "signals",
  "bt.kpi2": "“ALWAYS UP” (baseline)", "bt.kpi2s": "share of up periods",
  "bt.kpi3": "CONFIDENT ONLY", "bt.kpi3s": "threshold 15%, coverage",
  "bt.kpi4": "HORIZON", "bt.kpi4s": "hourly series",
  "bt.disc": "This is a retrospective check, not a guarantee of the future: past accuracy does not promise future accuracy. Educational project, not investment advice.",
  "bt.eqStrategy": "signal strategy (no fees):",
  "bt.eqHold": "buy and hold:",
  "bt.calHint": "signal confidence (0.5–0.95), green = hit, red = miss",
  "bt.all": "all", "bt.confOnly": "confident only", "bt.base": "always up",
  "bt.coverage": "coverage", "bt.vsBase": "vs base",
  "bt.multiTitle": "COMPARISON: accuracy across all coins",
  "bt.explain": "HOW TO READ",
  "bt.months": "ACCURACY BY MONTHS",
  "bt.explainBase": "honest benchmark: share of up periods with no model at all",
  "bt.explainConf": "weak signals are dropped, only P↑/P↓ ≥ 15 pp are taken",
  "bt.explainHorizon": "days until the outcome is checked; window — candles known at forecast time",
  "bt.monthsHint": "column = month, line = always-up baseline; green beats the baseline",
  "bt.multiHint": "sorted by edge over the baseline; current coin is highlighted",
  "bt.pred": "pred", "bt.real": "actual", "bt.noBuckets": "no buckets", "bt.noData": "no data",

  "ai.nav": "AI", "ai.h1": "AI ACCUMULATOR · hourly analysis, layer by layer",
  "ai.h2": "AI engine", "ai.h3": "Hourly probability-of-up curve",
  "ai.hourly": "HOURLY SNAPSHOTS", "ai.fullDays": "FULL DAYS", "ai.monthly": "MONTHS",
  "ai.symbols": "COINS", "ai.next": "next", "ai.daysIn": "days in DB", "ai.period": "period",
  "ai.note": "Every hour a snapshot is taken (forecast + metrics + backtest) → daily summary → monthly summary. The longer it runs — the deeper the material for the AI. Details: docs/AI_DATA.md",
  "ai.notConnected": "AI CODE NOT CONNECTED",
  "ai.howToConnect": "Drop your code here: components/ai/engine.ts → runAI(). Prompt and field spec: docs/AI_DATA.md.",
  "ai.material": "Material for analysis already accumulating:",
  "ai.hourlyPts": "hourly", "ai.days": "days", "ai.monthsN": "months",
  "ai.curveTitle": "HOURLY CURVE · probability of up",
  "ai.curveNote": "share of hours with P↑ ≥ 50% · last snapshot · refreshed hourly",
  "ai.curveEmpty": "waiting for hourly snapshots…",
  "ai.dailyTitle": "DAILY SUMMARIES", "ai.monthlyTitle": "MONTHLY SUMMARIES",
  "ai.colDay": "DAY", "ai.colN": "N", "ai.colPup": "P↑", "ai.colConf": "CONF",
  "ai.colPrice": "PRICE", "ai.colHit": "HIT", "ai.colMonth": "MONTH", "ai.colDays": "DAYS",
  "ai.emptyWait": "waiting…",

  "ab.title": "AI Trading Petrunko · about the project",

  "common.loading": "loading…", "common.update": "updated",
  "common.analogsN": "analogs", "common.median": "median", "common.core50": "50% core",
  "common.range90": "90% range", "common.threat": "thread", "common.threatUp": "analog rose",
  "common.threatDn": "fell", "common.recalculated": "recomputed",

  "m.prob": "PROBABILITY OF UP", "m.conf": "MODEL CONFIDENCE", "m.vol": "VOLATILITY (30d)",
  "m.funding": "FUNDING RATE",

  "hero.more": "more analysis ↓",
  "sc.market": "MARKET", "sc.forecast": "FORECAST",
  "sat.fan": "FORECAST FAN 7D", "sat.risk": "RISK FACTORS",
  "sat.top3": "TOP-3 ANALOGS", "sat.hit": "BACKTEST HIT-RATE", "sat.feed": "LIVE FEED",
};

const uk: Dict = {
  "nav.dash": "Панель", "nav.markets": "Ринки", "nav.forecast": "Прогнози", "nav.history": "Історія",
  "nav.analogs": "Аналоги", "nav.backtest": "Бектест", "nav.ai": "AI", "nav.about": "Про проєкт",
  "src.auto": "АВТО", "live": "LIVE", "sync": "SYNC", "eco": "ЕКО-РЕЖИМ",
  "brand.sub": "Real-time market intelligence · BTC · ETH · SOL · BNB · XRP · DOGE · ADA · AVAX",
  "disclaimer": "Освітній проєкт. Не є інвестиційною рекомендацією. Торгівля криптовалютою пов’язана з високим ризиком втрати коштів.",
  "intro": "НЕЙРО-ЯДРО ЗАПУСКАЄТЬСЯ · ЗАВАНТАЖЕННЯ СТРУКТУРИ РИНКУ",

  "p.price": "ЦІНА / СПОТ", "p.candles": "LIVE-СВІЧІ", "p.book": "СТАКАН ЗАЯВОК",
  "p.fng": "СТРАХ & ЖАДНІСТЬ + НАТРІП", "p.metrics": "AI-МЕТРИКИ",
  "p.sphere": "НЕЙРОСФЕРА · історичні аналоги", "p.feed": "ЖИВА СТРІЧКА",
  "p.timeline": "ШКАЛА АНАЛОГІВ", "p.fan": "ВІЯЛО ПРОГНОЗУ", "p.tape": "СТРІЧКА УГОД",

  "price.24h": "24Г", "price.vol": "ОБІГ", "price.high": "МАКС", "price.low": "МІН", "price.src": "джерело",
  "feed.empty": "очікування подій ринку…", "feed.buy": "купівля", "feed.sell": "продаж", "feed.wall": "стінка",
  "tape.time": "ЧАС", "tape.price": "ЦІНА", "tape.qty": "ОБІГ", "tape.usd": "USD", "tape.side": "СТОРІНА",
  "tape.buy": "BUY ▲", "tape.sell": "SELL ▼", "tape.empty": "очікування угод…",

  "sph.up": "ВГОРУ", "sph.down": "ВНИЗ", "sph.flat": "РІВНО", "sph.loading": "пошук історичних аналогів…",
  "sph.recv": "ПРИЙОМ",
  "agents.bull": "BULL-АГЕНТИ", "agents.bear": "BEAR-АГЕНТИ", "agents.scan": "СКАН",

  "mk.tv": "TradingView · Advanced Chart (офіційний віджет)",
  "mk.own": (f: string) => `${f} · LIVE`,
  "mk.table": "Ринкова таблиця · топ за капіталізацією",
  "mk.col": { n: "#", sym: "МОНЕТА", price: "ЦІНА", chg: "24Г", high: "МАКС", low: "МІН", vol: "ОБІГ", src: "ДЖЕРЕЛО" },

  "fc.title": (f: string) => `Прогноз ${f} · ансамбль`,
  "fc.why": "Чому такий прогноз · ваги ансамблю",
  "fc.ai": "AI engine · вердикт моделі",
  "fc.hor": "Очікувані рухи за горизонтами",
  "fc.dist": "Розподіл наслідків · 50 аналогів",
  "fc.risk": "Фактори ризику · live",
  "fc.fanTitle": "Віяло прогнозу · куди розлітаються аналоги",
  "fc.h24": "24 години", "fc.d7": "7 днів", "fc.d30": "30 днів",
  "fc.ensemble": "ГОРИЗОНТ", "fc.horizon": "горизонт", "fc.analogs": "аналогів", "fc.upCount": "угору",
  "fc.conf": "впевненість", "fc.noEdge": "· НЕМАЄ ЯВНОЇ ПЕРЕВАГИ",
  "fc.total": "Разом: зважена суміш",
  "fc.microNote": "Мікроструктура — live; її вагу в бектесті чесно перерозподілено.",
  "fc.risk1": "Ставка фінансування", "fc.risk2": "ΔOI (24г)", "fc.risk3": "Дисбаланс стакану",
  "fc.risk4": "Зміна 24г", "fc.risk5": "Страх & Жадність",

  "an.timeline": "Шкала аналогів по місяцях (клік — накладання)",
  "an.list": (f: string) => `Топ аналогів ${f}`,
  "an.how": "Як це працює",
  "an.howText": "1. Вікно свічок → лог-повернення (форма кривої, не долари). 2. Пошук по всій історії: косинус/Пірсон → уточнення DTW. 3. Топ-50 без перетину з поточним вікном: дохідність 24г/7д/30д. 4. P(up) — зважена частка «угору» (вага = схожість³). 5. Далі — суміш із технікою, мікроструктурою та режимом ринку.",
  "an.empty": "аналоги ще не пораховано…",
  "an.col": { period: "ПЕРІОД", sim: "СХОЖІСТЬ", d1: "ЧЕРЕЗ 24Г", d7: "7Д", d30: "30Д" },

  "hs.title": (f: string, tf: string, note: string) => `Історія ${f} · ${tf} · ${note}`,
  "hs.stats": "Статистика історії",
  "hs.note": "Джерело: Binance / Bybit REST (пагінація). Резерв — CoinGecko (денні свічки, без ключа). Дані TradingView не використовуються.",
  "hs.rows": "Свічок", "hs.from": "Початок", "hs.to": "Кінець", "hs.tf": "Таймфрейм", "hs.vol": "Сумарний обіг",

  "bt.title": (f: string) => `Бектест ${f} · walk-forward, останні 2 роки`,
  "bt.wait": "Розрахунок виконується (worker thread)…",
  "bt.calib": "КАЛІБРУВАННЯ: обіцяно → справдилось",
  "bt.intervals": "ДОВІРЧІ ІНТЕРВАЛИ ПРОГНОЗУ",
  "bt.curve": "КРИВІ: стратегія vs купівля й тримання",
  "bt.kpi1": "ТОЧНІСТЬ (усі сигнали)", "bt.kpi1s": "сигналів",
  "bt.kpi2": "«ЗАВЖДИ ВГОРУ» (база)", "bt.kpi2s": "частка росту в історії",
  "bt.kpi3": "ЛИШЕ ВПЕВНЕНІ", "bt.kpi3s": "поріг 15%, покриття",
  "bt.kpi4": "ГОРИЗОНТ", "bt.kpi4s": "годинні ряди",
  "bt.disc": "Це ретроспективна перевірка, а не гарантія майбутнього: точність на минулому не обіцяє точність на майбутньому. Проєкт освітній, не є інвестиційною рекомендацією.",
  "bt.eqStrategy": "стратегія за сигналом (без комісій):",
  "bt.eqHold": "купити й тримати:",
  "bt.calHint": "впевненість сигналу (0.5–0.95), зелений = справдився, червоний = ні",
  "bt.all": "по всіх", "bt.confOnly": "лише впевнені", "bt.base": "завжди вгору",
  "bt.coverage": "покриття", "bt.vsBase": "vs база",
  "bt.multiTitle": "ПОРІВНЯННЯ: точність по всіх монетах",
  "bt.explain": "ЯК ЧИТАТИ",
  "bt.months": "ТОЧНІСТЬ ПО МІСЯЦЯХ",
  "bt.explainBase": "чесний орієнтир: частка «вгору» за період без жодної моделі",
  "bt.explainConf": "слабкі сигнали відкидаються, беруться лише P↑/P↓ ≥ 15 п.п.",
  "bt.explainHorizon": "через скільки днів перевіряється результат; вікно — свічок на момент прогнозу",
  "bt.monthsHint": "стовпець = місяць, лінія = база «завжди вгору»; зелений — місяць кращий за базу",
  "bt.multiHint": "відсортовано за перевищенням над базою; поточна монета підсвічена",
  "bt.pred": "прогноз", "bt.real": "факт", "bt.noBuckets": "немає бакетів", "bt.noData": "немає даних",

  "ai.nav": "AI", "ai.h1": "AI-НАКОПИЮВАЧ · щогодинний аналіз, шар за шаром",
  "ai.h2": "AI engine", "ai.h3": "Годинна крива ймовірності росту",
  "ai.hourly": "ГОДИННИХ ЗНІМКІВ", "ai.fullDays": "ПОВНИХ ДІБ", "ai.monthly": "МІСЯЦІВ",
  "ai.symbols": "МОНЕТ", "ai.next": "наступ.", "ai.daysIn": "діб у базі", "ai.period": "період",
  "ai.note": "Щогодини фіксується знімок (прогноз + метрики + бектест) → добова зведення → місячна. Чим довче працює — тим глибший матеріал для AI. Детально: docs/AI_DATA.md",
  "ai.notConnected": "AI-КОД НЕ ПІДКЛЕНО",
  "ai.howToConnect": "Місце під твій код: components/ai/engine.ts → runAI(). Промт і формат полів: docs/AI_DATA.md.",
  "ai.material": "Матеріал для аналізу вже накопичується:",
  "ai.hourlyPts": "годинних", "ai.days": "доб", "ai.monthsN": "місяців",
  "ai.curveTitle": "ГОДИННА КРИВА · ймовірність росту",
  "ai.curveNote": "частка годин із P↑ ≥ 50% · останній знімок · оновлення щогодини",
  "ai.curveEmpty": "очікування годинних знімків…",
  "ai.dailyTitle": "ДОБОВІ ЗВЕДЕННЯ", "ai.monthlyTitle": "МІСЯЧНІ ЗВЕДЕННЯ",
  "ai.colDay": "ДОБА", "ai.colN": "N", "ai.colPup": "P↑", "ai.colConf": "CONF",
  "ai.colPrice": "ЦІНА", "ai.colHit": "HIT", "ai.colMonth": "МІСЯЦЬ", "ai.colDays": "ДІБ",
  "ai.emptyWait": "очікування…",

  "ab.title": "AI Trading Petrunko · про проєкт",

  "common.loading": "завантаження…", "common.update": "оновлено",
  "common.analogsN": "аналогів", "common.median": "медіана", "common.core50": "ядро 50%",
  "common.range90": "діапазон 90%", "common.threat": "нитка", "common.threatUp": "аналог виріс",
  "common.threatDn": "впав", "common.recalculated": "перерахунок",

  "m.prob": "ЙМОВІРНІСТЬ РОСТУ", "m.conf": "ВПЕВНЕНІСТЬ МОДЕЛІ", "m.vol": "ВОЛАТИЛЬНІСТЬ (30д)",
  "m.funding": "FUNDING RATE",

  "hero.more": "ще аналіз ↓",
  "sc.market": "РИНОК", "sc.forecast": "ПРОГНОЗ",
  "sat.fan": "ВІЯЛО ПРОГНОЗУ 7Д", "sat.risk": "ФАКТОРИ РИЗИКУ",
  "sat.top3": "ТОП-3 АНАЛОГІВ", "sat.hit": "HIT-RATE БЕКТЕСТУ", "sat.feed": "ЖИВА СТРІЧКА",
};

const DICT: Record<Lang, Dict> = { ru, en, uk };

export function makeT(lang: Lang) {
  const resolve = (key: keyof Dict): Val | RecVal => {
    const entry = DICT[lang][key] ?? DICT.en[key];
    return entry === undefined ? (key as string) : entry;
  };
  // t("mk.col")            → запись колонок { n, sym, price, … }
  // t("hs.title", f, tf, n) → строка; аргументы передаются в функцию как есть,
  // t("common.loading", {x}) → строка с {x}-подстановками
  function t(key: RecKeys): RecVal;
  function t(key: `${RecKeys}.${string}`): string;
  function t(key: Exclude<keyof Dict, RecKeys>, ...args: any[]): string;
  function t(key: keyof Dict | `${RecKeys}.${string}`, ...args: any[]): string | RecVal {
    let entry: Val | RecVal;
    if (typeof key === "string" && key in (DICT[lang] as object) === false && key.includes(".")) {
      // путь к полю внутри записи-словаря: "mk.col.sym" → ru["mk.col"]["sym"]
      const dot = key.lastIndexOf(".");
      const head = key.slice(0, dot);
      const field = key.slice(dot + 1);
      const rec = (DICT[lang][head as RecKeys] ?? DICT.en[head as RecKeys] ?? {}) as RecVal;
      entry = rec[field] ?? key;
    } else {
      entry = resolve(key as keyof Dict);
    }
    if (typeof entry === "function") return entry(...args);
    if (typeof entry === "string") {
      const v = args.length > 0 && typeof args[0] === "object" ? (args[0] as Vars) : undefined;
      return fmt(entry, v);
    }
    return entry;
  }
  return t;
}

/** Человекочитаемое название языка для самой кнопки. */
export const langSelf: Record<Lang, string> = { ru: "RU", en: "EN", uk: "UA" };
