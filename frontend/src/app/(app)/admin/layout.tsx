"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, FileClock, LayoutGrid, MapPinned, Siren, Users, CloudRain, Megaphone } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Overview", icon: LayoutGrid }, { href: "/admin/incidents", label: "Incident reports", icon: Megaphone }, { href: "/admin/districts", label: "Districts", icon: MapPinned },
  { href: "/admin/datasets", label: "Datasets", icon: Database }, { href: "/admin/resources", label: "Resources", icon: Siren },
  { href: "/admin/scenarios", label: "Scenarios", icon: CloudRain, Megaphone }, { href: "/admin/users", label: "Users", icon: Users }, { href: "/admin/audit", label: "Audit logs", icon: FileClock },
];
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-ink-850/80 p-1.5" role="navigation" aria-label="Admin sections">
        {TABS.map(({ href, label, icon: I }) => (
          <Link key={href} href={href} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition", path === href ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-ink-800 hover:text-white")}><I className="h-4 w-4" />{label}</Link>
        ))}
      </div>
      {children}
    </>
  );
}
