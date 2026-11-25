"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Download, Share, Smartphone, WifiOff, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PWAContextValue = {
  online: boolean;
  canPromptInstall: boolean;
  isStandalone: boolean;
  isIos: boolean;
  install: () => Promise<void>;
  showGuide: boolean;
  setShowGuide: (v: boolean) => void;
};

const PWACtx = createContext<PWAContextValue>({
  online: true,
  canPromptInstall: false,
  isStandalone: false,
  isIos: false,
  install: async () => {},
  showGuide: false,
  setShowGuide: () => {},
});

export const usePWA = () => useContext(PWACtx);

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window));
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((window.navigator as { standalone?: boolean }).standalone);
    setIsStandalone(standalone);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore registration failure in restricted environments */
      });
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const res = await deferredPrompt.userChoice;
      if (res.outcome === "accepted") setDeferredPrompt(null);
      return;
    }
    setShowGuide(true);
  }, [deferredPrompt]);

  return (
    <PWACtx.Provider
      value={{
        online,
        canPromptInstall: Boolean(deferredPrompt),
        isStandalone,
        isIos,
        install,
        showGuide,
        setShowGuide,
      }}
    >
      {children}
      {showGuide && (
        <div
          className="fixed inset-0 z-[3500] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setShowGuide(false)}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-line bg-ink-850 p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-white">
                <Smartphone className="h-5 w-5 text-cyan-300" />
                <h2 className="text-base font-semibold">Install CrisisTwin App</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close"
                className="rounded p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {isIos ? (
                <>
                  <p>Install CrisisTwin AI on your iPhone or iPad for full-screen emergency access:</p>
                  <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-slate-400">
                    <li>Tap the <Share className="mx-0.5 inline h-3.5 w-3.5 text-cyan-300" /> <b>Share</b> button in Safari.</li>
                    <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                    <li>Tap <b>Add</b> in the upper-right corner.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>Install CrisisTwin AI as a standalone Android or desktop app:</p>
                  <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-slate-400">
                    <li>Open your browser menu (⋮ in Chrome/Edge on Android or the address-bar install icon on desktop).</li>
                    <li>Select <b>Install app</b> or <b>Add to Home screen</b>.</li>
                    <li>Confirm to launch CrisisTwin AI with offline safety access.</li>
                  </ol>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-ink-950"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </PWACtx.Provider>
  );
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isStandalone, install } = usePWA();
  if (isStandalone) return null;
  return (
    <button
      type="button"
      onClick={install}
      aria-label="Install app"
      className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/20"
    >
      <Download className="h-3.5 w-3.5" />
      <span>{compact ? "Install" : "Install app"}</span>
    </button>
  );
}

export function NetworkOfflineBanner() {
  const { online } = usePWA();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-amber-400/40 bg-amber-500/15 px-4 py-2 text-xs text-amber-100 lg:px-8">
      <WifiOff className="h-4 w-4 shrink-0 text-amber-300" />
      <span>
        Offline mode active. Cached safety contacts remain available, and crisis reports can be saved locally as unsubmitted drafts.
      </span>
    </div>
  );
}
