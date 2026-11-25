"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CloudRain,
  Database,
  FileClock,
  LayoutGrid,
  Map as MapIcon,
  MapPinned,
  Megaphone,
  Settings,
  ShieldAlert,
  Siren,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/incidents", label: "Incidents", icon: Megaphone },
  { href: "/admin/monitoring", label: "Monitoring Map", icon: MapIcon },
  { href: "/admin/alerts", label: "Alerts", icon: ShieldAlert },
  { href: "/admin/resources", label: "Resources", icon: Siren },
  { href: "/admin/ai", label: "AI Control", icon: Bot },
  { href: "/admin/districts", label: "Districts", icon: MapPinned },
  { href: "/admin/datasets", label: "Datasets", icon: Database },
  { href: "/admin/scenarios", label: "Simulations", icon: CloudRain },
  { href: "/reports", label: "Analytics", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit", label: "Audit Logs", icon: FileClock },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="lg:flex lg:gap-6">
      <aside className="mb-5 shrink-0 lg:mb-0 lg:w-56">
        <div className="rounded-2xl border border-line bg-ink-900/90 p-2 lg:sticky lg:top-20">
          <p className="hidden px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">
            Command Center
          </p>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin sections">
            {TABS.map(({ href, label, icon: I }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex min-h-[38px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition",
                    active ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/30" : "text-slate-400 hover:bg-ink-800 hover:text-white"
                  )}
                >
                  <I className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
