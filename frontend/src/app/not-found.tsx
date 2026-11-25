import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

export default function NotFound() {
  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative text-center">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-line bg-ink-850 text-cyan-300"><Compass className="h-8 w-8" /></div>
        <h1 className="mt-6 text-3xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-slate-400">This location is off the map. Check the address or head back.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-cyan-300">Go to dashboard</Link>
          <Link href="/" className="rounded-lg border border-line px-5 py-2.5 text-sm text-slate-200 hover:bg-ink-800">Home</Link>
        </div>
      </div>
    </div>
  );
}
