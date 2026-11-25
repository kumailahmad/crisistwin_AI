"use client";
import { useMemo, useState } from "react";
import { CloudRain, Download, GitCompare } from "lucide-react";
import { DistrictSelect } from "@/components/DistrictSelect";
import { MapView } from "@/components/map/MapView";
import { RiskResultPanel } from "@/components/risk/RiskResult";
import { CoverageMeter, FACTORS, FactorInputs, coverage, emptyFactors, toPayload, validateFactor } from "@/components/risk/FactorInputs";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Notice, PageHeader, RiskBadge, Select, Skeleton, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { districts, simulations } from "@/lib/services";
import type { Simulation } from "@/lib/types";
import { compareSimulations } from "@/lib/utils/analytics";

const TERRAIN = FACTORS.filter((f) => f.key !== "rainfall_mm_24h");

export default function SimulationsPage() {
  const toast = useToast();
  const { demo } = useAuth();
  const ds = useAsync(() => districts.list(), [], "districts");
  const hist = useAsync(() => simulations.list(), [], "sims");
  const [district, setDistrict] = useState<number | "">("");
  const [intensity, setIntensity] = useState("25");
  const [duration, setDuration] = useState("12");
  const [f, setF] = useState(emptyFactors());
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState<Simulation | null>(null);
  const [cmpLeft, setCmpLeft] = useState<string>("");
  const [cmpRight, setCmpRight] = useState<string>("");
  const [loadedMap, setLoadedMap] = useState<Record<number, Simulation>>({});
  const names = new Map((ds.data ?? []).map((d) => [d.id, d.name]));

  const iErr = !(Number(intensity) > 0 && Number(intensity) <= 300) ? "Between 0 and 300 mm/h" : undefined;
  const dErr = !(Number(duration) > 0 && Number(duration) <= 168) ? "Between 0 and 168 h" : undefined;
  const invalid = Boolean(iErr || dErr) || TERRAIN.some((x) => validateFactor(x, f[x.key].value));

  async function run() {
    if (district === "" || invalid) return;
    setBusy(true);
    try {
      const { values, status } = toPayload(f);
      const s = await simulations.create({
        district_id: district,
        rainfall_intensity_mm_h: Number(intensity),
        duration_h: Number(duration),
        elevation_m: values.elevation_m,
        slope_deg: values.slope_deg,
        flood_history_index: values.flood_history_index,
        exposure_index: values.exposure_index,
        input_status: status,
      });
      setCur(s);
      setLoadedMap((m) => ({ ...m, [s.id]: s }));
      hist.reload();
      toast(s.status === "completed" ? "ok" : "err", s.status === "completed" ? "Scenario completed" : "Scenario failed");
    } catch (e) {
      toast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function open(s: Simulation) {
    try {
      const full = s.results ? s : await simulations.results(s.id).then((r) => ({ ...s, ...r, created_at: s.created_at }));
      setCur(full);
      setLoadedMap((m) => ({ ...m, [full.id]: full }));
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }

  async function selectForCompare(side: "left" | "right", idStr: string) {
    if (side === "left") setCmpLeft(idStr);
    else setCmpRight(idStr);
    const id = Number(idStr);
    if (!id) return;
    const base = (hist.data ?? []).find((x) => x.id === id);
    if (base && !base.results && !loadedMap[id]) {
      try {
        const res = await simulations.results(id);
        setLoadedMap((m) => ({ ...m, [id]: { ...base, ...res } }));
      } catch {
        /* handled cleanly by incomplete state */
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

  async function exportCsv() {
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

  const completed = useMemo(() => (hist.data ?? []).filter((s) => s.status === "completed"), [hist.data]);
  const leftSim = cmpLeft ? loadedMap[Number(cmpLeft)] ?? completed.find((s) => s.id === Number(cmpLeft)) : undefined;
  const rightSim = cmpRight ? loadedMap[Number(cmpRight)] ?? completed.find((s) => s.id === Number(cmpRight)) : undefined;
  const cmp = leftSim && rightSim ? compareSimulations(leftSim, rightSim) : null;

  const res = cur?.results ?? null;
  const vizFc = useMemo(() => {
    if (!res?.visualization) return null;
    const name = names.get(cur!.district_id) ?? "Scenario";
    return { type: "FeatureCollection" as const, features: [{ ...res.visualization, properties: { district_id: cur!.district_id, name, source: "scenario", verified: false } }] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, cur]);

  if (ds.error) return <ErrorState message={ds.error} onRetry={ds.reload} />;
  return (
    <>
      <PageHeader
        title="Disaster simulation"
        subtitle="Configure a hypothetical rainfall scenario. Results are indicator-based and are not a physical flood-inundation model."
        actions={
          !demo &&
          completed.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          )
        }
      />
      <div className="mb-5">
        <Notice>Hypothetical scenario tool. Outputs must not be used for evacuation or operational decisions.</Notice>
      </div>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Scenario setup" />
          <div className="space-y-5 p-5">
            <Field label="District">{ds.loading ? <Skeleton className="h-10" /> : <DistrictSelect districts={ds.data ?? []} value={district} onChange={setDistrict} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rainfall intensity (mm/h)" error={iErr}>
                <Input type="number" min={1} max={300} value={intensity} onChange={(e) => setIntensity(e.target.value)} />
              </Field>
              <Field label="Duration (hours)" error={dErr}>
                <Input type="number" min={1} max={168} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-slate-400">
              Total rainfall: <b className="text-white">{iErr || dErr ? "—" : `${(Number(intensity) * Number(duration)).toFixed(0)} mm`}</b>
            </p>
            <CoverageMeter value={coverage(f, true)} />
            <div className="border-t border-line pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Terrain &amp; context (optional)</p>
              <FactorInputs defs={TERRAIN} state={f} onChange={setF} />
            </div>
            <Button onClick={run} loading={busy} disabled={district === "" || invalid} className="w-full">
              <CloudRain className="h-4 w-4" />
              Run simulation
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          {!cur ? (
            <Card>
              <EmptyState icon={<CloudRain className="h-5 w-5" />} title="No scenario selected" text="Run a simulation or open one from the history below." />
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader
                  title={`Scenario #${cur.id} · ${names.get(cur.district_id) ?? ""}`}
                  subtitle={fmtDate(cur.created_at)}
                  action={<Badge tone={cur.status === "completed" ? "green" : "red"}>{cur.status}</Badge>}
                />
                {cur.status !== "completed" || !res ? (
                  <div className="p-5">
                    <ErrorState message="This scenario failed to process. Adjust the inputs and try again." />
                  </div>
                ) : (
                  <div className="grid gap-4 p-5 md:grid-cols-3">
                    <div className="rounded-xl bg-ink-900 p-4">
                      <p className="text-xs text-slate-500">Total rainfall</p>
                      <p className="text-2xl font-bold text-white">{res.total_rainfall_mm} mm</p>
                    </div>
                    <div className="rounded-xl bg-ink-900 p-4">
                      <p className="text-xs text-slate-500">Indicator score</p>
                      <p className="text-2xl font-bold text-white">{res.risk_indicators.score ?? "N/A"}</p>
                    </div>
                    <div className="rounded-xl bg-ink-900 p-4">
                      <p className="mb-1 text-xs text-slate-500">Category</p>
                      <RiskBadge category={res.risk_indicators.category} />
                    </div>
                  </div>
                )}
              </Card>
              {res && (
                <>
                  <Card className="overflow-hidden">
                    <CardHeader title="Map visualisation" subtitle="District boundary coloured by indicator category (not an inundation extent)" />
                    <div className="p-3">
                      {vizFc ? (
                        <MapView boundaries={vizFc} riskByName={{ [vizFc.features[0].properties.name]: res.risk_indicators.category }} selectedName={vizFc.features[0].properties.name} showResources={false} height="380px" />
                      ) : (
                        <EmptyState title="No boundary available" text={res.visualization_note ?? ""} />
                      )}
                    </div>
                  </Card>
                  <RiskResultPanel r={res.risk_indicators} title="Risk indicators" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader title="Assumptions" />
                      <ul className="list-disc space-y-2 p-5 pl-9 text-sm text-slate-300">
                        {res.assumptions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </Card>
                    <Card>
                      <CardHeader title="Limitations" />
                      <ul className="list-disc space-y-2 p-5 pl-9 text-sm text-amber-100/90">
                        {res.limitations.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {completed.length >= 2 && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <GitCompare className="h-4 w-4 text-cyan-300" /> Side-by-side comparison
                  </span>
                }
                subtitle="Compare total rainfall and indicator scores across any two completed scenarios"
              />
              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Scenario A">
                    <Select value={cmpLeft} onChange={(e) => selectForCompare("left", e.target.value)}>
                      <option value="">Select scenario A</option>
                      {completed.map((s) => (
                        <option key={s.id} value={s.id}>
                          #{s.id} · {names.get(s.district_id) ?? `District ${s.district_id}`} ({String(s.params.rainfall_intensity_mm_h)} mm/h × {String(s.params.duration_h)} h)
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Scenario B">
                    <Select value={cmpRight} onChange={(e) => selectForCompare("right", e.target.value)}>
                      <option value="">Select scenario B</option>
                      {completed.map((s) => (
                        <option key={s.id} value={s.id}>
                          #{s.id} · {names.get(s.district_id) ?? `District ${s.district_id}`} ({String(s.params.rainfall_intensity_mm_h)} mm/h × {String(s.params.duration_h)} h)
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {cmp && leftSim && rightSim && (
                  <div className="grid gap-4 rounded-xl border border-line bg-ink-900 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-slate-500">Scenario A (#{leftSim.id})</p>
                      <p className="font-semibold text-white">{names.get(leftSim.district_id)}</p>
                      <p className="text-xs text-slate-400">
                        Total: {leftSim.results?.total_rainfall_mm ?? "—"} mm · Score: {leftSim.results?.risk_indicators.score ?? "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Scenario B (#{rightSim.id})</p>
                      <p className="font-semibold text-white">{names.get(rightSim.district_id)}</p>
                      <p className="text-xs text-slate-400">
                        Total: {rightSim.results?.total_rainfall_mm ?? "—"} mm · Score: {rightSim.results?.risk_indicators.score ?? "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Delta (B vs A)</p>
                      <p className="text-xs text-slate-300">
                        Rainfall:{" "}
                        <b className="text-white">
                          {cmp.totalRainfallDiffMm !== null ? `${cmp.totalRainfallDiffMm >= 0 ? "+" : ""}${cmp.totalRainfallDiffMm} mm` : "—"}
                        </b>
                      </p>
                      <p className="text-xs text-slate-300">
                        Score: <b className="text-white">{cmp.scoreDiff !== null ? `${cmp.scoreDiff >= 0 ? "+" : ""}${cmp.scoreDiff}` : "—"}</b> (
                        {cmp.higherRiskSide === "equal" ? "equal" : cmp.higherRiskSide === "incomplete" ? "incomplete" : `${cmp.higherRiskSide === "right" ? "B" : "A"} higher`})
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Scenario history" />
            {hist.loading ? (
              <Skeleton className="m-5 h-20" />
            ) : !hist.data?.length ? (
              <EmptyState title="No scenarios yet" />
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
                    {hist.data.slice(0, 20).map((s) => (
                      <tr key={s.id} className="text-slate-300">
                        <td className="px-5 py-2.5 text-white">{s.id}</td>
                        <td>{names.get(s.district_id)}</td>
                        <td>
                          <Badge tone={s.status === "completed" ? "green" : "red"}>{s.status}</Badge>
                        </td>
                        <td className="text-xs text-slate-500">{fmtDate(s.created_at)}</td>
                        <td className="space-x-3 pr-5 text-right">
                          <button className="text-xs text-cyan-300 hover:underline" onClick={() => open(s)}>
                            Open
                          </button>
                          {!demo && s.status === "completed" && (
                            <button className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline" onClick={() => pdf(s.id)}>
                              <Download className="h-3 w-3" />
                              PDF
                            </button>
                          )}
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
