"use client";
import Link from "next/link";
import { Mountains } from "@/components/Mountains";
import { useState } from "react";
import { Activity, Bot, CheckCircle2, CloudRain, Circle, Map as MapIcon, MapPinned, ShieldCheck, Siren, ArrowRight, Megaphone } from "lucide-react";
import { Donut } from "@/components/charts";
import { MapView } from "@/components/map/MapView";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Notice, RiskBadge, Skeleton, StatCard } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { useMapData } from "@/lib/mapData";
import { datasets, simulations } from "@/lib/services";
import { RISK_COLORS } from "@/lib/types";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const TILES = [
  { to: "/report", t: "Report a crisis", d: "Live location + photos", i: Megaphone, c: "from-red-500/25 to-orange-500/10 ring-red-400/40 text-red-100" },
  { to: "/emergency", t: "Emergency numbers", d: "Police, rescue, hospitals", i: Siren, c: "from-amber-400/20 to-amber-600/5 ring-amber-300/40 text-amber-100" },
  { to: "/map", t: "Explore the map", d: "Satellite, streets, terrain", i: MapIcon, c: "from-cyan-400/20 to-teal-500/5 ring-cyan-300/40 text-cyan-100" },
  { to: "/assistant", t: "Ask the assistant", d: "English or اردو", i: Bot, c: "from-violet-400/20 to-indigo-500/5 ring-violet-300/40 text-violet-100" },
];

export default function Dashboard() {
  const { demo, user } = useAuth();
  const m = useMapData();
  const sims = useAsync(() => simulations.list(), [], "sims");
  const ds = useAsync(() => (demo ? Promise.resolve([]) : datasets.list().catch(() => [])), [demo], "datasets");
  const [sel, setSel] = useState<string | null>(null);

  if (m.error) return <ErrorState message={m.error} onRetry={m.reload} />;
  const d = m.data;
  const dist = Object.entries((d?.assessments ?? []).reduce<Record<string, number>>((a, x) => ({ ...a, [x.category]: (a[x.category] ?? 0) + 1 }), {})).map(([name, value]) => ({ name, value }));
  const latestVerified = (ds.data ?? []).filter((x) => x.verified).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const names = new Map((d?.districts ?? []).map((x) => [x.id, x.name]));

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-6 shadow-card card-glow">
        <Mountains sun={false} className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 w-full opacity-40" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-sand-300">السلام علیکم · {greeting()}</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">Stay informed, find help fast, and tell us when something goes wrong in your area.</p></div>
          <ol className="grid gap-2 text-sm sm:grid-cols-2">
            {[{ t: "Explore the map", to: "/map", done: false, i: MapIcon }, { t: "Run a risk assessment", to: "/risk", done: (d?.assessments.length ?? 0) > 0, i: Activity },
              { t: "Simulate a scenario", to: "/simulations", done: (sims.data?.length ?? 0) > 0, i: CloudRain }, { t: "Ask the assistant", to: "/assistant", done: false, i: Bot }].map((x) => (
              <li key={x.t}><Link href={x.to} className="flex items-center gap-2 rounded-lg border border-line bg-ink-900/70 px-3 py-2 text-slate-200 transition hover:border-cyan-400/50">
                {x.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-600" />}{x.t}<x.i className="ml-auto h-3.5 w-3.5 text-slate-500" /></Link></li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map(({ to, t, d, i: I, c }) => (
          <Link key={to} href={to} className={`group flex items-center gap-3 rounded-2xl bg-gradient-to-br p-4 ring-1 transition hover:-translate-y-0.5 hover:shadow-card ${c}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black/25"><I className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-white">{t}</span><span className="text-xs opacity-80">{d}</span></span>
            <ArrowRight className="ml-auto h-4 w-4 opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>
      <Link href="/report" className="hidden mb-3 items-center items-center gap-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100 transition hover:bg-cyan-400/15"><Megaphone className="h-4 w-4 shrink-0" /><span><b>See a flood, landslide or other crisis?</b> Report it with your live location and photos.</span><ArrowRight className="ml-auto h-4 w-4" /></Link>
      <Link href="/emergency" className="mb-5 flex items-center gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100 transition hover:bg-red-500/15"><Siren className="h-4 w-4 shrink-0" /><span><b>Emergency?</b> Call Police <b>15</b> (official source). See all helplines and hospital numbers.</span><ArrowRight className="ml-auto h-4 w-4" /></Link>
      {demo && <div className="mb-5"><Notice>Demo mode: boundaries are real open data; assessments and simulations below are only those you created in this browser. No live statistics are shown.</Notice></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {m.loading || !d ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />) : <>
          <StatCard label="Monitored districts" value={d.districts.length} hint={`${d.districts.filter((x) => x.has_boundary).length} with boundaries`} icon={<MapPinned className="h-5 w-5" />} />
          <StatCard label="Risk assessments" value={d.assessments.length} hint="latest per district colours the map" icon={<Activity className="h-5 w-5" />} accent="#fb923c" />
          <StatCard label="Simulations" value={sims.data?.length ?? "–"} hint="hypothetical scenarios" icon={<CloudRain className="h-5 w-5" />} accent="#2dd4bf" />
          <StatCard label="Emergency resources" value={d.resources.length} hint={`${d.resources.filter((r) => r.verified).length} verified`} icon={<Siren className="h-5 w-5" />} accent="#f87171" />
        </>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <CardHeader title="Balochistan map" subtitle={d?.origin === "open-data" ? "District boundaries: geoBoundaries open data (not yet verified by an administrator)" : "Boundaries from the platform database"} action={<Link href="/map" className="flex items-center gap-1 text-xs text-cyan-300 hover:underline">Open full map <ArrowRight className="h-3 w-3" /></Link>} />
          <div className="p-3">{d ? <MapView boundaries={d.boundaries} riskByName={m.riskByName} resources={d.resources} incidents={d.incidents} selectedName={sel} onSelect={setSel} height="460px" /> : <Skeleton className="h-[460px]" />}</div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Risk distribution" subtitle="Assessments by category" />
            {dist.length === 0 ? <EmptyState title="No assessments yet" text="Run a risk assessment to see the distribution." action={<Link href="/risk" className="text-xs text-cyan-300 hover:underline">Start an assessment</Link>} /> : (
              <div className="flex items-center gap-4 p-4">
                <div className="h-40 w-40"><Donut data={dist.map((e) => ({ ...e, color: RISK_COLORS[e.name] }))} /></div>
                <ul className="space-y-1.5 text-sm">{dist.map((e) => <li key={e.name} className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLORS[e.name] }} />{e.name}<b className="ml-auto pl-4 text-white">{e.value}</b></li>)}</ul>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Data status" />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-400">Latest verified dataset</span>{latestVerified ? <span className="text-right text-white">{latestVerified.name}<br /><span className="text-xs text-slate-500">{fmtDate(latestVerified.created_at)}</span></span> : <Badge tone="amber">None yet</Badge>}</div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Verified districts</span><b className="text-white">{d?.districts.filter((x) => x.verified).length ?? 0} / {d?.districts.length ?? 0}</b></div>
              <div className="flex items-start gap-2 rounded-lg bg-ink-900 p-3 text-xs text-slate-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />Unverified records are labelled everywhere. Administrators mark data as verified after checking its source.</div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Recent simulations" action={<Link href="/simulations" className="text-xs text-cyan-300 hover:underline">All</Link>} />
          {sims.loading ? <Skeleton className="m-5 h-24" /> : !sims.data?.length ? <EmptyState title="No simulations yet" text="Configure a hypothetical rainfall scenario." /> : (
            <ul className="divide-y divide-line/60">{sims.data.slice(0, 5).map((s) => <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm"><span><b className="text-white">#{s.id}</b> <span className="text-slate-300">{names.get(s.district_id) ?? `District ${s.district_id}`}</span><span className="block text-xs text-slate-500">{fmtDate(s.created_at)}</span></span><Badge tone={s.status === "completed" ? "green" : "red"}>{s.status}</Badge></li>)}</ul>
          )}
        </Card>
        <Card><CardHeader title="Recent activity: risk assessments" action={<Link href="/risk" className="text-xs text-cyan-300 hover:underline">All</Link>} />
          {!d?.assessments.length ? <EmptyState title="No assessments yet" /> : (
            <ul className="divide-y divide-line/60">{d.assessments.slice(0, 5).map((a) => <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm"><span><span className="text-slate-200">{names.get(a.district_id) ?? `District ${a.district_id}`}</span><span className="block text-xs text-slate-500">{fmtDate(a.created_at)}</span></span><span className="flex items-center gap-3"><b className="tabular-nums text-white">{a.score ?? "N/A"}</b><RiskBadge category={a.category} /></span></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
