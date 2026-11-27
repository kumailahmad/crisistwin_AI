"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const cache = new Map<string, { data: unknown; at: number }>();
const inflight = new Map<string, Promise<unknown>>();

/** Forget cached responses (call on sign-in / sign-out / mode change). */
export const clearCache = () => {
  cache.clear();
  inflight.clear();
};

export type UseAsyncOptions<T> = {
  enabled?: boolean;
  initialData?: T | null;
  ttlMs?: number;
};

/**
 * Minimal data-fetching hook: loading / error / reload, ignores stale responses.
 * - With `key`, deduplicates concurrent callers, caches results across navigations, and
 *   avoids redundant re-fetches within `ttlMs` (default 20s) unless `reload()` is called.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  key?: string,
  opts: UseAsyncOptions<T> = {}
) {
  const { enabled = true, initialData = null, ttlMs = 20_000 } = opts;

  if (key !== undefined && !cache.has(key) && initialData !== null) {
    cache.set(key, { data: initialData, at: Date.now() });
  }

  const hitEntry = key !== undefined ? cache.get(key) : undefined;
  const initialHit = hitEntry ? (hitEntry.data as T) : initialData;

  const [data, setData] = useState<T | null>(initialHit);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled && initialHit === null);
  const seq = useRef(0);

  const execute = useCallback(
    (force: boolean) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      const cached = key !== undefined ? cache.get(key) : undefined;
      if (!force && cached && Date.now() - cached.at < ttlMs) {
        setData(cached.data as T);
        setLoading(false);
        return;
      }

      const id = ++seq.current;
      setLoading(!cached && initialData === null);
      setError(null);

      let p: Promise<T>;
      if (!force && key !== undefined && inflight.has(key)) {
        p = inflight.get(key) as Promise<T>;
      } else {
        p = fn()
          .then((d) => {
            if (key !== undefined) cache.set(key, { data: d, at: Date.now() });
            return d;
          })
          .finally(() => {
            if (key !== undefined) inflight.delete(key);
          });
        if (key !== undefined) inflight.set(key, p);
      }

      p.then((d) => {
        if (id === seq.current) setData(d);
      })
        .catch((e: Error) => {
          if (id === seq.current) setError(e.message);
        })
        .finally(() => {
          if (id === seq.current) setLoading(false);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...deps, enabled, key]
  );

  useEffect(() => {
    execute(false);
  }, [execute]);

  const reload = useCallback(() => execute(true), [execute]);

  return { data, error, loading, reload, setData };
}

export const fmtDate = (s: string) =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
