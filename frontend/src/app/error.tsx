"use client";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-300"><AlertTriangle className="h-8 w-8" /></div>
        <h1 className="mt-6 text-2xl font-bold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-400">An unexpected error occurred while showing this page. Your data is safe. Try again, and if it keeps happening, reload the page.</p>
        <button onClick={reset} className="mt-6 rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-cyan-300">Try again</button>
      </div>
    </div>
  );
}
