"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const cache = new Map<string, unknown>();
/** Forget cached responses (call on sign-in / sign-out / mode change). */
export const clearCache = () => cache.clear();

/**
 * Minimal data-fetching hook: loading / error / reload, ignores stale responses.
 * With a `key`, the last result is shown instantly on the next visit while fresh data loads in the background.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], key?: string) {
  const hit = key !== undefined && cache.has(key);
  const [data, setData] = useState<T | null>(hit ? (cache.get(key!) as T) : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hit);
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current; setLoading(key === undefined || !cache.has(key)); setError(null);
    fn().then((d) => { if (key !== undefined) cache.set(key, d); if (id === seq.current) setData(d); })
      .catch((e: Error) => { if (id === seq.current) setError(e.message); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, loading, reload: run, setData };
}

export const fmtDate = (s: string) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
