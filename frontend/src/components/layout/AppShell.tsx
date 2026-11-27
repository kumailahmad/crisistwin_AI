"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Building2,
  ClipboardCheck,
  Home,
  Hospital,
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
import { notifications as notifApi } from "@/lib/services";
import { attachAndroidBackHandler } from "@/lib/native/capacitor";
import { useTheme } from "@/lib/theme/ThemeContext";
import { STATIC_DISTRICT_OPTIONS, findStaticDistrictName } from "@/lib/data/districtsStatic";
import { useCitizenLocation } from "@/lib/hooks/useCitizenLocation";

const CITIZEN_NAV = [
  { href: "/", label: "Home", mobileLabel: "Home", icon: Home },
  { href: "/alerts", label: "Alerts", mobileLabel: "Alerts", icon: ShieldAlert },
  { href: "/report", label: "Report", mobileLabel: "Report", icon: Megaphone, hot: true },
  { href: "/about", label: "About", mobileLabel: "About", icon: Info },
  { href: "/profile", label: "Account", mobileLabel: "Account", icon: UserCircle2 },
] as const;

const DRAWER_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/alerts", label: "Latest Public Alerts", icon: ShieldAlert },
  { href: "/report", label: "Report Emergency", icon: Megaphone, hot: true },
  { href: "/resources", label: "Emergency Help", icon: Hospital },
  { href: "/assistant", label: "AI Emergency Assistant", icon: Bot },
  { href: "/report#track", label: "Track a Report", icon: ClipboardCheck },
  { href: "/about", label: "About & Districts", icon: Info },
  { href: "/profile", label: "Account & Settings", icon: UserCircle2 },
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
  const lastNotifFetchRef = useRef<{ uid: number; at: number } | null>(null);

  const isAdminZone = path.startsWith("/admin");
  const isDepartmentZone = path.startsWith("/department");
  const isTechnicalDark =
    isAdminZone || isDepartmentZone || TECHNICAL_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
  const isHome = !isAdminZone && !isDepartmentZone && (path === "/" || path === "/dashboard");

  const loc = useCitizenLocation(STATIC_DISTRICT_OPTIONS);
  const activeDistrictName = useMemo(
    () => findStaticDistrictName(loc.selectedDistrictId),
    [loc.selectedDistrictId]
  );

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
      } else if (user.role === "department") {
        router.replace("/department");
      } else if (user.role !== "admin") {
        router.replace("/");
      }
    } else if (isDepartmentZone) {
      if (!user) {
        router.replace("/staff-access");
      } else if (user.role !== "department" && user.role !== "admin") {
        router.replace("/");
      }
    }
  }, [loading, user, isAdminZone, isDepartmentZone, router]);

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
      lastNotifFetchRef.current = null;
      return;
    }
    const now = Date.now();
    if (
      lastNotifFetchRef.current &&
      lastNotifFetchRef.current.uid === user.id &&
      now - lastNotifFetchRef.current.at < 30_000 &&
      path !== "/notifications"
    ) {
      return;
    }
    let alive = true;
    lastNotifFetchRef.current = { uid: user.id, at: now };
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

  if (loading && (isAdminZone || isDepartmentZone)) {
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

  if (isDepartmentZone && (!user || (user.role !== "department" && user.role !== "admin"))) {
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
    if (href.includes("#")) return false;
    return path === href || path.startsWith(href + "/");
  };

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col overflow-x-clip",
        isHome && "lg:h-dvh lg:overflow-hidden",
        isTechnicalDark && "dark ct-command-surface"
      )}
    >
      <a
        href="#main"
        className="sr-only z-[5000] rounded-lg bg-[#21C7D9] px-4 py-2 font-semibold text-[#0B1424] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Right-side Slide-Over Quick Menu Drawer */}
      {open && (
        <div
          className="fixed inset-0 z-[2000] bg-[#0B1424]/55 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        aria-label="Quick navigation drawer"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-[2100] flex w-80 max-w-[88vw] flex-col border-l border-ct-border bg-ct-surface shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between border-b border-ct-border px-5 py-3.5">
          <Logo href={isAdminZone ? "/admin" : "/"} compact />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-ct-muted transition hover:bg-ct-soft hover:text-ct-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Drawer navigation">
          {DRAWER_LINKS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href);
            const hot = "hot" in item && item.hot;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition",
                  active
                    ? "bg-[#21C7D9]/12 font-semibold text-[#0b7280] dark:text-[#21C7D9]"
                    : hot
                      ? "bg-[#DC454D]/10 font-semibold text-[#b91c25] hover:bg-[#DC454D]/15 dark:text-red-200"
                      : "text-ct-secondary hover:bg-ct-soft hover:text-ct-text"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          {user?.role === "admin" ? (
            <div className="mt-3 space-y-1.5">
              <Link
                href="/admin"
                className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[#E9A23B]/50 bg-[#E9A23B]/15 px-3.5 py-2.5 text-sm font-semibold text-amber-900 dark:text-amber-200"
              >
                <Shield className="h-[18px] w-[18px] shrink-0" />
                Admin Command Portal
              </Link>
              <Link
                href="/department"
                className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[#21C7D9]/40 bg-[#21C7D9]/10 px-3.5 py-2.5 text-sm font-semibold text-[#0b7280] dark:text-[#21C7D9]"
              >
                <Building2 className="h-[18px] w-[18px] shrink-0" />
                Department Portal
              </Link>
            </div>
          ) : user?.role === "department" ? (
            <Link
              href="/department"
              className="mt-3 flex min-h-[44px] items-center gap-3 rounded-xl border border-[#21C7D9]/40 bg-[#21C7D9]/10 px-3.5 py-2.5 text-sm font-semibold text-[#0b7280] dark:text-[#21C7D9]"
            >
              <Building2 className="h-[18px] w-[18px] shrink-0" />
              Department Response Portal
            </Link>
          ) : (
            <Link
              href="/staff-access"
              className="mt-3 flex min-h-[40px] items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-medium text-ct-muted hover:bg-ct-soft hover:text-ct-text"
            >
              <Shield className="h-4 w-4 shrink-0" />
              Staff / Department Sign-In
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
                type="button"
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

      {/* Top Navigation Bar — Logo on Left, 5 Citizen Items Centered, Controls + Menu on Far Right */}
      <header className="sticky top-0 z-[900] border-b border-ct-border bg-ct-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-2 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center">
            {isAdminZone ? (
              <Link href="/admin" className="truncate font-display text-sm font-bold text-[#EDF5FA]">
                CRISISTWIN AI · Admin Command Center
              </Link>
            ) : isDepartmentZone ? (
              <Link href="/department" className="truncate font-display text-sm font-bold text-[#EDF5FA]">
                CRISISTWIN AI · Department Portal
              </Link>
            ) : (
              <Logo href="/" compact />
            )}
          </div>

          {/* Clean Editorial Desktop Horizontal Navigation */}
          {!isAdminZone && !isDepartmentZone && (
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
                      "relative inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
                      active
                        ? "font-semibold text-[#0b7280] after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-[#21C7D9] dark:text-[#21C7D9]"
                        : hot
                          ? "font-semibold text-[#b91c25] hover:bg-[#DC454D]/10 dark:text-red-300"
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

          {/* Right Utilities: Location, Theme, Notifications, Account, and Right-Aligned Menu Button */}
          <div className="flex shrink-0 items-center gap-1.5">
            {isAdminZone || isDepartmentZone ? (
              <>
                {user?.role === "admin" && isDepartmentZone && (
                  <Link
                    href="/admin"
                    className="inline-flex min-h-[38px] shrink-0 items-center whitespace-nowrap rounded-xl border border-[#E9A23B]/50 bg-[#E9A23B]/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-[#E9A23B]/25"
                  >
                    Admin Center
                  </Link>
                )}
                {user?.role === "admin" && isAdminZone && (
                  <Link
                    href="/department"
                    className="inline-flex min-h-[38px] shrink-0 items-center whitespace-nowrap rounded-xl border border-[#21C7D9]/40 bg-[#21C7D9]/10 px-3 py-1.5 text-xs font-medium text-[#21C7D9] hover:bg-[#21C7D9]/20"
                  >
                    Dept Portal
                  </Link>
                )}
                <Link
                  href="/"
                  className="inline-flex min-h-[38px] shrink-0 items-center whitespace-nowrap rounded-xl border border-ct-border px-3 py-1.5 text-xs font-medium text-[#EDF5FA] hover:border-[#21C7D9]/60"
                >
                  Citizen App
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-ct-border px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-[#DC454D]/60 hover:text-red-300"
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
                  className="hidden min-h-[38px] max-w-[140px] items-center gap-1.5 rounded-xl border border-ct-border bg-ct-bg px-2.5 py-1 text-xs font-medium text-ct-text transition hover:border-[#21C7D9] sm:inline-flex"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0b8a99] dark:text-[#21C7D9]" />
                  <span className="truncate">{locationLabel}</span>
                </Link>

                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="hidden min-h-[38px] min-w-[38px] place-items-center rounded-xl border border-ct-border bg-ct-surface text-ct-secondary transition hover:border-[#21C7D9] hover:text-ct-text sm:grid"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                <Link
                  href="/notifications"
                  aria-label="Notifications"
                  className="relative grid min-h-[38px] min-w-[38px] place-items-center rounded-xl border border-ct-border bg-ct-surface text-ct-secondary transition hover:border-[#21C7D9] hover:text-ct-text"
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
                  className="hidden min-h-[38px] items-center gap-1.5 rounded-xl border border-ct-border bg-ct-surface px-2.5 text-xs font-semibold text-ct-secondary transition hover:border-[#21C7D9] hover:text-ct-text sm:inline-flex"
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
                    className="hidden min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#E9A23B]/50 bg-[#E9A23B]/15 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-[#E9A23B]/25 dark:text-amber-200 sm:inline-flex"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin Portal
                  </Link>
                )}
                {user?.role === "department" && (
                  <Link
                    href="/department"
                    className="hidden min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#21C7D9]/45 bg-[#21C7D9]/15 px-3 py-1 text-xs font-semibold text-[#0b7280] hover:bg-[#21C7D9]/25 dark:text-[#21C7D9] sm:inline-flex"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Dept Portal
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-label="Open menu"
                  aria-expanded={open}
                  className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl border border-ct-border bg-ct-surface text-ct-text transition hover:border-[#21C7D9] hover:bg-ct-soft"
                >
                  <Menu className="h-5 w-5" />
                </button>
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

      <div className={cn("min-w-0 flex-1 pb-20 lg:pb-8", isHome && "flex flex-col pb-20 lg:min-h-0 lg:pb-3")}>
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full max-w-[1320px] px-4 py-5 outline-none lg:px-8",
            isHome && "flex-1 lg:flex lg:min-h-0 lg:flex-col lg:py-4"
          )}
        >
          <div className={cn(isHome && "flex-1 lg:flex lg:min-h-0 lg:flex-col")}>
            {children}
          </div>
        </main>
      </div>

      {/* Citizen Mobile Bottom Tab Bar — 5 main items only, 64px height */}
      {!isAdminZone && !isDepartmentZone && (
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
