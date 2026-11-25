import { API_URL } from "@/lib/config";
import { getToken, setToken } from "@/lib/auth/token";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function detail(body: unknown, fallback: string): string {
  const d = (body as { detail?: unknown })?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e: { loc?: string[]; msg?: string }) => `${(e.loc ?? []).slice(1).join(".")}: ${e.msg}`).join("; ");
  return fallback;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = getToken();
  const method = (init.method ?? "GET").toUpperCase();
  const attempt = async (): Promise<Response> => {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      return await fetch(`${API_URL}${path}`, {
        ...init, signal: ctl.signal,
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
        headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
      });
    } finally { clearTimeout(timer); }
  };
  let res: Response;
  try {
    try { res = await attempt(); }
    catch (e) { if (method !== "GET") throw e; await new Promise((r) => setTimeout(r, 600)); res = await attempt(); } // idempotent reads retry once
  } catch {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("ct:offline"));
    throw new ApiError(0, "Cannot reach the backend. Check that the API is running, then retry.");
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ct:online"));
  if (res.status === 401 && token) {
    setToken(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("ct:unauthorized"));
  }
  if (!res.ok) throw new ApiError(res.status, detail(await res.json().catch(() => ({})), res.statusText));
  if (res.status === 204) return undefined as T;
  return (res.headers.get("content-type")?.includes("json") ? res.json() : res.blob()) as Promise<T>;
}

export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;
