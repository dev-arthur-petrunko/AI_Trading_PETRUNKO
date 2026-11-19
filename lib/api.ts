// REST + WS base URLs for the backend proxy (no exchange keys ever reach the client).

const UNDEF = String(undefined); // webpack may inline `process.env.X` as undefined

function apiBase(): string {
  // 1) explicit override (only if it is a real URL)
  const env = (typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_API : undefined) as string | undefined;
  if (env && /^[a-z][a-z0-9+.-]*:\/\//i.test(env)) return env.replace(/\/+$/, "");
  if (typeof window === "undefined") return "http://localhost:8787";
  // 2) same host as the page → works on localhost, LAN IPs and any deployment
  return `${window.location.protocol}//${window.location.hostname}:8787`;
}

function wsBase(): string {
  const env = (typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_WS : undefined) as string | undefined;
  if (env && /^[a-z][a-z0-9+.-]*:\/\//i.test(env)) return env.replace(/\/+$/, "");
  if (typeof window === "undefined") return "ws://localhost:8787/ws";
  return `${window.location.protocol}//${window.location.hostname}:8787/ws`;
}

// Lazy accessors (safe for SSR/hydration — no snapshot taken at import time)
export function API_URL(): string {
  return apiBase();
}
export function WS_URL_F(): string {
  return wsBase();
}
// Back-compat string exports used by older imports
export const API = apiBase();
export const WS_URL = wsBase();

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const u = new URL(apiBase() + path);
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
  let r: Response;
  try {
    r = await fetch(u.toString(), { cache: "no-store" });
  } catch (e) {
    throw new Error(`${path} → network: ${e instanceof Error ? e.message : String(e)} (base=${apiBase()}, undefFlag=${UNDEF})`);
  }
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return (await r.json()) as T;
}
