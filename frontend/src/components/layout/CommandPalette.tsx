"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, MapPin, Navigation, Search } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAsync } from "@/lib/hooks";
import { districts } from "@/lib/services";
import { cn } from "@/lib/cn";

type Item = { label: string; hint: string; to: string; kind: "page" | "district" };

export function CommandPalette({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: { href: string; label: string }[] }) {
  const router = useRouter();
  const ds = useAsync(() => districts.list(), [], "districts");
  const [q, setQ] = useState(""); const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...pages.map((p) => ({ label: p.label, hint: "Go to page", to: p.href, kind: "page" as const })),
      ...(ds.data ?? []).map((d) => ({ label: d.name, hint: "Show on map", to: `/map?district=${encodeURIComponent(d.name)}`, kind: "district" as const })),
    ];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((x) => x.label.toLowerCase().includes(s)) : all).slice(0, 12);
  }, [q, pages, ds.data]);

  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => setI(0), [q]);
  const go = (it?: Item) => { if (it) { onClose(); router.push(it.to); } };

  return (
    <Modal open={open} onClose={onClose} title="Quick search">
      <div className="-mt-1 space-y-3" onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
        else if (e.key === "Enter") { e.preventDefault(); go(items[i]); }
      }}>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages and districts…" aria-label="Quick search"
            className="w-full rounded-lg border border-line bg-ink-900 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/70 focus:outline-none" /></div>
        <ul role="listbox" className="max-h-72 space-y-0.5 overflow-auto">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matches</li>}
          {items.map((it, n) => (
            <li key={it.kind + it.to} role="option" aria-selected={n === i}>
              <button onMouseEnter={() => setI(n)} onClick={() => go(it)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", n === i ? "bg-cyan-400/15 text-cyan-100" : "text-slate-300")}>
                {it.kind === "page" ? <Navigation className="h-4 w-4 text-slate-500" /> : <MapPin className="h-4 w-4 text-cyan-300" />}{it.label}
                <span className="ml-auto text-xs text-slate-500">{it.hint}</span>{n === i && <CornerDownLeft className="h-3.5 w-3.5 text-slate-500" />}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500">↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </Modal>
  );
}
