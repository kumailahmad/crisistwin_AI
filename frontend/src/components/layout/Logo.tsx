import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl border border-cyan-400/40 bg-gradient-to-br from-ink-700 to-ink-900 shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></svg>
      </span>
      <span className="leading-none"><span className="block text-[15px] font-extrabold tracking-tight text-white">CRISISTWIN<span className="text-cyan-400"> AI</span></span><span className="mt-0.5 block text-[10px] uppercase tracking-[.18em] text-slate-400">Balochistan</span></span>
    </Link>
  );
}
