/**
 * layout.config.ts — едина́я точка правды по режимам адаптива (Exercise §B).
 *
 * Режим вешается классом на <html> (applyLayoutMode() дёргается из Shell),
 * CSS-пороги в globals.css продублированы теми же числами через @media —
 * держать синхронно с BP ниже.
 *
 *  XL «Орбита»  — ширина ≥1500 и ширина/высота ≥1.45
 *  L  «Компакт» — 1100–1499
 *  M  «Планшет» — 700–1099 или портрет
 *  S  «Телефон» — <700 (формат 9:16)
 */
export type LayoutMode = "xl" | "l" | "m" | "s";

export const BP = {
  /** L: ниже этой ширины — планшет */
  wide: 1100,
  /** XL: ниже этой ширины — компактная орбита */
  big: 1500,
  /** телефон: ниже — вертикальная колонка 9:16 */
  phone: 700,
  /** XL требует ещё и широкий экран */
  wideAspect: 1.45,
  /** ультраширокий: боковые колонки растут */
  ultraAspect: 2.2,
} as const;

export function pickMode(w: number, h: number): LayoutMode {
  if (w < BP.phone) return "s";
  if (h >= w) return "m"; // portrait >=700 is mode M in CSS — keep JS in sync
  if (w >= BP.big && w / Math.max(1, h) >= BP.wideAspect) return "xl";
  if (w >= BP.wide) return "l";
  return "m";
}

/** Класс режима на <html>; возвращает предыдущий (для сравнения). */
export function applyLayoutMode(): LayoutMode | null {
  if (typeof document === "undefined") return null;
  const root = document.documentElement;
  const prev = (root.dataset.mode as LayoutMode | undefined) ?? null;
  const next = pickMode(window.innerWidth, window.innerHeight);
  if (prev !== next) {
    root.dataset.mode = next;
    root.classList.remove("mode-xl", "mode-l", "mode-m", "mode-s");
    root.classList.add(`mode-${next}`);
  }
  return prev;
}
