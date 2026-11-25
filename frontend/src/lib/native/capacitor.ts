/**
 * Graceful Capacitor Android native bridge.
 * Safely detects if running inside an Android Capacitor container and attaches
 * native back-button navigation or native telemetry without requiring Capacitor
 * npm packages to load in standard browser/PWA runtimes.
 */

interface CapacitorAppPlugin {
  addListener?: (event: string, cb: (info: { canGoBack?: boolean }) => void) => Promise<{ remove: () => void }>;
  exitApp?: () => void;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    App?: CapacitorAppPlugin;
  };
}

export function isNativeAndroid(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android");
}

export function attachAndroidBackHandler(onBack: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const appPlugin = cap?.Plugins?.App;
  if (!cap?.isNativePlatform?.() || !appPlugin?.addListener) return () => {};
  let handle: { remove: () => void } | null = null;
  appPlugin
    .addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        onBack();
      } else {
        appPlugin.exitApp?.();
      }
    })
    .then((h) => {
      handle = h;
    })
    .catch(() => {});
  return () => {
    handle?.remove?.();
  };
}
