"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Layers, Search, X } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { GeoSearch, type Focus } from "@/components/map/GeoSearch";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Input, Notice, PageHeader, RiskBadge, Skeleton, VerifiedBadge } from "@/components/ui";
import { useMapData } from "@/lib/mapData";

export default function MapPage() {
  const m = useMapData();
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<Focus | null>(null);
  useEffect(() => { const n = new URLSearchParams(window.location.search).get("district"); if (n) setSel(n); }, []);
  const d = m.data;
  const list = useMemo(() => (d?.districts ?? []).filter((x) => x.name.toLowerCase().includes(q.toLowerCase())), [d, q]);
  const cur = sel ? m.byName.get(sel) : null;
  const curResources = d?.resources.filter((r) => cur && r.district_id === cur.id) ?? [];

  if (m.error) return <ErrorState message={m.error} onRetry={m.reload} />;
  return (
    <>
      <PageHeader title="GIS map" subtitle="Satellite, street and terrain base maps with district boundaries, risk overlays and emergency resources. Use the layer control (top right) to switch." />
      {d?.origin === "open-data" && <div className="mb-4"><Notice tone="cyan">District boundaries come from the open geoBoundaries dataset (CC BY 4.0) and have not been verified by an administrator. Administrators can import them into the database from Admin → Districts.</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4 xl:order-1">
          <Card>
            <CardHeader title="Find a place" subtitle="Any city, road or street" />
            <div className="p-3"><GeoSearch onPick={setFocus} /></div>
          </Card>
          <Card>
            <CardHeader title="Districts" subtitle={`${list.length} shown`} />
            <div className="p-3"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search district…" className="pl-9" aria-label="Search districts" /></div></div>
            <ul className="max-h-[300px] overflow-auto px-2 pb-2">
              {m.loading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="m-1 h-9" />) : list.map((x) => (
                <li key={x.id}><button onClick={() => setSel(x.name === sel ? null : x.name)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${x.name === sel ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-ink-800"}`}>{x.name}{m.riskByName[x.name] && <RiskBadge category={m.riskByName[x.name]} />}</button></li>
              ))}
              {!m.loading && list.length === 0 && <EmptyState title="No districts match" />}
            </ul>
          </Card>
          <Card>
            <CardHeader title={cur ? cur.name : "District details"} action={cur && <button aria-label="Clear selection" onClick={() => setSel(null)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>} />
            {!cur ? <EmptyState icon={<Layers className="h-5 w-5" />} title="Select a district" text="Click a district on the map or in the list." /> : (
              <div className="space-y-3 p-5 text-sm">
                <div className="flex flex-wrap gap-2"><VerifiedBadge ok={cur.verified} />{m.riskByName[cur.name] ? <RiskBadge category={m.riskByName[cur.name]} /> : <Badge>No assessment</Badge>}</div>
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-xs text-slate-500">Province</dt><dd className="text-white">{cur.province}</dd></div>
                  <div><dt className="text-xs text-slate-500">Area</dt><dd className="text-white">{cur.area_km2 ? `${cur.area_km2.toLocaleString()} km²` : "Not recorded"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Population</dt><dd className="text-white">{cur.population?.toLocaleString() ?? "Not recorded"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Resources</dt><dd className="text-white">{curResources.length}</dd></div>
                </dl>
                <p className="text-xs text-slate-500">Source: {cur.data_source ?? "not recorded"}</p>
                <div className="flex gap-2 pt-1"><Link href="/risk" className="flex-1 rounded-lg bg-cyan-400 py-2 text-center text-xs font-semibold text-ink-950">Assess risk</Link><Link href="/simulations" className="flex-1 rounded-lg border border-line py-2 text-center text-xs font-medium text-slate-200 hover:border-cyan-400/60">Simulate</Link></div>
              </div>
            )}
          </Card>
        </div>
        <div className="xl:order-2">{d ? <MapView boundaries={d.boundaries} riskByName={m.riskByName} resources={d.resources} incidents={d.incidents} selectedName={sel} onSelect={setSel} focus={focus} height="calc(100vh - 220px)" className="min-h-[520px]" /> : <Skeleton className="h-[70vh]" />}
          {d && d.resources.length === 0 && <p className="mt-3 text-xs text-slate-500">No emergency resources are stored yet, so no markers are shown. Administrators add verified records in Admin → Resources.</p>}
        </div>
      </div>
    </>
  );
}
