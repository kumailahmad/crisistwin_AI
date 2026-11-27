"use client";
import { useEffect } from "react";

export type WebVitalsSnapshot = {
  ttfb_ms: number | null;
  fcp_ms: number | null;
  lcp_ms: number | null;
  cls: number;
  inp_ms: number | null;
};

declare global {
  interface Window {
    __ctPerf?: WebVitalsSnapshot;
  }
}

export function WebVitalsTracker() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
    const snap: WebVitalsSnapshot = {
      ttfb_ms: null,
      fcp_ms: null,
      lcp_ms: null,
      cls: 0,
      inp_ms: null,
    };
    window.__ctPerf = snap;

    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      snap.ttfb_ms = Math.round(nav.responseStart - nav.requestStart);
    }

    const observers: PerformanceObserver[] = [];
    const watch = (type: string, cb: (entries: PerformanceEntryList) => void, buffered = true) => {
      try {
        const obs = new PerformanceObserver((list) => cb(list.getEntries()));
        obs.observe({ type, buffered } as PerformanceObserverInit);
        observers.push(obs);
      } catch {
        /* unsupported PerformanceObserver entryType */
      }
    };

    watch("paint", (entries) => {
      for (const e of entries) {
        if (e.name === "first-contentful-paint") {
          snap.fcp_ms = Math.round(e.startTime);
        }
      }
    });

    watch("largest-contentful-paint", (entries) => {
      const last = entries[entries.length - 1];
      if (last) snap.lcp_ms = Math.round(last.startTime);
    });

    watch("layout-shift", (entries) => {
      for (const e of entries as unknown as Array<{ value?: number; hadRecentInput?: boolean }>) {
        if (!e.hadRecentInput && typeof e.value === "number") {
          snap.cls = Math.round((snap.cls + e.value) * 10000) / 10000;
        }
      }
    });

    watch("event", (entries) => {
      for (const e of entries as unknown as Array<{ duration?: number; interactionId?: number }>) {
        if (e.interactionId && typeof e.duration === "number") {
          snap.inp_ms = Math.max(snap.inp_ms ?? 0, Math.round(e.duration));
        }
      }
    });

    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, []);

  return null;
}
