# ЛОГИКА: как находит, считает, что анализирует — «AI Trading Petrunko»

Полное описание расчётной логики: источники и поток данных, алгоритм прогноза (формулы),
бэктест, API/WSS-протокол, что реально считает каждая панель и что анализирует каждая
страница, часовой накопитель AI. Числа и формулы взяты из реального кода:
`lib/analyze.ts`, `server/{index,exchange,history,analysis,worker,store,accum}.mjs`,
`components/**`, `docs/AI_DATA.md`.

---

## 1. Поток данных

```
Источники (только публичные, без ключей)
  ├─ Binance WS: wss://stream.binance.com:9443 (хост-фолбэк data-stream.binance.vision)
  │    потоки на каждую из 8 монет: {sym}@kline_1m, {sym}@trade, {sym}@depth20
  ├─ Binance REST: api.binance.com → data-api.binance.vision (фолбэк по очереди)
  │    /api/v3/klines, /api/v3/depth, /api/v3/ticker/24hr, /api/v3/ping
  ├─ Bybit v5 WS: wss://stream.bybit.com/v5/public/spot
  │    kline.1.{SYMBOL}, publicTrade.{SYMBOL}, orderbook.50.{SYMBOL}; op:ping каждые 20 с
  ├─ Bybit REST: api.bybit.com — /v5/market/kline, /tickers, /depth,
  │    /funding/history (linear perp), /open-interest (interval=1h)
  ├─ CoinGecko: /coins/{id}/ohlc?days=max (глубокая дневная история),
  │    /coins/markets (ранг по капитализации → порядок пилюль/таблицы)
  └─ alternative.me: /fng/?limit=60 (Fear & Greed)

        ↓ server/exchange.mjs — health-ping 20 с, 24h-статистика 15 с,
          реконнект WS 1500 + rand(2500) мс; после 2 сбоев Binance — смена хоста

server/index.mjs (порт 8787)
  ├─ SQLite data/market.db (WAL): candles(symbol,tf,t,…), meta, cg_daily,
  │  ai_snapshots, ai_rollup_daily, ai_rollup_monthly
  ├─ server/history.mjs: ensureHistory на старте → deepHistoryLoop (фон, до 90k 1h-баров)
  ├─ server/analysis.mjs: цикл 5 с → forecastBrief (TTL 60 с) / backtest (worker)
  │      └─ server/worker.mjs × 2 (worker_threads): scanPairs+buildForecast / runBacktest
  ├─ server/accum.mjs: часовой снапшот → rollupDaily/Monthly
  ├─ события ленты (pushEvent): trade/whale/wall/ai/sys, буфер 150, кулдаун 400 мс
  └─ HTTP /api/* + WS /ws

        ↓ WS (hello, tick ≤1 Гц, klines/depth/forecast/backtest/fng/rank/event…)
          + REST-фолбэки (depth 3.5–4.5 с, status 30 с, backtest/AI 60 с)

Клиент: lib/store.tsx → панели components/panels/* и вкладки components/views/*
REST-база: NEXT_PUBLIC_API или {host}:8787, WS: {host}:8787/ws
```

- **Вселенная (8 монет):** BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX.
- **Таймфреймы:** `1m/5m/1h/1d` → Binance `1m/5m/1h/1d`, Bybit `1/5/60/D`.
- **Приоритет источников:** `state.source = auto|binance|bybit`; в auto порядок
  `["binance","bybit"]`; активна binance, пока её REST жив или её WS поднят, иначе bybit.

---

## 2. Алгоритм прогноза (`lib/analyze.ts` — чистое ядро)

`bpd` (bars per day) = 24 для часовых свечей, 1 для дневных. Время всегда UTC.

### 2.1 Индикаторы (точные формулы)

| Индикатор | Формула / параметры |
|---|---|
| **EMA(p)** | k = 2/(p+1); e₀ = v₀; eᵢ = vᵢ·k + eᵢ₋₁·(1−k) |
| **RSI(p=14)** | g = Σ приростов, l = Σ убытков за 14 изменений; rs = (g/14)/(l/14); **RSI = 100 − 100/(1+rs)**; при l = 0 → 100 |
| **MACD** | line = EMA12 − EMA26; signal = EMA9(line); **hist = line − signal** |
| **Bollinger(p=20, k=2)** | mid = mean(20); up/dn = mid ± 2σ; **width = 4σ/mid** |
| **realizedVol(closes, bars, bpd)** | rᵢ = ln(cᵢ/cᵢ₋₁); **σ·√(bpd·365)·100 %** (годовая) |
| **znorm(a)** | (a − mean)/std, при std = 0 → знаменатель 1e−12 |
| **dtwDist** | DTW с полосой Сакоэ–Тики, см. §2.3 |

### 2.2 Лог-возвраты, запрос и горизонт

- История → лог-возвраты: `lr[0]=0; lr[i] = ln(closes[i]/closes[i−1])`.
- **Запрос** — последние `W` баров lr, z-нормализованные: `q = znorm(lr[n−W..n])`.
- **Горизонт:** кандидаты `[7, 1]` дней; `pickHorizonDays` берёт первое d, при котором
  `n ≥ W + d·bpd + 5` (обычно **7 дней**; 1 день — при тонкой истории; иначе прогноза нет).
- **Окно W:** `clamp(windowLen ?? 720, 60, 720)`; фактически из БД приходит **336 часовых
  баров (14 дней)** либо 60 дневных (`selectSeries`: 1h если ≥1500 баров, иначе deep-дневной ≥90).
- **Защита от «подглядывания в будущее»:** `exclude = hDays·bpd + 2`; аналог не может
  заходить в окно горизонта — `lastStart = n − W − exclude`.

### 2.3 Поиск аналогов — `scanPairs(closes, opts)`

Параметры: `W = clamp(windowLen ?? 720, 60, 720)`, `top = 50` (в live-scan 120),
`refineTop = 900`, `stride = 2` (часовые) / 1 (дневные); в бэктесте `top 30`,
`refineTop 250`, `stride 4`.

**Стадия 1 — косинусная предфильтрация (быстро, со stride):** для каждого старта `s`
центрируем сегмент: `m = mean(lr[s..s+W))`, `dᵢ = lr[s+i] − m`, и

```
cos = Σ dᵢ·qᵢ / ( √(Σ dᵢ²) · ‖q‖ )
```

запрос z-нормализован, поэтому это **корреляция Пирсона**. Берётся топ-**900** по cos.

**Стадия 2 — DTW-переранжирование:**
`seg = znorm(lr[s..s+W))`, `d = dtwDist(q, seg)`, смешанная схожесть

```
sim = 0.5 · ( (cos + 1) / 2 )  +  0.5 · exp( −1.2 · d )
```

**dtwDist — DTW с полосой Сакоэ–Тики:**
- ширина полосы `off = max(8, ceil(|n−m|·0.1) + 8)` (при равных длинах = ±8 баров);
- стоимость узла `|aᵢ − bⱼ|`; переходы от (i−1,j), (i−1,j−1), (i,j−1) в пределах полосы;
- результат `= путь / (n + m)` (меньше = похоже).

**Стадия 3 — жадная дедупликация (топ-50 без пересечения):** `gap = ⌊W/2⌋` — минимальный
отступ между выбранными окнами; кандидат отбрасывается, если `|picked.idx − s| < gap`.
Отбирается ровно 50. Сигнал = бар `idx + W − 1`.

### 2.4 Доходности аналогов — `buildAnalogs`

- `fwd(closes, i, bars) = closes[i+bars]/closes[i] − 1`;
- `r1d = fwd(1·bpd)`, `r7d = fwd(7·bpd)`, `r30d = fwd(30·bpd)`;
- `label` = «Mar 2021» (месяц-год UTC), `sim` — схожость 0..1.

### 2.5 Веса аналогов и голос

- **Вес аналога: `wᵢ = (max(simᵢ, 0.01))³`** — куб схожести.
- **Мёртвая зона флэта:** `thr = 0.005 · √(hDays/7)` (для 7 дней = 0.5 %).
- Раскладка по горизонту: `r > thr → wUp`, `r < −thr → wDown`, иначе `wFlat`.
- **Голос аналогов: `pAnalogs = wUp / (wUp + wDown)`** — флэт в знаменателе не входит
  (и задаёт `probFlat` отдельно, §2.7).

### 2.6 Три оставшихся голоса (все ∈ [0,1] = P(up))

**`technicalVote(closes)` — техника:**
```
r     = RSI14/100
sig   = 1 / (1 + exp( −MACD_hist / (0.004 · price) ))       ← сигмоида гистограммы
trend = EMA168 > EMA720 ? 0.65 : 0.35                        ← недельный vs месячный тренд
pos   = (price − BB_mid) / (BB_width · price)
bbVote= clamp(0.5 + tanh(pos · 6) · 0.2, 0, 1)               ← позиция в полосе Боллинджера
vote  = clamp( 0.30·r + 0.30·sig + 0.25·trend + 0.15·bbVote, 0, 1 )
```

**`regimeVote(closes, bpd)` — режим рынка:**
```
ef = EMA(7·bpd), es = EMA(30·bpd);  r = ln(ef / es)
p  = 0.5 + clamp(r · 25, −0.3, +0.3)
если realizedVol(7·bpd) > 1.3 · realizedVol(30·bpd):  p = 0.5 + (p − 0.5)·0.6   ← высокая вола → сомнение
vote = clamp(p, 0, 1)
```

**`microVote(m)` — микроструктура (live, контририрование funding):**
```
vote = clamp( 0.5 + 0.3·clamp(imbalance, −1, 1)
              − 0.15 · tanh( funding / 0.0005 )
              + 0.1  · tanh( oiChange · 5 ), 0, 1 )
```
Нет данных → 0.5. **Высокий положительный funding (толпа в лонгах) давит вниз.**
Входы: `imbalance` — дисбаланс топ-20 стакана; `funding`/`oiChange` — Bybit perp
(`oiChange = (OI_now − OI_24ч)/OI_24ч`, TTL 5 мин).

### 2.7 Ансамбль → вероятности (WEIGHTS)

```
WEIGHTS = { analogs: 0.5, technical: 0.2, micro: 0.2, regime: 0.1 }

total  = clamp( 0.5·pAnalogs + 0.2·pTech + 0.2·pMicro + 0.1·pRegime, 0.02, 0.98 )
probFlat = clamp(flatShare, 0.03, 0.30)
probUp   = clamp(total, 0.02, 0.97)
probDown = 1 − probUp − probFlat          (со страховкой ≥ 0.02)
edge = (probUp − probDown) / (probUp + probDown)
```

**Уверенность:**
```
sideShare = max(wUp, wDown) / (wUp + wDown)      ← единство толпы аналогов (0.5..1)
agreeFrac = доля голосов из 4, согласных с большинством
confidence = clamp( |edge| · (0.55 + 0.9·(sideShare − 0.5)) · (0.6 + 0.4·agreeFrac), 0, 1 )
clearEdge  = confidence ≥ 0.15                   ← иначе на сфере «NO CLEAR EDGE»
```

**Квантили и веер:**
- `weightedQuant(values, ws, q)` — взвешанный квантиль;
- `medianMove.d1/d7/d30 = weightedQuant(r1/r7/r30, ws, 0.5)`;
- `spread.d7 = Q₇₅ − Q₂₅`; `implied.{d1,d7,d30} = {p10, p50, p90, mean}`;
- `bins = histogram(hRet, ws, 16)` — 16 взвешенных бинов исходов;
- `analogs` отсортированы по sim; `best`/`second` — топ-2.

**Текст прогноза** (шаблон строго из чисел): «Рынок похож на {best[ и second]}
(схожесть {sim}%…). В {upCount} из {count} таких случаев цена шла в направлении
{рост|падение} за {nDays} дн. [Риск: …]»; риск: `|funding| > 0.0003` → перекос позиций.

### 2.8 Что считает worker (`server/worker.mjs`)

Один скан на две цели: `scanPairs(top: 120, refineTop: 900, stride: 2|1)` →
`buildForecast(pairs.slice(0,50))` (топ-50 в прогноз) + `timeline` из всех 120
(`{t, sim, r7d, r30d, src: tf}`) + `meta {tf, windowLen, bpd, bars}`.

---

## 3. Бэктест — `runBacktest` (walk-forward, честный)

**Параметры (worker):** `horizonDays: 7, years: 2, anchors: 52, top: 30,
minConfidence: 0.15`; `W = clamp(windowLen ?? 720, 60, 720)`, `Hb = hDays·bpd = 168` часовых баров.

**Якоря:** последние 2 года, `firstPos = max(W+10, len−1−Hb−spanBars)`,
`lastPos = len−1−Hb`; 52 якоря равномерно, **соседние не ближе Hb** (горизонты не перекрываются).

**На каждом якоре `p`** считаются только данные, известные на тот момент (`slice(0, p+1)`):
- `scanPairs(top 30, refineTop 250, stride 4)`; веса `sim³`, порог `thr`;
- **микроструктуры в истории нет → вес ансамбля честно перенормируется:**
```
total = clamp( (0.5·pA + 0.2·pT + 0.1·pR) / (0.5 + 0.2 + 0.1), 0.02, 0.98 )
conf  = по той же формуле, что и в live (§2.7)
```
- `actual = closes[p+Hb]/closes[p] − 1`; **`hit = (probUp ≥ 0.5) == (actual > 0)`**;
- «взятый» сигнал: `conf ≥ 0.15`.

**Метрики:**
```
hitRateAll   = hits / n                ← доля правильных направлений по ВСЕМ сигналам
baselineUp   = upActual / n             ← «всегда вверх» — честный ориентир без модели
hitRateTaken = hitsTaken / taken        ← точность только по уверенным (conf ≥ 15%)
coverage     = taken / n                ← покрытие
equity.strategy *= 1 + (predUp ? actual : −actual)   ← только на взятых сигналах (без комиссий)
equity.hold     *= 1 + actual                        ← «купить и держать» на каждом якоре
```

**Калибровка:** бакеты `[0.5, 0.6, 0.7, 0.8, 0.9, 1.0001]`; в бакет кладётся
`pDir = predUp ? total : 1−total` и `hit`; `predicted = mean(pDir)`, `realized = доля hit`.

**series:** `{t, price, predicted, conf, actual, hit}` — одна точка на якорь (≈52 сигнала).

**note** формируется из чисел: «Walk-forward: N сигналов от from — to, горизонт 7 д.,
окно W свечей, порог 15%. Точность: X %, только уверенные: Y % (покрытие Z %),
всегда-в-верх: B %. Микроструктура в истории недоступна — вес перераспределён…»

---

## 4. Страницы и панели: что что анализирует

Навигация: **Дашборд | Рынки | Прогнозы | История | Аналоги | Бэктест | AI | О проекте**
(`dash | markets | forecast | history | analogs | backtest | ai | about`).

### 4.1 Дашборд (10 панелей + оверлей агентов)

| Панель | Что считает/анализирует |
|---|---|
| **Price / Spot** | цена из `stats` (RollNumber), 24ч %, VOL, HIGH, LOW, LIVE/SYNC из WS-состояния, строка «источник/зеркало» (вторая биржа как альт-цена) |
| **Live Candles** | свечи из SQLite через WS `klines` (600) + патч формирующейся свечи по `m1`; TF 1m/5m/1h/1d; «дыхание» линии цены 950 мс |
| **Order Book Depth** | топ-8 bid/ask; ширина заливки = qty/maxQty по 16 уровням; **wall** = максимальный уровень (пульс + тег $); **imbalance** считает сервер: `(Σbid p·q − Σask p·q)/(Σbid+Σask)` по топ-20; MID = цена или (bestBid+bestAsk)/2 |
| **Fear & Greed + Mood** | `alternative.me` (обновление 10 мин): стрелка `−90 + (value/100)·180`, сглаживание 0.08/кадр; цвет по зонам (<25 красный … ≥75 зелёный); **MoodSquad** — 6 агентов-«толпы»: число быков по шкале F&G (1…5), реплики с реальными числами |
| **AI Metrics** | 6 карточек, свои локальные индикаторы: `rsiCalc` RSI14 (Wilder), `macdHistCalc` EMA12/26−EMA9, `volCalc` = (σ/mean)·√(8760)·100 по 168 барам; P↑/уверенность — из стора; funding — из прогноза; **принимает `aps-out` от шара** → чип «◄ ИЗ ЯДРА» + вспышка карточек |
| **Neural Sphere** | 3D-визуализация того же прогноза: 4600 точек плетения + 50 точек-аналогов; аналоги тянутся к полюсу результата (↑ север / ↓ юг, флэт 0.5 % → экватор); цвет/яркость ∝ sim; ядро: цвет направления при clearEdge, иначе amber, свечение ∝ уверенности; тултип «месяц · схожесть X% · через N дн: ±Y%»; **публикация `aps-out` каждые 8 с** |
| **Live Feed** | события стора: trade/whale (**usd > $500 тыс.**)/wall (**> $2 млн и > 3 %** нотационала топ-20, кулдаун 20 с)/ai/sys; обычная сделка — с вероятностью 25 %; не чаще 1/400 мс |
| **Forecast Fan** | `/api/forecast-fan`: нити = каждый аналог (цвет по знаку доходности за выбранный горизонт 24Ч/7Д/30Д, прозрачность ∝ sim), полоса p10…p90, ядро p50±, медиана; «покачивание» ветра — визуальный синус |
| **Analog Timeline** | `/api/analogs` → 64 бакета истории (высота = max sim в месяце); клик → `/api/analogs?at=` → наложение «then (cyan) / now (пунктир) / future (по r7d)», разделитель t+0 |
| **Execution Tape** | первые 8 событий `trade/whale`: время, цена, qty, $, BUY/SELL (строка целиком зелёная/красная) |

**Агенты (оверлей):** до 10 штук, число быков = `clamp(round(probUp/(probUp+probDown)·10), 2, 5)`;
патрулируют все 10 панелей (move 1750 → scan 2300 → rest), «сканируют» радаром с настоящим
названием панели, читают показания через `readingsOf` (те же данные стора), шлют пакет
показания в ядро шара (`aps-packet` → счётчик ПРИЁМ + burst), обмениваются репликами,
прыгают на trade/wall своей стороны. Логики не считает — интерактивная визуализация.

### 4.2 Рынки

- **Live Candles** — как на дашборде;
- **TradingView Advanced Chart** — официальный виджет `BINANCE:{SYM}USDT` (данные TV
  не парсятся и не используются в расчётах);
- **Order Book** — как на дашборде;
- **Рыночная таблица** — порядок строк = `rank` (CoinGecko `/coins/markets
  order=market_cap_desc`, обновление 30 мин); колонки из `stats` (цена/24ч/HIGH/LOW/объём/источник).

### 4.3 Прогнозы

- **Ансамбль:** сегментная полоса UP/FLAT/DOWN (ширина = вероятность), P(UP), мета
  (горизонт/аналогов/upCount/уверенность/NO CLEAR EDGE), мини-строка (медиана 7д,
  спред, схожесть топ), текст прогноза из чисел.
- **Веса ансамбля:** 4 строки «вес + голос»: Аналоги 0.5 / Техника 0.2 /
  Микроструктура 0.2 / Режим 0.1; голос каждого в своей строке; итог = `components.total`.
- **Ожидаемые ходы:** таблица 24ч/7д/30д × (медиана, p10, p50, p90) из `medianMove`/`implied`.
- **Распределение исходов:** `bins` — 16 взвешенных бинов доходности за горизонт.
- **Риск-факторы live** (пороги из кода):

  | Фактор | Источник | Порог/цвет |
  |---|---|---|
  | Funding rate | `micro.funding` (Bybit perp) | \|f\| > 0.0005 → «перекос позиций» (f>0 красный, f<0 зелёный), иначе «норма» |
  | ΔOI (24ч) | `micro.oiChange` | > 0.05 → «деньги входят» (amber), иначе «спокойно» |
  | Дисбаланс стакана | `depth.imbalance` | > +0.25 «стенка байеров», < −0.25 «давление селлеров», иначе «равновесие» |
  | 24ч изменение | `stats.chg` | знак → импульс суток |
  | Fear & Greed | `fng.value` | <25 «страх — возможно дно», >75 «жадность — осторожно», иначе «нейтрально» |

- **AI engine** — панель `AiEnginePanel` (см. §6).
- **Веер прогноза** — как на дашборде (Forecast Fan).

### 4.4 История

- Area-график `/api/history?q=deep|1d|1h`; статистика: свечей, начало/конец, TF,
  суммарный объём = Σ v; сноска про источники (Binance/Bybit пагинация по 1000,
  глубже CoinGecko, TradingView не используется).

### 4.5 Аналоги

- Таймлайн (64 бакета) + **топ-50 таблица**: период, полоса схожести (`sim`), доходности
  r1d/r7d/r30d; клик → наложение;
- «Как это работает» — текст 5 шагов (окно → лог-возвраты → косинус/Пирсон → DTW →
  топ-50 без пересечения → вес = схожесть³ → ансамбль).

### 4.6 Бэктест

- **KPI ×4:** точность всех / база «всегда вверх» / только уверенные (порог 15 %) /
  горизонт+окно+порог; у каждого — пояснение («vs база +N п.п.» и т.д.);
- **Помесячная точность — `byMonth(series)`:** группировка `UTC YYYY-MM`,
  `hit = hits/n` месяца; столбец зелёный, если ≥ базы; **янтарная линия = baselineUp**;
- **Сравнение 8 монет:** параллельно 8 × `/api/backtest` (brief), колонки hit/base/edge
  в п.п./уверенные/покрытие/N; **сортировка по edge↓**, текущая монета подсвечена;
- **Калибровка:** полосы прогноз (cyan) vs факт (зелёный ≥ прогноза, красный <);
- **Доверительные интервалы:** точка = сигнал, Y = уверенность, цвет = hit;
- **Кривые:** «стратегия по сигналу» (только взятые, лонг/шорт по знаку) vs «купить и держать».

### 4.7 AI

- **KPI:** часовых снимков (+ «след. HH:MM UTC»), полных суток (дни с ≥20 снапшотами),
  месяцев, монет;
- **Почасовая кривая P↑:** `/api/ai/series?level=hourly&limit=48`, ось зажата 0.3–0.7,
  пунктир 0.5, подпись «доля часов с P↑ ≥ 50 %»;
- **Суточные/месячные сводки:** N, P↑, CONF, цена, HIT.

### 4.8 О проекте

Текст: «Что это», «Как считает мозг» (5 шагов), «Правила честности» (вероятность ≠
гарантия, калибровка, NO CLEAR EDGE, текст из чисел), «Источники», «Архитектура»;
блок статуса: WS, RTT (средний последних 10 pong), пинги Binance/Bybit, активный источник;
переключатель ЭКО-режима; дисклеймер.

---

## 5. API и WebSocket-протокол

### 5.1 HTTP (`порт 8787`, CORS `*`, `Cache-Control: no-store`)

| Путь | Параметры | Что возвращает |
|---|---|---|
| `GET /api/status` | — | `{ok, source, active, alive, ws, latency, stats(8 монет), counts, ready, fng, rank, boot}` |
| `GET /api/ai/state` | — | `{hourly, daily, monthly, fullDays, nextHourAt, perSymbol, lastSnapshotAt}` |
| `GET /api/ai/series` | `symbol`, `level=hourly\|daily\|monthly`, `limit≤1000` | `{rows[]}` — сырые строки снапшотов/сводок |
| `GET /api/source` | `s=auto\|binance\|bybit` | переключает источник (+ событие `source`, `sys`) |
| `GET /api/candles` | `symbol`, `tf`, `limit≤3000` | свечи из SQLite |
| `GET /api/history` | `symbol`, `q=deep\|1d\|1h` | deep = `selectSeries` (биржа + CoinGecko) |
| `GET /api/depth` | `symbol` | кэш <4 с, иначе fetch: `{bids[20], asks[20], imbalance}` |
| `GET /api/forecast` | `symbol` | `{forecastBrief, timeline[:60], fng}` |
| `GET /api/analogs` | `symbol`, `top≤50` **или** `at=<ts>` | список или детальное наложение `then/future/now` |
| `GET /api/forecast-fan` | `symbol` | `{implied, median, bins, analogs, tail, horizonDays, …}` |
| `GET /api/backtest` | `symbol`, `full=1` | brief (+ `series[]` при full) |
| `GET /api/event-log` | — | `{events[:80]}` |
| `GET /api/fng` | — | `{fng: {value, label, history[60]}}` |

**forecastBrief (фронт):** `probUp/Down/Flat, confidence, clearEdge, edge, horizonDays,
count, upCount, best, second, components{analogs|technical|micro|regime:{w,p}, total},
medianMove, spread, bins, implied, analogs[:50], text, meta, micro{funding,oiChange,oi}`.

### 5.2 WebSocket `/ws`

**Клиент → сервер:** `{type:"sub", symbol, tf}` (ответ: klines+depth+forecast+backtest+fng+rank),
`unsub`, `ping` (→ `pong`; клиент шлёт раз в 2 с, меряет RTT).

**Сервер → клиент:**

| Тип | Когда | Содержимое |
|---|---|---|
| `hello` | подключение | `{ts, source, active, latency, stats}` |
| `event-batch` | подключение | лента истории `[:60]` |
| `tick` | ≤1 Гц + после опроса статистики (15 с) | `{stats, latency}` — живая цена/24ч |
| `klines` | на sub | 600 свечей |
| `m1` | каждая закрытая 1m-свеча | патч формирующейся свечи |
| `depth` / `depth-lite` | луп фокуса 3.5 с / ≤1 Гц | полный стакан / только imbalance |
| `event` | лента | trade/whale/wall/ai/sys; только focus-символ + глобальные; ≤1/400 мс |
| `forecast` | после пересчёта (TTL 60 с) | forecastBrief |
| `backtest` | после расчёта | backtestBrief |
| `health` | 20 с | `{alive, ws, latency, active}` |
| `stats` | topUpLoop (60 с) | `{stats}` |
| `log` | любая строка лога | `{line, seq}` (буфер 40) |

Серверный heartbeat 30 с (`ping`/`terminate`); реконнект клиента `500·2^min(n,4)` + rand 400 мс.

### 5.3 Интервалы (сводка)

| Что | Период |
|---|---|
| Прогноз | TTL 60 с + мгновенно при новой 1m-свече; опрос цикла 5 с |
| Микроструктура (funding/OI) | TTL 5 мин |
| Бэктест | первичный — после 8 прогнозов; далее одна случайная монета раз в **20 мин**; 2 worker-потока |
| 24h-статистика бирж / health-ping | 15 с / 20 с |
| topUpLoop (дозагрузка) | 60 с, пауза 80 мс/монета |
| Fear & Greed / Rank | 10 мин / 30 мин |
| Часовой снапшот AI | 1 час (+ сразу при старте) |
| Клиент: ping / depth / status / BacktestView / AI | 2 с / 4.5 с / 30 с / 60 с / 60–30 с |
| История: quick | батч 1000, пауза 300 мс; 1h→4000, 5m→1000, 1m→600, 1d→3000; CoinGecko при 1h < 8760 |
| История: deep | цель **90 000** часовых, +3000/заход, паузы 400 мс/монета, 5000 мс/проход |

---

## 6. Накопитель AI (`server/accum.mjs`, схема — `docs/AI_DATA.md`)

**Три уровня:** часовой → `ai_snapshots` (≤24/сутки) → суточный → `ai_rollup_daily`
(1/сутки) → месячный → `ai_rollup_monthly` (1/месяц). Первый тик сразу, далее каждый час.

**Часовой снапшот** (UPSERT по границе часа UTC, ключ `(symbol, ts)`; не-числа → NULL):
`price, probUp/Down/Flat, confidence, rsi, volAnn` (годовая вола за 168 часовых баров),
`fng, imbalance, funding, oiChange, horizonDays, analogs, bestLabel, bestSim, hitRate, baseline`.

**Rollup:** `GROUP BY day = strftime('%Y-%m-%d', ts/1000)` → `AVG(...)` + `priceClose`
(цена последнего часа дня); `GROUP BY month = substr(day,1,7)` → `SUM(n), days, AVG(...)`.

**Честность:** `hitRate/baseline` в снапшоте — «последнее известное на момент снапшота»;
правдивость становится известна только через горизонт (7 дней); накопитель ничего не
предсказывает — прогноз считает `lib/analyze.ts`; ничего не чистится.

**Контракт AI-движка (`components/ai/engine.ts`):**
вход `AiInput` = `{symbol, ts, price, probUp/Down/Flat, confidence, horizonDays, rsi,
volAnn, fng, imbalance, funding, oiChange, analogs[5], base{hourly,daily,monthly,fullDays},
hitRate, baseline}` → выход `AiVerdict {verdict: UP|DOWN|FLAT, confidence 0..100,
summary, tags[]} | null`. **Сейчас заглушка возвращает `null`** — панель показывает
«AI-КОД НЕ ПОДКЛЮЧЁН». Место под код и готовый промт: `docs/AI_DATA.md`.

---

## 7. Нюансы реализации (важные для понимания)

1. `pAnalogs = wUp/(wUp+wDown)` — флэт не участвует в голосе аналогов, но задаёт
   `probFlat` отдельно (кламп 3–30 %).
2. В бэктесте `hold`-эквити множится на **каждом** якоре, стратегия — только на
   «взятых» сигналах (conf ≥ 15 %).
3. «Косинус» на деле — корреляция Пирсона (сегмент центрируется, запрос z-нормализован).
4. Формула волатильности на дашборде (`volCalc`) отличается от `realizedVol` ядра:
   `(σ/mean)·√8760·100` по сырой цене, а не log-возвраты.
5. Событие «кит»: `usd > $500 000`; «стена»: уровень > $2 млн **и** > 3 % нотационала
   топ-20 стакана, кулдаун 20 с; обычная сделка — 25 % вероятность попадания в ленту.
6. Live-скан: `stride 2` (часовой) / `1` (дневной); бэктест: `stride 4`, refineTop 250
   против 900.
7. `WEIGHTS` ансамбля не «подгоняются» — фиксированы 50/20/20/10; единственная честная
   нормировка — в бэктесте (выкинутая микроструктура).
8. Горизонт по умолчанию 7 дней; при тонкой истории (< W + 7·bpd + 5) — 1 день;
   прогноза при ещё меньшей истории нет.
