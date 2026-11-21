"use client";

import { useStore } from "@/lib/store";
import { Style } from "@/components/Style";
import { Panel } from "@/components/Panel";
import { Disclaimer, EfoToggle } from "@/components/Chrome";

/** О ПРОЕКТЕ: mission, method, sources, honesty rules, disclaimer. */
export function AboutView() {
  const { health, latencyMs, connected, t } = useStore();

  return (
    <div className="ab">
      <Panel title={t("ab.title")} icon="◇" delay={80} className="ab-main">
        <div className="cols scroll-thin">
          <section>
            <h3>Что это</h3>
            <p>
              Образовательный дашборд-«пульт»: показывает, <b>с какой вероятностью</b> цена пойдёт вверх или
              вниз, и <b>почему</b> — через поиск похожих моментов в истории рынка. Это не «предсказатель
              будущего», а калькулятор вероятностей на публичных данных.
            </p>
            <h3>Как считает «мозг»</h3>
            <ol>
              <li>Окно последних свечей нормализуется в лог-возвраты (форма кривой, не доллары).</li>
              <li>По всей истории ищутся похожие участки: косинус/корреляция Пирсона → уточнение DTW.</li>
              <li>Топ-50 аналогов: что было после каждого? Доли «вверх/вниз/ flat» взвешены схожестью³.</li>
              <li>Ансамбль: аналоги 50% + техника (RSI/MACD/Bollinger) 20% + микроструктура 20% + режим рынка 10%.</li>
              <li>Честная проверка: walk-forward бэктест за последние 2 года — точность и калибровка на экране.</li>
            </ol>
            <h3>Правила честности</h3>
            <ul>
              <li>Прогноз — вероятность, а не гарантия. Никто не знает будущее.</li>
              <li>Показываем историческую точность и калибровку, включая случаи, когда модель ошибалась.</li>
              <li>При разногласии аналогов — сигнал тусклый и подпись <b>NO CLEAR EDGE</b>.</li>
              <li>Текст-вывод собирается шаблоном только из рассчитанных чисел — ничего не выдумывается.</li>
            </ul>
          </section>

          <section>
            <h3>Источники данных (только публичные, без ключей)</h3>
            <ul>
              <li><b>Binance</b>: WebSocket (kline/trade/depth) + REST /api/v3/klines — цифры в реальном времени.</li>
              <li><b>Bybit</b>: API v5 (kline, publicTrade, orderbook) + funding rate / open interest — микроструктура.</li>
              <li><b>CoinGecko</b>: резерв глубокой истории и ранг монет по капитализации.</li>
              <li><b>TradingView</b>: только официальный виджет Advanced Chart и Lightweight Charts для графиков.
                Парсинг данных TradingView запрещён их правилами и здесь не используется.</li>
              <li>Fear & Greed: alternative.me (публичный API).</li>
            </ul>
            <h3>Архитектура</h3>
            <p>
              Браузер не ходит в биржи напрямую: прокси-сервер (Node.js) кеширует свечи в SQLite,
              держит WebSocket-коннекторы с автопереключением Binance ↔ Bybit, а тяжёлый поиск аналогов
              и бэктест выполняются в <b>worker-потоках</b>, чтобы интерфейс держал 60 FPS.
            </p>
            <h3>Текущее состояние стыка</h3>
            <div className="status mono">
              <div><span className="dim">WebSocket:</span> <b className={connected ? "bull" : "amber"}>{connected ? "подключён" : "переподключение…"}</b></div>
              <div><span className="dim">задержка клиент ↔ сервер:</span> <b className="cy">{latencyMs} мс</b></div>
              <div><span className="dim">Binance:</span> <b className={health.alive.binance ? "bull" : "bear"}>{health.alive.binance ? "● доступен" : "● недоступен"}</b> <span className="dim">{health.latency.binance} мс</span></div>
              <div><span className="dim">Bybit:</span> <b className={health.alive.bybit ? "bull" : "bear"}>{health.alive.bybit ? "● доступен" : "● недоступен"}</b> <span className="dim">{health.latency.bybit} мс</span></div>
              <div><span className="dim">активный источник:</span> <b className="cy">{health.active.toUpperCase()}</b></div>
            </div>
            <div className="efo">
              <span className="dim mono">Анимации тяжёлые? </span>
              <EfoToggle />
            </div>
          </section>
        </div>
        <div className="disc-foot">
          <Disclaimer />
        </div>
      </Panel>

      <Style>{`
        .ab { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .ab-main { flex: 1; }
        .cols { display: grid; grid-template-columns: 1fr 1fr; gap: calc(var(--u) * 24); height: 100%; overflow: auto; padding-right: calc(var(--u) * 8); }
        h3 { margin: 0 0 calc(var(--u) * 6); font-size: var(--fs-m); color: var(--cyan); letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; }
        h3:not(:first-child) { margin-top: calc(var(--u) * 14); }
        p, li { font-size: var(--fs-s); line-height: 1.7; color: var(--ink); margin: 0 0 calc(var(--u) * 6); }
        ol, ul { margin: 0; padding-left: calc(var(--u) * 18); }
        li { margin-bottom: calc(var(--u) * 4); }
        b { color: var(--amber); font-weight: 600; }
        .status { display: flex; flex-direction: column; gap: calc(var(--u) * 5); font-size: var(--fs-s); border: 1px solid var(--stroke); padding: calc(var(--u) * 10); background: rgba(5,10,18,0.5); }
        .status .dim, .status .cy, .status .bull, .status .bear, .status .amber { letter-spacing: 0.04em; }
        .efo { margin-top: calc(var(--u) * 12); display: flex; align-items: center; gap: calc(var(--u) * 8); }
        .disc-foot { padding-top: calc(var(--u) * 8); border-top: 1px dashed rgba(27,58,92,0.7); margin-top: calc(var(--u) * 8); }
        @media (max-width: 1024px) { .cols { grid-template-columns: 1fr; } }
      `}</Style>
    </div>
  );
}
