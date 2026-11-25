"use client";
import Link from "next/link";
import { CheckCircle2, Circle, Database, MapPinned, Siren, Users, Activity, CloudRain } from "lucide-react";
import { ColorBars } from "@/components/charts";
import { Card, CardHeader, ErrorState, PageHeader, Skeleton, StatCard, Badge } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { admin } from "@/lib/services";
import { RISK_COLORS } from "@/lib/types";
import { TYPE_META } from "@/components/map/CrisisMap";

export default function AdminOverview() {
  const st = useAsync(() => admin.stats(), []);
  const logs = useAsync(() => admin.audit(8), []);
  if (st.error) return <ErrorState message={st.error} onRetry={st.reload} />;
  const s = st.data;
  const cat = Object.entries(s?.assessments_by_category ?? {}).map(([name, value]) => ({ name, value }));
  const typ = Object.entries(s?.resources_by_type ?? {}).map(([name, value]) => ({ name: TYPE_META[name]?.label ?? name, key: name, value }));
  const checks = s ? [
    { ok: s.districts > 0, t: "Districts created", to: "/admin/districts", d: `${s.districts} districts` },
    { ok: s.districts > 0 && s.districts_with_boundary === s.districts, t: "Every district has a boundary", to: "/admin/districts", d: `${s.districts_with_boundary}/${s.districts}` },
    { ok: s.districts > 0 && s.districts_verified === s.districts, t: "Districts verified", to: "/admin/districts", d: `${s.districts_verified}/${s.districts}` },
    { ok: s.resources > 0, t: "Emergency resources recorded", to: "/admin/resources", d: `${s.resources} records` },
    { ok: s.resources > 0 && s.resources_verified === s.resources, t: "Resources verified", to: "/admin/resources", d: `${s.resources_verified}/${s.resources}` },
    { ok: s.datasets > 0, t: "Datasets documented with sources", to: "/admin/datasets", d: `${s.datasets} datasets` },
  ] : [];
  return (
    <>
      <PageHeader title="Administration" subtitle="Platform health, data quality and activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {!s ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />) : <>
          <StatCard label="Users" value={s.users} hint={`${s.active_users} active · ${s.admins} admin`} icon={<Users className="h-5 w-5" />} />
          <StatCard label="Districts" value={s.districts} hint={`${s.districts_verified} verified`} icon={<MapPinned className="h-5 w-5" />} accent="#2dd4bf" />
          <StatCard label="Resources" value={s.resources} hint={`${s.resources_verified} verified`} icon={<Siren className="h-5 w-5" />} accent="#f87171" />
          <StatCard label="Datasets" value={s.datasets} hint={`${s.datasets_verified} verified`} icon={<Database className="h-5 w-5" />} accent="#a5b4fc" />
          <StatCard label="Assessments" value={s.assessments} icon={<Activity className="h-5 w-5" />} accent="#fb923c" />
          <StatCard label="Simulations" value={s.simulations} hint={s.simulations_failed ? `${s.simulations_failed} failed` : "none failed"} icon={<CloudRain className="h-5 w-5" />} accent="#22d3ee" />
        </>}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardHeader title="Data readiness checklist" subtitle="What to complete before a demo" />
          <ul className="divide-y divide-line/60">{checks.map((c) => <li key={c.t}><Link href={c.to} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-ink-800">{c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-600" />}<span className={c.ok ? "text-slate-200" : "text-slate-400"}>{c.t}</span><span className="ml-auto text-xs text-slate-500">{c.d}</span></Link></li>)}</ul></Card>
        <Card><CardHeader title="Assessments by category" />
          <div className="h-60 p-4">{cat.length ? <ColorBars data={cat.map((c) => ({ ...c, color: RISK_COLORS[c.name] }))} /> : <p className="grid h-full place-items-center text-sm text-slate-500">No assessments yet</p>}</div></Card>
        <Card><CardHeader title="Resources by type" />
          <div className="h-60 p-4">{typ.length ? <ColorBars data={typ.map((c) => ({ name: c.name, value: c.value, color: TYPE_META[c.key]?.color ?? "#a5b4fc" }))} /> : <p className="grid h-full place-items-center text-sm text-slate-500">No resources yet</p>}</div></Card>
      </div>
      <Card className="mt-6"><CardHeader title="Recent admin activity" action={<Link href="/admin/audit" className="text-xs text-cyan-300 hover:underline">All logs</Link>} />
        {!logs.data?.length ? <p className="p-5 text-sm text-slate-500">No activity recorded.</p> : <ul className="divide-y divide-line/60">{logs.data.map((l) => <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><Badge tone="cyan">{l.action}</Badge><span className="text-slate-300">{l.entity}{l.entity_id ? ` #${l.entity_id}` : ""}</span><span className="ml-auto text-xs text-slate-500">{fmtDate(l.created_at)}</span></li>)}</ul>}</Card>
    </>
  );
}
