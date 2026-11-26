import Link from "next/link";
import { ArrowRight, Bot, CloudRain, Database, FileText, Layers, Map, Satellite, ShieldCheck, Siren, Activity, Megaphone } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { BoundaryPreview } from "@/components/map/BoundaryPreview";
import { DISCLAIMER } from "@/lib/config";
import { CountUp, Reveal } from "@/components/Reveal";
import { DuskSky, Mountains } from "@/components/Mountains";
import { PWAInstallButton } from "@/components/pwa/PWAProvider";

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const caps = [
  { icon: Megaphone, t: "Report a crisis", d: "Send an incident with live GPS, a map pin, and up to 4 photos. Administrators verify reports before public map display." },
  { icon: Satellite, t: "Balochistan Digital Twin", d: "Satellite, street, terrain, and drainage corridor overlays with district boundaries, scale, and live coordinates." },
  { icon: Activity, t: "Transparent risk scoring", d: "Weighted explainable scoring across rainfall, duration, elevation, slope, history, and exposure." },
  { icon: CloudRain, t: "Scenario simulation", d: "Configure hypothetical rainfall events, compare scenarios side-by-side, and export PDF or CSV summaries." },
  { icon: Siren, t: "Emergency resources", d: "Hospitals, rescue centres, shelters, fire services, and ambulance contacts with distance sorting." },
  { icon: Bot, t: "Multilingual AI assistant", d: "Ask in English, Urdu (اردو), or Balochi. Responses strictly reference platform records." },
  { icon: FileText, t: "Alerts, analytics & audit", d: "District alerts, community verification workflow, analytics charts, and full administrator audit trails." },
];
const steps = [
  ["Explore", "Open the Balochistan map and inspect district boundaries and drainage corridors."],
  ["Assess", "Enter rainfall, terrain, flood history, and exposure values tagged by measurement confidence."],
  ["Simulate", "Run hypothetical rainfall scenarios, compare impacts, and review limitations."],
  ["Respond", "Locate nearest verified facilities, read active alerts, and submit field reports."],
];

export default function Landing() {
  return (
    <div className="dark ct-command-surface relative min-h-screen overflow-hidden bg-[#0B1424] text-[#EDF5FA]">
      <header className="sticky top-0 z-50 border-b border-line/60 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-5 py-3">
          <Logo inverse />
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-300 md:flex" aria-label="Sections">
            <a href="#report" className="whitespace-nowrap shrink-0 hover:text-cyan-300">Report</a>
            <a href="#how" className="whitespace-nowrap shrink-0 hover:text-cyan-300">Workflow</a>
            <a href="#safety" className="whitespace-nowrap shrink-0 hover:text-cyan-300">Safety</a>
            <a href="#map" className="whitespace-nowrap shrink-0 hover:text-cyan-300">Digital Twin</a>
            <a href="#about" className="whitespace-nowrap shrink-0 hover:text-cyan-300">About</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <PWAInstallButton compact />
            <Link href="/login" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-ink-800">
              Sign in
            </Link>
            <Link href="/login?demo=1" className="whitespace-nowrap rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-ink-950 shadow-glow hover:bg-cyan-300">
              Open platform
            </Link>
          </div>
        </div>
      </header>

      <section className="relative">
        <DuskSky />
        <div className="pointer-events-none absolute inset-0 bg-topo opacity-[.06]" />
        <Mountains className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-28 pt-16 lg:grid-cols-2 lg:pt-24">
          <div className="animate-fadeUp">
            <p className="text-xs font-medium tracking-wider text-cyan-300">
              Balochistan Intelligent Disaster Management · Digital Twin &amp; Response
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Predict Risks. Simulate Disasters. <span className="text-sand-grad">Save Lives.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-200">
              Built for the communities and emergency coordinators of Balochistan: inspect district risk indicators, check published alerts, find emergency facilities, and report crises with live location and photos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?demo=1" className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-ink-950 shadow-glow hover:bg-cyan-300">
                Explore the map <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login?next=/report" className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border border-red-400/50 bg-red-500/15 px-6 py-3 font-semibold text-red-100 hover:bg-red-500/25">
                <Megaphone className="h-4 w-4" /> Report a crisis
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
              <div>
                <dt className="font-mono text-2xl font-bold text-white tabular-nums"><CountUp to={26} /></dt>
                <dd className="text-xs text-slate-400">districts mapped</dd>
              </div>
              <div>
                <dt className="font-mono text-2xl font-bold text-white tabular-nums"><CountUp to={5} /></dt>
                <dd className="text-xs text-slate-400">base &amp; basin layers</dd>
              </div>
              <div>
                <dt className="whitespace-nowrap font-mono text-2xl font-bold text-white">EN · UR · BAL</dt>
                <dd className="text-xs text-slate-400">English, Urdu, Balochi</dd>
              </div>
            </dl>
          </div>
          <div className="relative animate-fadeUp [animation-delay:.1s]">
            <div className="relative rounded-3xl border border-line bg-ink-850/85 p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-2 font-medium text-slate-200">
                  <Layers className="h-4 w-4 text-cyan-300" /> Balochistan District Boundaries
                </span>
                <span>geoBoundaries (open data)</span>
              </div>
              <BoundaryPreview className="h-[360px]" />
            </div>
          </div>
        </div>
      </section>

      <div className="border-y border-sand-500/20 bg-ink-900/70 py-3">
        <ul className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-1 px-5 text-xs uppercase tracking-[.2em] text-sand-300/80">
          <li>Quetta</li>
          <li>Bolan Pass</li>
          <li>Nasirabad</li>
          <li>Lasbela</li>
          <li>Makran Coast</li>
          <li>Zhob Valley</li>
        </ul>
      </div>

      <section id="report" className="mx-auto max-w-7xl px-5 pt-20">
        <Reveal>
          <div className="rounded-3xl border border-red-400/25 bg-gradient-to-br from-red-500/10 via-ink-850/80 to-ink-850/80 p-8 md:p-10">
            <h2 className="text-3xl font-bold text-white">Report an emergency in 3 steps</h2>
            <p className="mt-2 text-slate-300">Works online or saves a local unsubmitted draft offline until connectivity returns.</p>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                ["01. Share location", "Tap live GPS, search a settlement, or place a pin on the map."],
                ["02. Describe impact", "Choose flood, flash flood, earthquake, landslide, or blocked road and add context."],
                ["03. Attach evidence", "Add up to 4 photos (stripped of EXIF GPS on your device). Administrators verify reports."],
              ].map(([t, d]) => (
                <li key={t} className="rounded-2xl border border-line bg-ink-900/70 p-5">
                  <h3 className="font-semibold text-white">{t}</h3>
                  <p className="mt-2 text-sm text-slate-400">{d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/login?next=/report" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-500 px-6 py-3 font-semibold text-white hover:bg-red-400">
                <Megaphone className="h-4 w-4" /> Report a crisis
              </Link>
              <span className="text-sm text-slate-400">Life in danger? Call <b className="text-white">Police 15</b> first.</span>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-5 py-20">
        <Reveal>
          <h2 className="text-3xl font-bold text-white">From hazard data to coordinated response</h2>
          <p className="mt-2 text-slate-400">Four connected steps across citizen reporting and command oversight.</p>
        </Reveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line bg-ink-850/70 p-6 transition hover:-translate-y-0.5 hover:border-cyan-400/40">
              <p className="font-mono text-xs font-semibold text-cyan-300">0{i + 1}</p>
              <h3 className="mt-2 text-lg font-semibold text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="capabilities" className="border-y border-line bg-ink-900/60">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <h2 className="text-3xl font-bold text-white">Platform capabilities</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {caps.map(({ icon: I, t, d }, i) => (
              <Reveal key={t} delay={i * 50}>
                <div className="group h-full rounded-2xl border border-line bg-ink-850/70 p-6 transition hover:-translate-y-0.5 hover:border-cyan-400/50">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/30">
                    <I className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-white">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="safety" className="mx-auto max-w-7xl px-5 py-20">
        <Reveal>
          <h2 className="text-3xl font-bold text-white">Multi-hazard preparedness tips</h2>
          <p className="mt-2 text-slate-400">General public safety reminders. Always follow local PDMA and rescue directives.</p>
        </Reveal>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["Floods & Flash Floods", ["Move to higher ground early; do not wait for water to rise.", "Never walk or drive across flooded nullahs or causeways.", "Keep documents, medicine, and charged phones ready."]],
            ["Earthquakes", ["Drop, cover, and hold on under sturdy furniture.", "Stay clear of glass, masonry walls, and overhead lines.", "Evacuate safely once shaking stops and expect aftershocks."]],
            ["Landslides & Coastal Storms", ["Watch for ground cracks, tilting poles, or sudden muddy flow.", "Move sideways out of debris paths; avoid mountain roads after heavy rain.", "Along Makran coast, heed marine and cyclone advisories."]],
          ].map(([t, tips]) => (
            <Reveal key={t as string}>
              <div className="h-full rounded-2xl border border-line bg-ink-850/70 p-6 transition hover:border-sand-400/40">
                <h3 className="text-lg font-semibold text-white">{t as string}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {(tips as string[]).map((x) => (
                    <li key={x} className="flex gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sand-400" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="map" className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold text-white">Built on verifiable data honesty</h2>
          <p className="mt-4 leading-relaxed text-slate-300">
            CrisisTwin AI separates observed or admin-verified records from hypothetical simulation outputs and unverified open boundaries.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            {[
              "Preparedness: compare districts using transparent indicators.",
              "Scenario planning: test hypothetical rainfall without inventing forecasts.",
              "Response: locate verified facilities, distances, and official helplines.",
            ].map((x) => (
              <li key={x} className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                {x}
              </li>
            ))}
          </ul>
          <Link href="/login?demo=1" className="mt-8 inline-flex items-center gap-2 text-cyan-300 hover:underline">
            <Map className="h-4 w-4" /> Open the interactive map <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="rounded-3xl border border-line bg-ink-850/70 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Data governance rules</p>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            {[
              "Missing data is excluded and reported, never treated as zero.",
              "Every factor input is tagged measured, estimate, or assumption.",
              "Records carry verified / unverified labels and source citations.",
              "No facilities, alerts, weather forecasts, or statistics are fabricated.",
            ].map((x) => (
              <li key={x} className="flex gap-3">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-4xl px-5 py-20 text-center">
        <h2 className="text-3xl font-bold text-white">About CrisisTwin AI</h2>
        <p className="mt-4 leading-relaxed text-slate-300">
          Balochistan Intelligent Disaster Management, Digital Twin &amp; Emergency Response System — uniting Citizen reporting, an Administrator Command Center, and installable offline-capable mobile access.
        </p>
        <p className="mx-auto mt-5 max-w-2xl rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{DISCLAIMER}</p>
      </section>

      <footer className="border-t border-line bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-400 md:flex-row">
          <Logo inverse />
          <p>
            {CONTACT ? (
              <>
                Contact: <a className="text-cyan-300 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
              </>
            ) : (
              "CrisisTwin AI · Balochistan"
            )}
          </p>
          <p className="text-xs">Maps © OpenStreetMap, Esri, OpenTopoMap · Boundaries: geoBoundaries (CC BY 4.0)</p>
        </div>
      </footer>
    </div>
  );
}
