"use client";
import Link from "next/link";
import { Phone, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-12">
      <div className="rounded-2xl border border-line bg-ink-850 p-6 shadow-card">
        <div className="flex items-center gap-3 text-amber-300">
          <WifiOff className="h-6 w-6 shrink-0" />
          <h1 className="text-xl font-bold text-white">Offline Emergency Mode</h1>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          You do not currently have a live connection to the CrisisTwin AI server. Critical phone actions and cached public safety guidance remain available below.
        </p>

        <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          <p className="flex items-center gap-2 font-semibold text-white">
            <ShieldAlert className="h-4 w-4 text-red-300" /> Life-threatening emergency?
          </p>
          <p className="mt-1 text-xs text-red-100/90">
            Call emergency services directly using your phone dialer without waiting for internet access.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="tel:15"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white"
            >
              <Phone className="h-4 w-4" /> Call Police 15
            </a>
            <Link
              href="/emergency"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-red-400/40 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20"
            >
              Cached hospital directory
            </Link>
          </div>
        </div>

        <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm text-slate-300">
          <h2 className="font-semibold text-white">Immediate Safety Checklist</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-400">
            <li>Flooding: Move to higher ground immediately; never walk or drive through moving water.</li>
            <li>Earthquake: Drop, cover, and hold on away from windows until shaking stops.</li>
            <li>Landslide: Move sideways out of the path of debris and avoid steep cut slopes.</li>
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-ink-950"
          >
            <RefreshCw className="h-4 w-4" /> Retry connection
          </button>
          <Link
            href="/report"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-line px-4 py-2 text-sm text-slate-200 hover:bg-ink-800"
          >
            Draft incident offline
          </Link>
        </div>
      </div>
    </div>
  );
}
