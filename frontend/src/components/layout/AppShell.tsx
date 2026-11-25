"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BarChart3, Bot, FileText, LayoutDashboard, LogOut, Map, Menu, Phone, Megaphone, Search, Shield, Siren, WifiOff, X, CloudRain } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { Badge, Skeleton } from "@/components/ui";
import { Logo } from "./Logo";
import { CommandPalette } from "./CommandPalette";

const NAV: { href: string; label: string; icon: typeof Map; hot?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "GIS Map", icon: Map },
  { href: "/report", label: "Report a Crisis", icon: Megaphone, hot: true },
  { href: "/risk", label: "Risk Assessment", icon: Activity },
  { href: "/simulations", label: "Simulations", icon: CloudRain },
  { href: "/resources", label: "Emergency Resources", icon: Siren },
  { href: "/emergency", label: "Emergency Contacts", icon: Phone },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/reports", label: "Reports", icon: FileText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, demo, loading, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [loading, user, router, path]);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); } };
    const off = () => setOffline(true), on = () => setOffline(false);
    window.addEventListener("keydown", key); window.addEventListener("ct:offline", off); window.addEventListener("ct:online", on);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("ct:offline", off); window.removeEventListener("ct:online", on); };
  }, []);
  useEffect(() => { if (!loading && user && path.startsWith("/admin") && user.role !== "admin") router.replace("/dashboard"); }, [loading, user, path, router]);

  if (loading || !user) return <div className="grid min-h-screen place-items-center"><Skeleton className="h-10 w-48" /></div>;
  const items = user.role === "admin" ? [...NAV, { href: "/admin", label: "Admin Panel", icon: Shield }] : NAV;

  const nav = (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
      {items.map(({ href, label, icon: Icon, hot }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} className={cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-cyan-400/10 text-cyan-300 shadow-[inset_2px_0_0_#22d3ee]" : hot ? "bg-red-500/10 text-red-200 ring-1 ring-red-500/30 hover:bg-red-500/20" : "text-slate-400 hover:bg-ink-800 hover:text-white")}>
            <Icon className="h-[18px] w-[18px]" />{label}
          </Link>
        );
      })}
    </nav>
  );
  const foot = (
    <div className="border-t border-line p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-sm font-bold text-ink-950">{(user.full_name ?? user.email)[0].toUpperCase()}</div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{user.full_name ?? user.email}</p><p className="text-[11px] capitalize text-slate-400">{demo ? "demo visitor" : user.role}</p></div>
      </div>
      <button onClick={() => { logout(); router.push("/"); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-slate-300 hover:border-red-400/50 hover:text-red-300"><LogOut className="h-3.5 w-3.5" />Sign out</button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only z-[5000] rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-ink-900/90 lg:flex">
        <div className="border-b border-line px-5 py-4"><Logo href="/dashboard" /></div>{nav}{foot}
      </aside>

      {open && <div className="fixed inset-0 z-[2000] bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-[2100] flex w-72 flex-col border-r border-line bg-ink-900 transition-transform lg:hidden", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><Logo href="/dashboard" /><button onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5 text-slate-400" /></button></div>{nav}{foot}
      </aside>

      {!path.startsWith("/report") && !path.startsWith("/admin") && (
        <Link href="/report" aria-label="Report a crisis" className="no-print fixed bottom-5 right-5 z-[1500] inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(239,68,68,.7)] transition hover:scale-105 hover:bg-red-400"><Megaphone className="h-4 w-4" /><span className="hidden sm:inline">Report a crisis</span></Link>
      )}
      <div className="topo-fade min-w-0 flex-1">
        <header className="sticky top-0 z-[900] flex items-center gap-3 border-b border-line bg-ink-950/85 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-lg p-1.5 text-slate-300 hover:bg-ink-800 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <button onClick={() => setPalette(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 py-2 text-left text-sm text-slate-500 hover:border-cyan-400/40 sm:max-w-sm" aria-label="Open quick search">
            <Search className="h-4 w-4 shrink-0" /><span className="truncate">Search pages &amp; districts</span><kbd className="ml-auto hidden rounded border border-line px-1.5 text-[10px] text-slate-400 sm:block">Ctrl K</kbd></button>
          <div className="flex-1" />
          {demo ? <Badge tone="amber">Demo mode · data computed in your browser</Badge> : <Badge tone="green"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Connected to API</Badge>}
          <Badge tone="neutral" className="hidden sm:inline-flex"><BarChart3 className="h-3 w-3" />Prototype</Badge>
        </header>
        {offline && <div role="alert" className="flex items-center gap-3 border-b border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 lg:px-8"><WifiOff className="h-4 w-4" />Can’t reach the server. Showing the last loaded data where available.<button onClick={() => window.location.reload()} className="ml-auto text-xs font-semibold underline">Reload</button></div>}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1500px] px-4 py-6 outline-none lg:px-8"><div key={path} className="animate-fadeUp">{children}</div></main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={items} />
    </div>
  );
}
