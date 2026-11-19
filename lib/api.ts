// REST + WS base URLs for the backend proxy (no exchange keys ever reach the client).

function host(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API) return process.env.NEXT_PUBLIC_API;
  if (typeof window === "undefined") return "http://localhost:8787";
  const proto = window.location.protocol === "https:" ? "https" : "http";
  return `${proto}//${window.location.hostname}:8787`;
}

function wsHost(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS) return process.env.NEXT_PUBLIC_WS;
  if (typeof window === "undefined") return "ws://localhost:8787/ws";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:8787/ws`;
}

export const API = host();
export const WS_URL = wsHost();

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const u = new URL(API + path);
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return (await r.json()) as T;
}
