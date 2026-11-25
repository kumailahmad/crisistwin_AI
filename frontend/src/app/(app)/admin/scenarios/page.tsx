"use client";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, GitCompare } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, PageHeader, Select, Skeleton, useToast } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { districts, simulations } from "@/lib/services";
import type { Simulation } from "@/lib/types";
import { compareSimulations } from "@/lib/utils/analytics";

export default function AdminScenarios() {
  const toast = useToast();
  const sims = useAsync(() => simulations.list(), []);
  const ds = useAsync(() => districts.list(), []);
  const [status, setStatus] = useState("");
  const [district, setDistrict] = useState("");
  const [cmpLeft, setCmpLeft] = useState("");
  const [cmpRight, setCmpRight] = useState("");
  const [loadedMap, setLoadedMap] = useState<Record<number, Simulation>>({});

  const dn = new Map((ds.data ?? []).map((d) => [d.id, d.name]));
  const list = useMemo(() => (sims.data ?? []).filter((s) => (!status || s.status === status) && (!district || String(s.district_id) === district)), [sims.data, status, district]);
  const completed = useMemo(() => (sims.data ?? []).filter((s) => s.status === "completed"), [sims.data]);

  async function selectForCompare(side: "left" | "right", idStr: string) {
    if (side === "left") setCmpLeft(idStr);
    else setCmpRight(idStr);
    const id = Number(idStr);
    if (!id) return;
    const base = (sims.data ?? []).find((x) => x.id === id);
    if (base && !base.results && !loadedMap[id]) {
      try {
        const r = await simulations.results(id);
        setLoadedMap((m) => ({ ...m, [id]: { ...base, ...r } }));
      } catch {
        /* fallback */
      }
    }
  }

  async function pdf(id: number) {
    try {
      const b = await simulations.pdf(id);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `simulation-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }

  async function csv() {
    try {
      const b = await simulations.csv();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "simulations.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("ok", "Simulations CSV exported");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }

  const leftSim = cmpLeft ? loadedMap[Number(cmpLeft)] ?? completed.find((s) => s.id === Number(cmpLeft)) : undefined;
  const rightSim = cmpRight ? loadedMap[Number(cmpRight)] ?? completed.find((s) => s.id === Number(cmpRight)) : undefined;
  const cmp = leftSim && rightSim ? compareSimulations(leftSim, rightSim) : null;

  if (sims.error) return <ErrorState message={sims.error} onRetry={sims.reload} />;

  return (
    <>
      <PageHeader
        title="Simulation management"
        subtitle="Review scenario parameters across all users, compare completed runs side-by-side, and export CSV or PDF reports."
        actions={
          <Button variant="outline" size="sm" onClick={csv} disabled={!sims.data?.length}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      {completed.length >= 2 && (
        <Card className="mb-5">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-cyan-300" /> Compare scenarios
              </span>
            }
          />
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Scenario A">
                <Select value={cmpLeft} onChange={(e) => selectForCompare("left", e.target.value)}>
                  <option value="">Choose scenario A</option>
                  {completed.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.id} · {dn.get(s.district_id) ?? `District ${s.district_id}`} ({String(s.params.rainfall_intensity_mm_h)} mm/h × {String(s.params.duration_h)} h)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Scenario B">
                <Select value={cmpRight} onChange={(e) => selectForCompare("right", e.target.value)}>
                  <option value="">Choose scenario B</option>
                  {completed.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.id} · {dn.get(s.district_id) ?? `District ${s.district_id}`} ({String(s.params.rainfall_intensity_mm_h)} mm/h × {String(s.params.duration_h)} h)
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {cmp && leftSim && rightSim && (
              <div className="grid gap-4 rounded-xl border border-line bg-ink-900 p-4 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-slate-500">Scenario A (#{leftSim.id})</p>
                  <p className="text-sm font-semibold text-white">{dn.get(leftSim.district_id)}</p>
                  <p className="text-slate-400">
                    Total: {leftSim.results?.total_rainfall_mm ?? "—"} mm · Score: {leftSim.results?.risk_indicators.score ?? "N/A"} ({leftSim.results?.risk_indicators.category ?? "—"})
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Scenario B (#{rightSim.id})</p>
                  <p className="text-sm font-semibold text-white">{dn.get(rightSim.district_id)}</p>
                  <p className="text-slate-400">
                    Total: {rightSim.results?.total_rainfall_mm ?? "—"} mm · Score: {rightSim.results?.risk_indicators.score ?? "N/A"} ({rightSim.results?.risk_indicators.category ?? "—"})
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Difference (B − A)</p>
                  <p className="text-slate-300">
                    Rainfall: <b className="text-white">{cmp.totalRainfallDiffMm !== null ? `${cmp.totalRainfallDiffMm >= 0 ? "+" : ""}${cmp.totalRainfallDiffMm} mm` : "—"}</b>
                  </p>
                  <p className="text-slate-300">
                    Score: <b className="text-white">{cmp.scoreDiff !== null ? `${cmp.scoreDiff >= 0 ? "+" : ""}${cmp.scoreDiff}` : "—"}</b>
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="mb-4 flex gap-2">
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option>completed</option>
          <option>failed</option>
          <option>running</option>
        </Select>
        <Select className="w-52" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
          <option value="">All districts</option>
          {(ds.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        {sims.loading ? (
          <Skeleton className="m-5 h-32" />
        ) : !list.length ? (
          <EmptyState title="No scenarios found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th>District</th>
                  <th>Intensity</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {list.map((s) => (
                  <tr key={s.id} className="text-slate-300 hover:bg-ink-800/50">
                    <td className="px-5 py-3 text-white">{s.id}</td>
                    <td>{dn.get(s.district_id)}</td>
                    <td>{String(s.params.rainfall_intensity_mm_h)} mm/h</td>
                    <td>{String(s.params.duration_h)} h</td>
                    <td>
                      <Badge tone={s.status === "completed" ? "green" : s.status === "failed" ? "red" : "amber"}>{s.status}</Badge>
                    </td>
                    <td className="text-xs text-slate-500">{fmtDate(s.created_at)}</td>
                    <td className="pr-5 text-right">
                      <Button size="sm" variant="outline" disabled={s.status !== "completed"} onClick={() => pdf(s.id)}>
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
