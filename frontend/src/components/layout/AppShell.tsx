"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  CloudRain,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Megaphone,
  Menu,
  Phone,
  Search,
  Shield,
  ShieldAlert,
  Siren,
  UserCircle2,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui";
import { Logo } from "./Logo";
import { CommandPalette } from "./CommandPalette";
import { NetworkOfflineBanner, PWAInstallButton } from "@/components/pwa/PWAProvider";
import { notifications as notifApi } from "@/lib/services";
import { attachAndroidBackHandler } from "@/lib/native/capacitor";

const CITIZEN_NAV: { href: string; label: string; icon: typeof Map; hot?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Public Alerts", icon: ShieldAlert },
  { href: "/map", label: "GIS Map", icon: Map },
  { href: "/report", label: "Report a Crisis", icon: Megaphone, hot: true },
  { href: "/resources", label: "Nearby Resources", icon: Siren },
  { href: "/emergency", label: "Helplines & Hospitals", icon: Phone },
  { href: "/risk", label: "Risk Assessment", icon: Activity },
  { href: "/simulations", label: "Simulations", icon: CloudRain },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/reports", label: "Reports & Analytics", icon: FileText },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profile", label: "Profile & Privacy", icon: UserCircle2 },
];

const MOBILE_TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/map", label: "Map", icon: Map },
  { href: "/report", label: "Report", icon: Megaphone },
  { href: "/alerts", label: "Alerts", icon: ShieldAlert },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, demo, loading, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [offline, setOffline] = useState(false);
  const [unread, setUnread] = useState(0);
  const signingOut = useRef(false);

  const isAdminZone = path.startsWith("/admin");

  async function handleSignOut() {
    signingOut.current = true;
    await logout();
    router.replace("/");
  }

  useEffect(() => {
    if (!loading && !user && !signingOut.current) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, user, router, path]);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    const off = () => setOffline(true);
    const on = () => setOffline(false);
    window.addEventListener("keydown", key);
    window.addEventListener("ct:offline", off);
    window.addEventListener("ct:online", on);
    const detachBack = attachAndroidBackHandler(() => router.back());
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("ct:offline", off);
      window.removeEventListener("ct:online", on);
      detachBack();
    };
  }, [router]);

  useEffect(() => {
    if (!loading && user && isAdminZone && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, user, isAdminZone, router]);

  useEffect(() => {
    if (!user || demo) {
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
  }, [user, demo, path]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  const items = user.role === "admin" ? [...CITIZEN_NAV, { href: "/admin", label: "Admin Portal", icon: Shield }] : CITIZEN_NAV;

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {items.map(({ href, label, icon: Icon, hot }) => {
        const active = path === href || (href !== "/admin" && path.startsWith(href + "/")) || (href === "/admin" && isAdminZone);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex min-h-[40px] items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/30"
                : hot
                  ? "bg-red-500/10 text-red-200 ring-1 ring-red-500/30 hover:bg-red-500/20"
                  : "text-slate-400 hover:bg-ink-800 hover:text-white"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{label}</span>
            {href === "/notifications" && unread > 0 && (
              <span className="ml-auto rounded-md bg-cyan-400 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-950 tabular-nums">
                {unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const foot = (
    <div className="border-t border-line p-4">
      <Link href="/profile" className="mb-3 flex items-center gap-3 rounded-lg p-1 hover:bg-ink-800/60">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-sm font-bold text-ink-950">
          {(user.full_name ?? user.email)[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{user.full_name ?? user.email}</p>
          <p className="text-[11px] capitalize text-slate-400">{demo ? "Demo session" : user.role}</p>
        </div>
      </Link>
      <button
        onClick={handleSignOut}
        className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-red-400/50 hover:text-red-300"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only z-[5000] rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {!isAdminZone && (
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-ink-900/90 lg:flex">
          <div className="border-b border-line px-5 py-4">
            <Logo href="/dashboard" />
          </div>
          {nav}
          {foot}
        </aside>
      )}

      {open && <div className="fixed inset-0 z-[2000] bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[2100] flex w-72 flex-col border-r border-line bg-ink-900 transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <Logo href={isAdminZone ? "/admin" : "/dashboard"} />
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="min-h-[44px] min-w-[44px] grid place-items-center text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        {nav}
        {foot}
      </aside>

      <div className="topo-fade min-w-0 flex-1 pb-20 lg:pb-0">
        <header className="sticky top-0 z-[900] flex items-center gap-3 border-b border-line bg-ink-950/90 px-4 py-2.5 backdrop-blur lg:px-8">
          <button
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-slate-300 hover:bg-ink-800 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {isAdminZone ? (
            <div className="flex items-center gap-3">
              <Link href="/admin" className="whitespace-nowrap font-display text-sm font-bold text-white">
                CrisisTwin Command Center
              </Link>
              <span className="hidden text-xs text-slate-500 sm:inline">/</span>
              <span className="hidden text-xs text-amber-300 sm:inline">Administrator Workspace</span>
            </div>
          ) : (
            <button
              onClick={() => setPalette(true)}
              className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-left text-sm text-slate-500 hover:border-cyan-400/40 sm:max-w-sm"
              aria-label="Open quick search"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Search pages &amp; districts</span>
              <kbd className="ml-auto hidden rounded border border-line px-1.5 font-mono text-[10px] text-slate-400 sm:block">Ctrl K</kbd>
            </button>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2 shrink-0">
            {isAdminZone ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-white"
                >
                  Citizen Portal
                </Link>
                <button
                  onClick={handleSignOut}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-red-400/50 hover:text-red-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <PWAInstallButton compact />
                <Link
                  href="/notifications"
                  aria-label="Notifications"
                  className="relative grid min-h-[40px] min-w-[40px] place-items-center rounded-lg border border-line text-slate-300 hover:border-cyan-400/50 hover:text-white"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-cyan-400 px-1.5 py-0.2 font-mono text-[10px] font-bold text-ink-950 tabular-nums">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
                {user.role === "admin" && (
                  <Link
                    href="/admin"
                    className="hidden min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20 sm:inline-flex"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin Portal
                  </Link>
                )}
              </>
            )}
            <span className="hidden whitespace-nowrap text-xs text-slate-400 md:inline">
              {demo ? "Demo session (browser only)" : "API session"}
            </span>
          </div>
        </header>

        <NetworkOfflineBanner />

        {offline && (
          <div role="alert" className="flex items-center gap-3 border-b border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 lg:px-8">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Can’t reach the server. Showing last loaded data where available.</span>
            <button onClick={() => window.location.reload()} className="ml-auto text-xs font-semibold underline">
              Reload
            </button>
          </div>
        )}

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1500px] px-4 py-6 outline-none lg:px-8">
          <div key={path} className="animate-fadeUp">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar (Citizen Portal only, <= 64px height to respect 15% sticky budget) */}
      {!isAdminZone && (
        <nav
          aria-label="Mobile quick tabs"
          className="no-print pb-safe fixed bottom-0 left-0 right-0 z-[1400] grid h-16 grid-cols-4 border-t border-line bg-ink-950/95 backdrop-blur-md lg:hidden"
        >
          {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition",
                  active ? "text-cyan-300" : "text-slate-400 hover:text-white"
                )}
              >
                <Icon className={cn("h-5 w-5", href === "/report" && !active && "text-red-400")} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={items} />
    </div>
  );
}
