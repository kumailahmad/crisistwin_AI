"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Skeleton, useToast } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { districts, simulations } from "@/lib/services";

export default function AdminScenarios() {
  const toast = useToast();
  const sims = useAsync(() => simulations.list(), []);
  const ds = useAsync(() => districts.list(), []);
  const [status, setStatus] = useState(""); const [district, setDistrict] = useState("");
  const dn = new Map((ds.data ?? []).map((d) => [d.id, d.name]));
  const list = useMemo(() => (sims.data ?? []).filter((s) => (!status || s.status === status) && (!district || String(s.district_id) === district)), [sims.data, status, district]);
  async function pdf(id: number) { try { const b = await simulations.pdf(id); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `simulation-${id}.pdf`; a.click(); URL.revokeObjectURL(a.href); } catch (e) { toast("err", (e as Error).message); } }
  if (sims.error) return <ErrorState message={sims.error} onRetry={sims.reload} />;
  return (
    <>
      <PageHeader title="Scenario management" subtitle="All simulations run by every user. Monitor failures and download reports." />
      <div className="mb-4 flex gap-2"><Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option>completed</option><option>failed</option><option>running</option></Select>
        <Select className="w-52" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District"><option value="">All districts</option>{(ds.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
      <Card>
        {sims.loading ? <Skeleton className="m-5 h-32" /> : !list.length ? <EmptyState title="No scenarios found" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">#</th><th>District</th><th>Intensity</th><th>Duration</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody className="divide-y divide-line/60">{list.map((s) => <tr key={s.id} className="text-slate-300 hover:bg-ink-800/50"><td className="px-5 py-3 text-white">{s.id}</td><td>{dn.get(s.district_id)}</td><td>{String(s.params.rainfall_intensity_mm_h)} mm/h</td><td>{String(s.params.duration_h)} h</td><td><Badge tone={s.status === "completed" ? "green" : s.status === "failed" ? "red" : "amber"}>{s.status}</Badge></td><td className="text-xs text-slate-500">{fmtDate(s.created_at)}</td>
              <td className="pr-5 text-right"><Button size="sm" variant="outline" disabled={s.status !== "completed"} onClick={() => pdf(s.id)}><Download className="h-3.5 w-3.5" />PDF</Button></td></tr>)}</tbody></table></div>
        )}
      </Card>
    </>
  );
}
