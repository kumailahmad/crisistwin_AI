"use client";
import { Download, Printer } from "lucide-react";
import { ColorBars } from "@/components/charts";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Notice, PageHeader, RiskBadge, Skeleton, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { districts, reports, risk, simulations } from "@/lib/services";
import { RISK_COLORS } from "@/lib/types";
import { Activity, CloudRain, MapPinned, Siren } from "lucide-react";

export default function ReportsPage() {
  const { demo } = useAuth(); const toast = useToast();
  const ov = useAsync(() => (demo ? Promise.resolve(null) : reports.overview()), [demo]);
  const rk = useAsync(async () => { const a = await risk.list(); const c: Record<string, number> = {}; a.forEach((x) => (c[x.category] = (c[x.category] ?? 0) + 1)); return { total: a.length, by: c, rows: a }; }, []);
  const sims = useAsync(() => simulations.list(), [], "sims");
  const ds = useAsync(() => districts.list(), [], "districts");
  const names = new Map((ds.data ?? []).map((d) => [d.id, d.name]));
  const chart = Object.entries(rk.data?.by ?? {}).map(([name, value]) => ({ name, value }));

  async function pdf(id: number) {
    try { const b = await simulations.pdf(id); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `simulation-${id}.pdf`; a.click(); URL.revokeObjectURL(a.href); toast("ok", "PDF downloaded"); }
    catch (e) { toast("err", (e as Error).message); }
  }
  if (rk.error) return <ErrorState message={rk.error} onRetry={rk.reload} />;
  return (
    <>
      <PageHeader title="Reports" subtitle="Risk assessment summaries and downloadable simulation reports with assumptions and disclaimers." actions={<Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" />Print summary</Button>} />
      {demo && <div className="mb-4"><Notice>Demo mode: summaries cover only what you created in this browser. PDF export requires the backend.</Notice></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Districts" value={ov.data?.districts ?? ds.data?.length ?? "–"} icon={<MapPinned className="h-5 w-5" />} />
        <StatCard label="Assessments" value={ov.data?.risk_assessments ?? rk.data?.total ?? "–"} icon={<Activity className="h-5 w-5" />} accent="#fb923c" />
        <StatCard label="Simulations" value={ov.data?.simulations ?? sims.data?.length ?? "–"} icon={<CloudRain className="h-5 w-5" />} accent="#2dd4bf" />
        <StatCard label="Resources" value={ov.data ? `${ov.data.verified_resources}/${ov.data.emergency_resources}` : "–"} hint="verified / total" icon={<Siren className="h-5 w-5" />} accent="#f87171" />
      </div>
      {ov.data && <p className="mt-2 text-xs text-slate-500">{ov.data.data_note}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Risk assessment report" subtitle="Assessments by category" />
          {rk.loading ? <Skeleton className="m-5 h-52" /> : chart.length === 0 ? <EmptyState title="No assessments to report" /> : (
            <div className="h-64 p-4"><ColorBars data={chart.map((c) => ({ ...c, color: RISK_COLORS[c.name] }))} /></div>
          )}
          <p className="border-t border-line px-5 py-3 text-xs text-slate-500">Prototype heuristic scores. Not verified flood predictions.</p></Card>
        <Card><CardHeader title="Latest assessments" />
          {!rk.data?.rows.length ? <EmptyState title="Nothing yet" /> : <ul className="divide-y divide-line/60">{rk.data.rows.slice(0, 6).map((a) => <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm"><span className="text-slate-200">{names.get(a.district_id)}<span className="block text-xs text-slate-500">{fmtDate(a.created_at)}</span></span><span className="flex items-center gap-3"><b className="tabular-nums text-white">{a.score ?? "N/A"}</b><RiskBadge category={a.category} /></span></li>)}</ul>}</Card>
      </div>
      <Card className="mt-6"><CardHeader title="Simulation reports" subtitle="Download a PDF with parameters, indicators, assumptions and limitations" />
        {sims.loading ? <Skeleton className="m-5 h-24" /> : !sims.data?.length ? <EmptyState title="No simulations to report" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-2">#</th><th>District</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody className="divide-y divide-line/60">{sims.data.map((s) => <tr key={s.id} className="text-slate-300"><td className="px-5 py-2.5 text-white">{s.id}</td><td>{names.get(s.district_id)}</td><td><Badge tone={s.status === "completed" ? "green" : "red"}>{s.status}</Badge></td><td className="text-xs text-slate-500">{fmtDate(s.created_at)}</td>
              <td className="pr-5 text-right"><Button size="sm" variant="outline" disabled={demo || s.status !== "completed"} onClick={() => pdf(s.id)} title={demo ? "Requires the backend" : ""}><Download className="h-3.5 w-3.5" />PDF</Button></td></tr>)}</tbody></table></div>
        )}</Card>
    </>
  );
}
