"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Home,
  Info,
  LogIn,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  Moon,
  Shield,
  ShieldAlert,
  Sun,
  UserCircle2,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui";
import { Logo } from "./Logo";
import { NetworkOfflineBanner, PWAInstallButton } from "@/components/pwa/PWAProvider";
import { districts as districtsApi, notifications as notifApi } from "@/lib/services";
import { attachAndroidBackHandler } from "@/lib/native/capacitor";
import { useTheme } from "@/lib/theme/ThemeContext";
import { useAsync } from "@/lib/hooks";
import { useCitizenLocation } from "@/lib/hooks/useCitizenLocation";

const CITIZEN_NAV = [
  { href: "/", label: "Home", mobileLabel: "Home", icon: Home },
  { href: "/alerts", label: "Alerts", mobileLabel: "Alerts", icon: ShieldAlert },
  { href: "/report", label: "Report", mobileLabel: "Report", icon: Megaphone, hot: true },
  { href: "/about", label: "About", mobileLabel: "About", icon: Info },
  { href: "/profile", label: "Account", mobileLabel: "Account", icon: UserCircle2 },
] as const;

const TECHNICAL_ROUTES = ["/risk", "/simulations", "/reports", "/map"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [unread, setUnread] = useState(0);
  const signingOut = useRef(false);

  const isAdminZone = path.startsWith("/admin");
  const isTechnicalDark = isAdminZone || TECHNICAL_ROUTES.some((r) => path === r || path.startsWith(r + "/"));

  const ds = useAsync(() => districtsApi.list().catch(() => []), [], "shell-districts");
  const loc = useCitizenLocation(ds.data ?? []);
  const activeDistrictName = useMemo(() => {
    if (!loc.selectedDistrictId) return null;
    return (ds.data ?? []).find((d) => d.id === loc.selectedDistrictId)?.name ?? null;
  }, [ds.data, loc.selectedDistrictId]);

  async function handleSignOut() {
    signingOut.current = true;
    await logout();
    router.replace("/");
  }

  useEffect(() => {
    if (loading || signingOut.current) return;
    if (isAdminZone) {
      if (!user) {
        router.replace("/staff-access");
      } else if (user.role !== "admin") {
        router.replace("/");
      }
    }
  }, [loading, user, isAdminZone, router]);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    const off = () => setOffline(true);
    const on = () => setOffline(false);
    window.addEventListener("ct:offline", off);
    window.addEventListener("ct:online", on);
    const detachBack = attachAndroidBackHandler(() => router.back());
    return () => {
      window.removeEventListener("ct:offline", off);
      window.removeEventListener("ct:online", on);
      detachBack();
    };
  }, [router]);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let alive = true;
    notifApi
      .list()
      .then((res) => {
        if (alive) setUnread(res.unread_count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, path]);

  if (loading && isAdminZone) {
    return (
      <div className="dark ct-command-surface grid min-h-screen place-items-center bg-[#0B1424]">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (isAdminZone && (!user || user.role !== "admin")) {
    return (
      <div className="dark ct-command-surface grid min-h-screen place-items-center bg-[#0B1424]">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  const locationLabel = activeDistrictName
    ? activeDistrictName
    : loc.lat !== null
      ? "GPS Active"
      : "Balochistan";

  const isNavActive = (href: string) => {
    if (href === "/") return path === "/" || path === "/dashboard";
    return path === href || path.startsWith(href + "/");
  };

  return (
    <div className={cn("min-h-screen flex flex-col", isTechnicalDark && "dark ct-command-surface")}>
      <a
        href="#main"
        className="sr-only z-[5000] rounded-lg bg-[#21C7D9] px-4 py-2 font-semibold text-[#0B1424] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Mobile Drawer (clean 5 items only) */}
      {open && (
        <div
          className="fixed inset-0 z-[2000] bg-[#0B1424]/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[2100] flex w-72 flex-col border-r border-ct-border bg-ct-surface transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-ct-border px-5 py-4">
          <Logo href={isAdminZone ? "/admin" : "/"} />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="grid min-h-[44px] min-w-[44px] place-items-center text-ct-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-5" aria-label="Mobile drawer navigation">
          {CITIZEN_NAV.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href);
            const hot = "hot" in item && item.hot;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-[#21C7D9]/15 font-semibold text-[#0b7280] ring-1 ring-[#21C7D9]/40 dark:text-[#21C7D9]"
                    : hot
                      ? "bg-[#DC454D]/10 text-[#b91c25] ring-1 ring-[#DC454D]/30 hover:bg-[#DC454D]/15 dark:text-red-200"
                      : "text-ct-secondary hover:bg-ct-soft hover:text-ct-text"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          {user?.role === "admin" && (
            <Link
              href="/admin"
              className="mt-3 flex min-h-[44px] items-center gap-3 rounded-xl border border-[#E9A23B]/50 bg-[#E9A23B]/15 px-3.5 py-2.5 text-sm font-semibold text-amber-900 dark:text-amber-200"
            >
              <Shield className="h-[18px] w-[18px] shrink-0" />
              Admin Portal
            </Link>
          )}
        </nav>

        <div className="space-y-3 border-t border-ct-border p-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-ct-border px-3 py-1.5 text-xs font-medium text-ct-secondary hover:border-[#21C7D9]"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          </button>

          {user ? (
            <>
              <Link href="/profile" className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-ct-soft">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0B1424] text-sm font-bold text-[#21C7D9] dark:bg-[#21C7D9] dark:text-[#0B1424]">
                  {(user.full_name ?? user.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ct-text">{user.full_name ?? user.email}</p>
                  <p className="text-[11px] capitalize text-ct-muted">{user.role}</p>
                </div>
              </Link>
              <button
                onClick={handleSignOut}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-ct-border px-3 py-1.5 text-xs font-medium text-ct-secondary hover:border-[#DC454D]/50 hover:text-[#DC454D]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#0B1424] px-3 py-2 text-xs font-semibold text-white dark:bg-[#21C7D9] dark:text-[#0B1424]"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In / Create Account
            </Link>
          )}
        </div>
      </aside>

      {/* Top Navigation Bar (Compact Horizontal Citizen Bar, No Desktop Sidebar) */}
      <header className="sticky top-0 z-[900] border-b border-ct-border bg-ct-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-2 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            {!isAdminZone && (
              <button
                className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl text-ct-secondary hover:bg-ct-soft lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            {isAdminZone ? (
              <Link href="/admin" className="truncate font-display text-sm font-bold text-[#EDF5FA]">
                CRISISTWIN AI · Admin Command Center
              </Link>
            ) : (
              <Logo href="/" compact />
            )}
          </div>

          {/* Compact Desktop Horizontal Navigation (ONLY 5 Citizen Items) */}
          {!isAdminZone && (
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
              {CITIZEN_NAV.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(item.href);
                const hot = "hot" in item && item.hot;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[#21C7D9]/15 font-semibold text-[#0b7280] ring-1 ring-[#21C7D9]/40 dark:text-[#21C7D9]"
                        : hot
                          ? "bg-[#DC454D]/10 font-semibold text-[#b91c25] ring-1 ring-[#DC454D]/30 hover:bg-[#DC454D]/15 dark:text-red-200"
                          : "text-ct-secondary hover:bg-ct-soft hover:text-ct-text"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right Utilities: Location, Theme, Notification, Account */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isAdminZone ? (
              <>
                <Link
                  href="/"
                  className="inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-xl border border-ct-border px-3 py-1.5 text-xs font-medium text-[#EDF5FA] hover:border-[#21C7D9]/60"
                >
                  Citizen App
                </Link>
                <button
                  onClick={handleSignOut}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-ct-border px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-[#DC454D]/60 hover:text-red-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/profile#location"
                  title="Current location setting"
                  className="hidden min-h-[38px] max-w-[150px] items-center gap-1.5 rounded-xl border border-ct-border bg-ct-bg px-2.5 py-1 text-xs font-medium text-ct-text transition hover:border-[#21C7D9] sm:inline-flex"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0b8a99] dark:text-[#21C7D9]" />
                  <span className="truncate">{locationLabel}</span>
                </Link>

                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="hidden min-h-[40px] min-w-[40px] place-items-center rounded-xl border border-ct-border bg-ct-surface text-ct-secondary transition hover:border-[#21C7D9] hover:text-ct-text sm:grid"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                <Link
                  href="/notifications"
                  aria-label="Notifications"
                  className="relative grid min-h-[40px] min-w-[40px] place-items-center rounded-xl border border-ct-border bg-ct-surface text-ct-secondary transition hover:border-[#21C7D9] hover:text-ct-text"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-[#DC454D] px-1.5 py-0.2 font-mono text-[10px] font-bold text-white tabular-nums">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>

                <Link
                  href="/profile"
                  aria-label={user ? "Account" : "Account & Guest Settings"}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-ct-border bg-ct-surface px-2.5 text-xs font-semibold text-ct-secondary transition hover:border-[#21C7D9] hover:text-ct-text"
                >
                  <UserCircle2 className="h-4 w-4 shrink-0" />
                  <span className="hidden xl:inline">{user ? user.full_name || "Account" : "Guest"}</span>
                </Link>

                <div className="hidden md:block">
                  <PWAInstallButton compact />
                </div>

                {user?.role === "admin" && (
                  <Link
                    href="/admin"
                    className="hidden min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#E9A23B]/50 bg-[#E9A23B]/15 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-[#E9A23B]/25 dark:text-amber-200 sm:inline-flex"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin Portal
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <NetworkOfflineBanner />

      {offline && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-[#DC454D]/30 bg-[#DC454D]/10 px-4 py-2 text-sm text-[#991b1b] dark:text-red-200 lg:px-8"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You appear to be offline. Drafts are saved locally until connectivity returns.</span>
          <button onClick={() => window.location.reload()} className="ml-auto text-xs font-semibold underline">
            Reload
          </button>
        </div>
      )}

      <div className="min-w-0 flex-1 pb-20 lg:pb-8">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1320px] px-4 py-6 outline-none lg:px-8">
          <div key={path} className="animate-fadeUp">
            {children}
          </div>
        </main>
      </div>

      {/* Citizen Mobile Bottom Tab Bar — 5 main items only, <= 64px height */}
      {!isAdminZone && (
        <nav
          aria-label="Mobile navigation"
          className="no-print pb-safe fixed bottom-0 left-0 right-0 z-[1400] grid h-16 grid-cols-5 border-t border-ct-border bg-ct-surface/95 backdrop-blur-md lg:hidden"
        >
          {CITIZEN_NAV.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href);
            const hot = "hot" in item && item.hot;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition",
                  active
                    ? "font-semibold text-[#0b8a99] dark:text-[#21C7D9]"
                    : hot
                      ? "text-[#DC454D]"
                      : "text-ct-muted hover:text-ct-text"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.mobileLabel}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
