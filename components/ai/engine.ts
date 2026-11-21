"use client";

// AI ENGINE — место для ТВОЕГО AI-кода (задача 4).
//
// Контракт и готовый промт: docs/AI_DATA.md → раздел «Промт для модели».
// Материал для анализа (что уже лежит в базе и приходит на вход): туда же, раздел «Формат данных».
//
// Замени ТЕЛО функции runAI на свой вызов (fetch к своей модели / локальному
// процессу / LLM API). Пока кода нет — возвращаем null, и окно AI честно
// показывает «движок не подключён».

export type AiInput = {
  symbol: string;
  ts: number;
  price: number | null;
  /** прогноз (ансамбль) */
  probUp: number;
  probDown: number;
  probFlat: number;
  confidence: number;
  horizonDays: number;
  /** индикаторы */
  rsi: number | null;
  volAnn: number | null;
  fng: number | null;
  imbalance: number | null;
  funding: number | null;
  oiChange: number | null;
  /** топ-аналоги истории */
  analogs: { label: string; sim: number; r7d: number }[];
  /** накопленная база */
  base: { hourly: number; daily: number; monthly: number; fullDays: number };
  /** последние бэктест-метрики */
  hitRate: number | null;
  baseline: number | null;
};

export type AiVerdict = {
  verdict: "UP" | "DOWN" | "FLAT";
  /** 0..100 */
  confidence: number;
  /** 1–2 предложения, только из входных чисел */
  summary: string;
  tags: string[];
};

/** Подключение модели сюда. null = AI не подключён. */
export function runAI(input: AiInput): AiVerdict | null {
  void input;
  // TODO(user): подключить свой AI-код. Промт — в docs/AI_DATA.md.
  return null;
}
