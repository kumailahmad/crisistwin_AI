"use client";
import Link from "next/link";
import { Activity, AlertTriangle, Bot, CheckCircle2, Circle, CloudRain, Database, MapPinned, Megaphone, ShieldAlert, Siren, Users } from "lucide-react";
import { ColorBars } from "@/components/charts";
import { TYPE_META } from "@/components/map/typeMeta";
import { Badge, Card, CardHeader, ErrorState, PageHeader, Skeleton, StatCard } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { admin } from "@/lib/services";
import { RISK_COLORS } from "@/lib/types";

export default function AdminOverview() {
  const st = useAsync(() => admin.stats(), []);
  const logs = useAsync(() => admin.audit(8), []);
  const usersQ = useAsync(() => admin.users().catch(() => []), []);
  if (st.error) return <ErrorState message={st.error} onRetry={st.reload} />;
  const s = st.data;
  const cat = Object.entries(s?.assessments_by_category ?? {}).map(([name, value]) => ({ name, value }));
  const typ = Object.entries(s?.resources_by_type ?? {}).map(([name, value]) => ({ name: TYPE_META[name]?.label ?? name, key: name, value }));
  const recentUsers = (usersQ.data ?? []).slice(0, 6);
  const checks = s
    ? [
        { ok: Boolean(s.database_connected), t: "Supabase / PostgreSQL connected", to: "/admin/settings", d: s.database_connected ? (s.database_provider ?? "Connected") : "Temporary /tmp only" },
        { ok: s.districts > 0, t: "Districts created", to: "/admin/districts", d: `${s.districts} district${s.districts === 1 ? "" : "s"}` },
        { ok: s.districts > 0 && s.districts_with_boundary === s.districts, t: "Every district has a boundary", to: "/admin/districts", d: `${s.districts_with_boundary}/${s.districts}` },
        { ok: s.districts > 0 && s.districts_verified === s.districts, t: "Districts verified", to: "/admin/districts", d: `${s.districts_verified}/${s.districts}` },
        { ok: s.resources > 0, t: "Emergency resources recorded", to: "/admin/resources", d: `${s.resources} record${s.resources === 1 ? "" : "s"}` },
        { ok: s.datasets > 0, t: "Datasets documented with sources", to: "/admin/datasets", d: `${s.datasets} dataset${s.datasets === 1 ? "" : "s"}` },
      ]
    : [];

  return (
    <>
      <PageHeader title="Command center" subtitle="Real-time database statistics across user accounts, incidents, alerts, emergency resources, AI usage, and risk models." />

      {s && (
        <div
          className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
            s.database_connected
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {s.database_connected ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">
                {s.database_connected
                  ? `${s.database_provider ?? "Database"} connected — new accounts and reports persist live.`
                  : "Supabase / PostgreSQL database is not connected yet (running on temporary storage)."}
              </p>
              {!s.database_connected && (
                <p className="mt-0.5 text-xs text-amber-100/80">
                  {s.database_error
                    ? `Connection error: ${s.database_error}`
                    : "Add DATABASE_URL (Supabase Transaction Pooler URI) in environment Secrets so accounts persist across restarts and sync to your Supabase tables."}
                </p>
              )}
            </div>
          </div>
          <Link href="/admin/settings" className="shrink-0 text-xs font-semibold text-cyan-300 hover:underline">
            Database settings →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        {!s ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />)
        ) : (
          <>
            <StatCard label="Registered users" value={s.users} hint={`${s.active_users} active · ${s.admins} admin`} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Reported incidents" value={s.incidents_total} hint={`${s.incidents_pending} pending · ${s.incidents_verified} verified`} icon={<Megaphone className="h-5 w-5" />} accent="#fb923c" />
            <StatCard label="Active public alerts" value={s.alerts_active} hint="published & non-expired" icon={<ShieldAlert className="h-5 w-5" />} accent="#ef4444" />
            <StatCard label="Emergency resources" value={s.resources} hint={`${s.resources_verified} verified`} icon={<Siren className="h-5 w-5" />} accent="#f87171" />
            <StatCard label="Districts monitored" value={s.districts} hint={`${s.districts_verified} verified · ${s.districts_with_boundary} boundaries`} icon={<MapPinned className="h-5 w-5" />} accent="#2dd4bf" />
            <StatCard label="Risk assessments" value={s.assessments} icon={<Activity className="h-5 w-5" />} accent="#fbbf24" />
            <StatCard label="Simulations run" value={s.simulations} hint={s.simulations_failed ? `${s.simulations_failed} failed` : "none failed"} icon={<CloudRain className="h-5 w-5" />} accent="#22d3ee" />
            <StatCard label="AI assistant requests" value={s.ai_requests_total} hint={s.ai_errors_total ? `${s.ai_errors_total} error(s)` : "0 errors"} icon={<Bot className="h-5 w-5" />} accent="#a5b4fc" />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Data verification status" subtitle={`${s?.datasets ?? 0} dataset(s) · ${s?.datasets_verified ?? 0} verified`} />
          <ul className="divide-y divide-line/60">
            {checks.map((c) => (
              <li key={c.t}>
                <Link href={c.to} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-ink-800">
                  {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-600" />}
                  <span className={c.ok ? "text-slate-200" : "text-slate-400"}>{c.t}</span>
                  <span className="ml-auto text-xs text-slate-500">{c.d}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Risk assessments by category" />
          <div className="h-60 p-4">
            {cat.length ? (
              <ColorBars data={cat.map((c) => ({ ...c, color: RISK_COLORS[c.name] }))} />
            ) : (
              <p className="grid h-full place-items-center text-sm text-slate-500">No assessments yet</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Resources by category" />
          <div className="h-60 p-4">
            {typ.length ? (
              <ColorBars data={typ.map((c) => ({ name: c.name, value: c.value, color: TYPE_META[c.key]?.color ?? "#a5b4fc" }))} />
            ) : (
              <p className="grid h-full place-items-center text-sm text-slate-500">No resources yet</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent registered accounts"
            subtitle="Citizens and staff created in the database"
            action={
              <Link href="/admin/users" className="text-xs text-cyan-300 hover:underline">
                Manage users →
              </Link>
            }
          />
          {!recentUsers.length ? (
            <p className="p-5 text-sm text-slate-500">No user accounts registered yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{u.full_name || u.email}</p>
                    <p className="truncate text-xs text-slate-400">{u.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={u.role === "admin" ? "cyan" : "neutral"}>{u.role}</Badge>
                    <span className="text-xs text-slate-500">{u.created_at ? fmtDate(u.created_at) : "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent activities"
            action={
              <div className="flex gap-3 text-xs">
                <Link href="/admin/datasets" className="text-cyan-300 hover:underline">
                  <Database className="mr-1 inline h-3.5 w-3.5" /> Datasets
                </Link>
                <Link href="/admin/audit" className="text-cyan-300 hover:underline">
                  All logs
                </Link>
              </div>
            }
          />
          {!logs.data?.length ? (
            <p className="p-5 text-sm text-slate-500">No activity recorded.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {logs.data.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Badge tone="cyan">{l.action}</Badge>
                  <span className="text-slate-300">
                    {l.entity}
                    {l.entity_id ? ` #${l.entity_id}` : ""}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">{fmtDate(l.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
