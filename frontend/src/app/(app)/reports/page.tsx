"use client";
import { Activity, CloudRain, Download, FileSpreadsheet, MapPinned, Printer, Siren } from "lucide-react";
import { ColorBars } from "@/components/charts";
import { TYPE_META } from "@/components/map/typeMeta";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Notice, PageHeader, RiskBadge, Skeleton, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { districts, reports, risk, simulations } from "@/lib/services";
import { INCIDENT_TYPES, RISK_COLORS, STATUS_LABEL, type IncidentStatus } from "@/lib/types";

export default function ReportsPage() {
  const { demo, user } = useAuth();
  const toast = useToast();
  const ov = useAsync(() => (demo ? Promise.resolve(null) : reports.overview()), [demo]);
  const an = useAsync(() => (demo ? Promise.resolve(null) : reports.analytics().catch(() => null)), [demo, user?.role]);
  const rk = useAsync(
    async () => {
      const a = await risk.list();
      const c: Record<string, number> = {};
      a.forEach((x) => (c[x.category] = (c[x.category] ?? 0) + 1));
      return { total: a.length, by: c, rows: a };
    },
    []
  );
  const sims = useAsync(() => simulations.list(), [], "sims");
  const ds = useAsync(() => districts.list(), [], "districts");
  const names = new Map((ds.data ?? []).map((d) => [d.id, d.name]));
  const chart = Object.entries(rk.data?.by ?? {}).map(([name, value]) => ({ name, value }));

  async function downloadBlob(loader: () => Promise<Blob>, filename: string, okMsg: string) {
    try {
      const b = await loader();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("ok", okMsg);
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }

  if (rk.error) return <ErrorState message={rk.error} onRetry={rk.reload} />;
  const a = an.data;
  const isAdmin = user?.role === "admin";

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        subtitle="Incident breakdowns, verification metrics, resource coverage, risk assessments and downloadable CSV/PDF reports."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {!demo && (
              <Button variant="outline" size="sm" onClick={() => downloadBlob(() => simulations.csv(), "simulations.csv", "Simulations CSV downloaded")}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Simulations CSV
              </Button>
            )}
            {!demo && isAdmin && (
              <Button variant="outline" size="sm" onClick={() => downloadBlob(() => reports.incidentsCsv(), "incidents.csv", "Incidents CSV downloaded")}>
                <Download className="h-3.5 w-3.5" /> Incidents CSV
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print summary
            </Button>
          </div>
        }
      />
      {demo && (
        <div className="mb-4">
          <Notice>Demo mode: summaries cover only what you created in this browser. Server analytics and PDF/CSV exports require the backend.</Notice>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Districts" value={ov.data?.districts ?? ds.data?.length ?? "–"} icon={<MapPinned className="h-5 w-5" />} />
        <StatCard label="Assessments" value={ov.data?.risk_assessments ?? rk.data?.total ?? "–"} icon={<Activity className="h-5 w-5" />} accent="#fb923c" />
        <StatCard label="Simulations" value={ov.data?.simulations ?? sims.data?.length ?? "–"} icon={<CloudRain className="h-5 w-5" />} accent="#2dd4bf" />
        <StatCard label="Resources" value={ov.data ? `${ov.data.verified_resources}/${ov.data.emergency_resources}` : "–"} hint="verified / total" icon={<Siren className="h-5 w-5" />} accent="#f87171" />
      </div>
      {ov.data && <p className="mt-2 text-xs text-slate-500">{ov.data.data_note}</p>}

      {a && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Incidents by district" subtitle={`${a.incidents_total} visible report(s) in database`} />
            <div className="h-64 p-4">
              {a.incidents_by_district.length ? (
                <ColorBars data={a.incidents_by_district.slice(0, 8).map((x) => ({ name: x.name, value: x.value, color: "#22d3ee" }))} />
              ) : (
                <EmptyState title="No incidents recorded yet" />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Incidents by disaster category" />
            <div className="h-64 p-4">
              {a.incidents_by_category.length ? (
                <ColorBars
                  data={a.incidents_by_category.slice(0, 8).map((x) => ({
                    name: INCIDENT_TYPES.find((t) => t.value === x.name)?.label ?? x.name,
                    value: x.value,
                    color: "#fb923c",
                  }))}
                />
              ) : (
                <EmptyState title="No categorized incidents yet" />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Monthly incident trends" subtitle="Submitted vs verified per month" />
            {a.monthly_incident_trends.length === 0 ? (
              <EmptyState title="No monthly trend data yet" />
            ) : (
              <div className="p-5">
                <div className="h-44">
                  <ColorBars data={a.monthly_incident_trends.map((m) => ({ name: m.month, value: m.submitted, color: "#2dd4bf" }))} />
                </div>
                <ul className="mt-3 divide-y divide-line/60 text-xs">
                  {a.monthly_incident_trends.map((m) => (
                    <li key={m.month} className="flex items-center justify-between py-1.5 text-slate-300">
                      <span className="font-mono">{m.month}</span>
                      <span>
                        {m.submitted} submitted · <b className="text-emerald-300">{m.verified} verified/resolved</b>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Verification & resource distribution" subtitle={`Alerts: ${a.alerts_summary.published} published, ${a.alerts_summary.draft} draft, ${a.alerts_summary.expired} expired`} />
            <div className="space-y-4 p-5 text-sm">
              <div className="flex flex-wrap gap-2">
                {Object.entries(a.incidents_by_status).map(([st, cnt]) => (
                  <Badge key={st} tone={st === "verified" || st === "resolved" ? "green" : st === "rejected" ? "red" : "amber"}>
                    {STATUS_LABEL[st as IncidentStatus] ?? st}: {cnt}
                  </Badge>
                ))}
              </div>
              {a.resources_by_type.length === 0 ? (
                <p className="text-xs text-slate-500">No emergency resources recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line/60 text-xs">
                  {a.resources_by_type.map((r) => (
                    <li key={r.name} className="flex items-center justify-between py-2 text-slate-300">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_META[r.name]?.color ?? "#a5b4fc" }} />
                        {TYPE_META[r.name]?.label ?? r.name}
                      </span>
                      <span>
                        <b className="text-white">{r.value}</b> total · <span className="text-emerald-300">{r.verified} verified</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Risk assessment report" subtitle="Assessments by category" />
          {rk.loading ? (
            <Skeleton className="m-5 h-52" />
          ) : chart.length === 0 ? (
            <EmptyState title="No assessments to report" />
          ) : (
            <div className="h-64 p-4">
              <ColorBars data={chart.map((c) => ({ ...c, color: RISK_COLORS[c.name] }))} />
            </div>
          )}
          <p className="border-t border-line px-5 py-3 text-xs text-slate-500">Indicator heuristic scores. Not verified flood inundation predictions.</p>
        </Card>
        <Card>
          <CardHeader title="Latest assessments" />
          {!rk.data?.rows.length ? (
            <EmptyState title="Nothing yet" />
          ) : (
            <ul className="divide-y divide-line/60">
              {rk.data.rows.slice(0, 6).map((x) => (
                <li key={x.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-slate-200">
                    {names.get(x.district_id)}
                    <span className="block text-xs text-slate-500">{fmtDate(x.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <b className="tabular-nums text-white">{x.score ?? "N/A"}</b>
                    <RiskBadge category={x.category} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Simulation reports" subtitle="Download a PDF with parameters, indicators, assumptions and limitations" />
        {sims.loading ? (
          <Skeleton className="m-5 h-24" />
        ) : !sims.data?.length ? (
          <EmptyState title="No simulations to report" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2">#</th>
                  <th>District</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {sims.data.map((s) => (
                  <tr key={s.id} className="text-slate-300">
                    <td className="px-5 py-2.5 text-white">{s.id}</td>
                    <td>{names.get(s.district_id)}</td>
                    <td>
                      <Badge tone={s.status === "completed" ? "green" : "red"}>{s.status}</Badge>
                    </td>
                    <td className="text-xs text-slate-500">{fmtDate(s.created_at)}</td>
                    <td className="pr-5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={demo || s.status !== "completed"}
                        onClick={() => downloadBlob(() => simulations.pdf(s.id), `simulation-${s.id}.pdf`, "PDF downloaded")}
                        title={demo ? "Requires the backend" : ""}
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
