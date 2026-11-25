import Link from "next/link";
import { ArrowRight, Bot, CloudRain, Database, FileText, Layers, Map, Satellite, ShieldCheck, Siren, Activity, Megaphone } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { BoundaryPreview } from "@/components/map/BoundaryPreview";
import { DISCLAIMER } from "@/lib/config";
import { CountUp, Reveal } from "@/components/Reveal";
import { DuskSky, Mountains } from "@/components/Mountains";

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const caps = [
  { icon: Megaphone, t: "Report a crisis", d: "Send an incident with your live GPS location, a map pin and up to 4 photos. Administrators verify it before it appears on the map." },
  { icon: Satellite, t: "Real geospatial map", d: "Satellite, street and terrain base maps with district boundaries, layer controls, scale and live coordinates." },
  { icon: Activity, t: "Transparent risk scoring", d: "A weighted, explainable score. Missing inputs are excluded and reported, never counted as zero risk." },
  { icon: CloudRain, t: "Scenario simulation", d: "Configure a hypothetical rainfall event and see indicator results with assumptions and limitations." },
  { icon: Siren, t: "Emergency resources", d: "Hospitals, shelters and rescue centres from verified records, searchable on the map." },
  { icon: Bot, t: "Bilingual AI assistant", d: "Ask in English or Urdu. Answers are grounded in platform data and flag uncertainty." },
  { icon: FileText, t: "Reports & audit", d: "Downloadable PDF scenario reports, analytics, and an administrator audit trail." },
];
const steps = [
  ["Explore", "Open the map and inspect Balochistan's districts on satellite or terrain imagery."],
  ["Assess", "Enter rainfall, terrain, history and exposure inputs, tagged as measured, estimated or assumed."],
  ["Simulate", "Run a hypothetical rainfall scenario and review indicators, assumptions and limits."],
  ["Respond", "Locate verified hospitals, shelters and rescue centres and ask the assistant for guidance."],
];

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      <header className="sticky top-0 z-50 border-b border-line/60 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Logo />
          <nav className="hidden gap-7 text-sm text-slate-300 md:flex" aria-label="Sections">
            {["report", "how", "safety", "map", "about"].map((s) => <a key={s} href={`#${s}`} className="capitalize hover:text-cyan-300">{s === "how" ? "How it works" : s}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-ink-800">Sign in</Link>
            <Link href="/login?demo=1" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-ink-950 shadow-glow hover:bg-cyan-300">Open platform</Link>
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
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300"><ShieldCheck className="h-3.5 w-3.5" />Academic &amp; innovation-expo prototype</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">Stay safe. Stay informed. <span className="text-sand-grad">Balochistan</span> together.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-200">See what is happening around you, find emergency numbers and hospitals in seconds, and report floods, landslides or other crises with your live location and photos. Built for the people of Balochistan.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?demo=1" className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-ink-950 shadow-glow hover:bg-cyan-300">Explore the map <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login?next=/report" className="inline-flex items-center gap-2 rounded-xl border border-red-400/50 bg-red-500/15 px-6 py-3 font-semibold text-red-100 hover:bg-red-500/25"><Megaphone className="h-4 w-4" />Report a crisis</Link>
              <Link href="/login" className="rounded-xl border border-line bg-ink-900/40 px-6 py-3 font-medium text-slate-200 backdrop-blur hover:border-cyan-400/60 hover:bg-ink-800">Sign in</Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
              <div><dt className="text-2xl font-bold text-white"><CountUp to={26} /></dt><dd className="text-xs text-slate-400">districts mapped</dd></div>
              <div><dt className="text-2xl font-bold text-white"><CountUp to={4} /></dt><dd className="text-xs text-slate-400">base-map types</dd></div>
              <div><dt className="text-2xl font-bold text-white">EN · اردو</dt><dd className="text-xs text-slate-400">assistant</dd></div>
            </dl>
          </div>
          <div className="relative animate-fadeUp [animation-delay:.1s]">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-500/20 to-transparent blur-2xl" />
            <div className="relative rounded-3xl border border-line bg-ink-850/80 p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-400"><span className="flex items-center gap-2 font-medium text-slate-200"><Layers className="h-4 w-4 text-cyan-300" />District boundaries</span><span>Source: geoBoundaries (open data)</span></div>
              <BoundaryPreview className="h-[360px]" />
            </div>
          </div>
        </div>
      </section>

      <div className="border-y border-sand-500/20 bg-ink-900/70 py-3"><ul className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-1 px-5 text-xs uppercase tracking-[.2em] text-sand-300/80"><li>Chiltan</li><li>Bolan Pass</li><li>Ziarat</li><li>Hingol</li><li>Makran coast</li><li>Sulaiman range</li></ul></div>

      <section id="report" className="mx-auto max-w-7xl px-5 pt-20">
        <Reveal><div className="rounded-3xl border border-red-400/25 bg-gradient-to-br from-red-500/10 via-ink-850/80 to-ink-850/80 p-8 md:p-10">
          <h2 className="text-3xl font-bold text-white">See something wrong? Tell us in 3 steps</h2>
          <p className="mt-2 text-slate-300">It takes about a minute. You do not need to be an expert.</p>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[["📍", "Share where", "Tap “Use my live location”, search a place, or drop a pin on the map."], ["📝", "Say what", "Pick the type (flood, landslide, road blocked…) and write a few words."], ["📸", "Add photos", "Take up to 4 photos as evidence. Our team reviews and verifies the report."]].map(([e, t, d]) => (
              <li key={t} className="rounded-2xl border border-line bg-ink-900/70 p-5"><span className="text-3xl" aria-hidden>{e}</span><h3 className="mt-2 font-semibold text-white">{t}</h3><p className="mt-1 text-sm text-slate-400">{d}</p></li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3"><Link href="/login?next=/report" className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-6 py-3 font-semibold text-white hover:bg-red-400"><Megaphone className="h-4 w-4" />Report a crisis</Link><span className="text-sm text-slate-400">Life in danger? Call <b className="text-white">Police 15</b> first.</span></div>
        </div></Reveal>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-5 py-20">
        <Reveal><h2 className="text-3xl font-bold text-white">How it works</h2><p className="mt-2 text-slate-400">From geography to action in four steps.</p></Reveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="relative rounded-2xl border border-line bg-ink-850/70 p-6 transition hover:-translate-y-1 hover:border-cyan-400/40">
              <span className="absolute -top-3 left-6 rounded-full border border-cyan-400/40 bg-ink-900 px-2.5 py-0.5 text-xs font-bold text-cyan-300">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold text-white">{t}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="capabilities" className="border-y border-line bg-ink-900/60">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <h2 className="text-3xl font-bold text-white">Main capabilities</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {caps.map(({ icon: I, t, d }, i) => (
              <Reveal key={t} delay={i * 70}><div className="group h-full rounded-2xl border border-line bg-ink-850/70 p-6 transition hover:-translate-y-1 hover:border-cyan-400/50 hover:shadow-glow">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/30"><I className="h-5 w-5" /></div>
                <h3 className="mt-4 font-semibold text-white">{t}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="safety" className="mx-auto max-w-7xl px-5 py-20">
        <Reveal><h2 className="text-3xl font-bold text-white">Quick safety tips</h2><p className="mt-2 text-slate-400">General guidance. Always follow instructions from local authorities.</p></Reveal>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[["🌊", "Floods", ["Move to higher ground early; do not wait for water to rise.", "Never walk or drive through moving flood water.", "Keep documents, medicine and a phone charger ready."]],
            ["🏚️", "Earthquakes", ["Drop, cover and hold on under sturdy furniture.", "Stay away from windows and heavy objects that can fall.", "After shaking stops, move outside carefully and expect aftershocks."]],
            ["⛰️", "Landslides", ["Watch for cracks, tilting trees or sudden muddy water.", "Move away from the slope sideways, not downhill along the path.", "Avoid mountain roads during and after heavy rain."]]].map(([e, t, tips]) => (
            <Reveal key={t as string}><div className="h-full rounded-2xl border border-line bg-ink-850/70 p-6 transition hover:-translate-y-1 hover:border-sand-400/40"><span className="text-3xl" aria-hidden>{e as string}</span><h3 className="mt-2 text-lg font-semibold text-white">{t as string}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">{(tips as string[]).map((x) => <li key={x} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sand-400" />{x}</li>)}</ul></div></Reveal>
          ))}
        </div>
      </section>

      <section id="map" className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 lg:grid-cols-2">
        <div><h2 className="text-3xl font-bold text-white">Disaster management overview</h2>
          <p className="mt-4 leading-relaxed text-slate-300">Floods are a recurring hazard in Balochistan. CrisisTwin AI organises the information an emergency planner needs: where districts are, how exposed they may be under a rainfall scenario, and which facilities can respond.</p>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            {["Preparedness: compare districts by transparent indicators.", "Scenario planning: test hypothetical rainfall without claiming a forecast.", "Response: verified facilities with contact details on the map."].map((x) => <li key={x} className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />{x}</li>)}
          </ul>
          <Link href="/login?demo=1" className="mt-8 inline-flex items-center gap-2 text-cyan-300 hover:underline"><Map className="h-4 w-4" />Open the interactive map <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="rounded-3xl border border-line bg-ink-850/70 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Data honesty rules</p>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            {["Missing data is excluded and reported, never treated as zero.", "Every input is tagged measured, estimate or assumption.", "Records show a verified / unverified badge and their source.", "No facilities, boundaries or live figures are invented."].map((x) => <li key={x} className="flex gap-3"><Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />{x}</li>)}
          </ul>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-4xl px-5 py-20 text-center">
        <h2 className="text-3xl font-bold text-white">About the project</h2>
        <p className="mt-4 leading-relaxed text-slate-300">CrisisTwin AI is a student-built prototype for academic evaluation and innovation expos. It demonstrates how geospatial data, explainable risk indicators and an AI assistant can come together in a disaster-management tool. It is not an operational early-warning system.</p>
        <p className="mx-auto mt-5 max-w-2xl rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{DISCLAIMER}</p>
      </section>

      <footer className="border-t border-line bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-400 md:flex-row">
          <Logo />
          <p>{CONTACT ? <>Contact: <a className="text-cyan-300 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></> : "Contact: set NEXT_PUBLIC_CONTACT_EMAIL to show your team address."}</p>
          <p className="text-xs">Maps © OpenStreetMap, Esri, OpenTopoMap · Boundaries: geoBoundaries (CC BY 4.0)</p>
        </div>
      </footer>
    </div>
  );
}
