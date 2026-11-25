"use client";
import { useState } from "react";
import { Activity } from "lucide-react";
import { DistrictSelect } from "@/components/DistrictSelect";
import { RiskResultPanel } from "@/components/risk/RiskResult";
import { CoverageMeter, FACTORS, FactorInputs, coverage, emptyFactors, toPayload, validateFactor } from "@/components/risk/FactorInputs";
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Notice, PageHeader, RiskBadge, Skeleton, useToast } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { districts, risk } from "@/lib/services";
import type { RiskAssessment } from "@/lib/types";

export default function RiskPage() {
  const toast = useToast();
  const ds = useAsync(() => districts.list(), [], "districts");
  const hist = useAsync(() => risk.list(), [], "assessments");
  const [district, setDistrict] = useState<number | "">("");
  const [f, setF] = useState(emptyFactors());
  const [durationH, setDurationH] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RiskAssessment | null>(null);
  const names = new Map((ds.data ?? []).map((d) => [d.id, d.name]));
  const durErr = durationH !== "" && !(Number(durationH) > 0 && Number(durationH) <= 720) ? "Must be between 1 and 720 hours" : undefined;
  const invalid = Boolean(durErr) || FACTORS.some((x) => validateFactor(x, f[x.key].value));
  const filled = FACTORS.filter((x) => f[x.key].value !== "").length;

  async function run() {
    if (district === "" || invalid) return;
    setBusy(true);
    try {
      const { values, status } = toPayload(f);
      const r = await risk.assess({
        district_id: district,
        ...values,
        duration_h: durationH ? Number(durationH) : null,
        input_status: status,
      });
      setRes(r);
      hist.reload();
      toast(
        r.score === null ? "err" : "ok",
        r.score === null ? "Not enough data to produce a score (need ≥ 50% of factor weight)." : `Assessment saved: ${r.category}`
      );
    } catch (e) {
      toast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (ds.error) return <ErrorState message={ds.error} onRetry={ds.reload} />;
  return (
    <>
      <PageHeader title="Risk assessment" subtitle="A transparent weighted score from rainfall, terrain, flood history and exposure. Missing inputs are excluded and reported." />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Inputs" subtitle={`${filled} of 5 factors provided`} />
          <div className="space-y-5 p-5">
            <Field label="District">{ds.loading ? <Skeleton className="h-10" /> : <DistrictSelect districts={ds.data ?? []} value={district} onChange={setDistrict} />}</Field>
            <CoverageMeter value={coverage(f)} />
            <FactorInputs defs={FACTORS} state={f} onChange={setF} />
            <Field
              label="Rainfall duration (hours, optional)"
              hint="If over 24 h, prolonged storm saturation notes are included."
              error={durErr}
            >
              <Input type="number" min={1} max={720} value={durationH} onChange={(e) => setDurationH(e.target.value)} placeholder="e.g. 24 or 48" />
            </Field>
            <Button onClick={run} loading={busy} disabled={district === "" || invalid || filled === 0} className="w-full">
              <Activity className="h-4 w-4" />
              Calculate risk
            </Button>
            <Notice tone="cyan">Tag each value as measured, estimated or assumed. At least 50% of the factor weight must be provided to produce a score.</Notice>
          </div>
        </Card>
        <div className="space-y-6">
          {res ? (
            <RiskResultPanel r={res.result} title={`Result · ${names.get(res.district_id) ?? ""}`} meta={`Saved ${fmtDate(res.created_at)}`} />
          ) : (
            <Card>
              <EmptyState
                icon={<Activity className="h-5 w-5" />}
                title="No result yet"
                text="Choose a district, enter what you know and calculate. The explanation, factor breakdown and data sources appear here."
              />
            </Card>
          )}
          <Card>
            <CardHeader title="Assessment history" />
            {hist.loading ? (
              <Skeleton className="m-5 h-20" />
            ) : !hist.data?.length ? (
              <EmptyState title="No saved assessments" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-2">#</th>
                      <th>District</th>
                      <th>Score</th>
                      <th>Category</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {hist.data.slice(0, 15).map((a) => (
                      <tr key={a.id} className="text-slate-300">
                        <td className="px-5 py-2.5 text-white">{a.id}</td>
                        <td>{names.get(a.district_id)}</td>
                        <td className="tabular-nums">{a.score ?? "N/A"}</td>
                        <td>
                          <RiskBadge category={a.category} />
                        </td>
                        <td className="text-xs text-slate-500">{fmtDate(a.created_at)}</td>
                        <td className="pr-5 text-right">
                          <button
                            className="text-xs text-cyan-300 hover:underline"
                            onClick={() => {
                              setRes(a);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
