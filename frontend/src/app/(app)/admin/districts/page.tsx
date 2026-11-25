"use client";
import { useState } from "react";
import { DownloadCloud, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Skeleton, VerifiedBadge, useToast } from "@/components/ui";
import { useAsync } from "@/lib/hooks";
import { districts, loadOpenBoundaries } from "@/lib/services";
import type { District } from "@/lib/types";

export default function AdminDistricts() {
  const toast = useToast();
  const q = useAsync(() => districts.list(), []);
  const [edit, setEdit] = useState<District | "new" | null>(null);
  const [del, setDel] = useState<District | null>(null);
  const [bnd, setBnd] = useState<District | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  async function importOpen() {
    setImporting("Loading open data…");
    try {
      const open = await loadOpenBoundaries(); let current = [...(q.data ?? [])]; let ok = 0; const failed: string[] = [];
      for (const [i, f] of open.features.entries()) {
        setImporting(`Importing ${f.properties.name} (${i + 1}/${open.features.length})…`);
        try {
          let d = current.find((x) => x.name.toLowerCase() === f.properties.name.toLowerCase());
          if (!d) { d = await districts.create({ name: f.properties.name, area_km2: f.properties.area_km2_approx, data_source: f.properties.source, verified: false }); current = [...current, d]; }
          await districts.setBoundary(d.id, f.geometry, f.properties.source); ok++;
        } catch (e) { failed.push(`${f.properties.name}: ${(e as Error).message}`); }
      }
      toast(failed.length ? "err" : "ok", `Imported ${ok} boundaries${failed.length ? `, ${failed.length} failed` : ""}.`); if (failed.length) console.warn(failed);
      q.reload();
    } finally { setImporting(null); }
  }

  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  return (
    <>
      <PageHeader title="District management" subtitle="Create districts, attach boundaries and mark records as verified once their source has been checked." actions={<div className="flex gap-2"><Button variant="outline" onClick={importOpen} loading={!!importing}><DownloadCloud className="h-4 w-4" />Import open-data boundaries</Button><Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add district</Button></div>} />
      {importing && <div className="mb-4"><Notice tone="cyan">{importing}</Notice></div>}
      <div className="mb-4"><Notice tone="cyan">“Import open-data boundaries” loads the 26 Balochistan districts from the geoBoundaries dataset (CC BY 4.0) as <b>unverified</b> records. Review them, then tick <b>Verified</b>.</Notice></div>
      <Card>
        {q.loading ? <Skeleton className="m-5 h-40" /> : !q.data?.length ? <EmptyState title="No districts yet" text="Import the open-data boundaries or add a district manually." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Name</th><th>Area km²</th><th>Population</th><th>Boundary</th><th>Status</th><th>Source</th><th /></tr></thead>
            <tbody className="divide-y divide-line/60">{q.data.map((d) => (
              <tr key={d.id} className="text-slate-300 hover:bg-ink-800/50"><td className="px-5 py-3 font-medium text-white">{d.name}</td><td className="tabular-nums">{d.area_km2?.toLocaleString() ?? "—"}</td><td className="tabular-nums">{d.population?.toLocaleString() ?? "—"}</td>
                <td>{d.has_boundary ? <Badge tone="green">Yes</Badge> : <Badge tone="red">Missing</Badge>}</td><td><VerifiedBadge ok={d.verified} /></td><td className="max-w-[200px] truncate text-xs text-slate-500" title={d.data_source ?? ""}>{d.data_source ?? "—"}</td>
                <td className="space-x-1 whitespace-nowrap px-3 text-right"><Button size="sm" variant="ghost" onClick={() => setBnd(d)} title="Upload boundary"><Upload className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => setEdit(d)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => setDel(d)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-red-300" /></Button></td></tr>
            ))}</tbody></table></div>
        )}
      </Card>
      {edit && <DistrictForm initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); q.reload(); }} />}
      {bnd && <BoundaryForm d={bnd} onClose={() => setBnd(null)} onSaved={() => { setBnd(null); q.reload(); }} />}
      <ConfirmDialog open={!!del} title="Delete district" message={`Delete “${del?.name}” and its boundary? This cannot be undone. It will fail if assessments, simulations or resources reference it.`} onClose={() => setDel(null)} onConfirm={async () => { try { await districts.remove(del!.id); toast("ok", "District deleted"); q.reload(); } catch (e) { toast("err", (e as Error).message); } }} />
    </>
  );
}

function DistrictForm({ initial, onClose, onSaved }: { initial: District | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? ""); const [area, setArea] = useState(String(initial?.area_km2 ?? "")); const [pop, setPop] = useState(String(initial?.population ?? ""));
  const [src, setSrc] = useState(initial?.data_source ?? ""); const [ver, setVer] = useState(initial?.verified ?? false); const [busy, setBusy] = useState(false);
  const bad = name.trim().length < 2 || (area !== "" && Number(area) <= 0) || (pop !== "" && Number(pop) < 0);
  async function save() {
    setBusy(true);
    try {
      const body = { area_km2: area === "" ? null : Number(area), population: pop === "" ? null : Number(pop), data_source: src || null, verified: ver };
      if (initial) await districts.update(initial.id, body); else await districts.create({ name: name.trim(), ...body });
      toast("ok", "District saved"); onSaved();
    } catch (e) { toast("err", (e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : "Add district"}>
      <div className="space-y-4">
        {!initial && <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        <div className="grid grid-cols-2 gap-3"><Field label="Area (km²)"><Input type="number" min={0} value={area} onChange={(e) => setArea(e.target.value)} /></Field><Field label="Population"><Input type="number" min={0} value={pop} onChange={(e) => setPop(e.target.value)} /></Field></div>
        <Field label="Data source" hint="Where do these figures come from?"><Input value={src} onChange={(e) => setSrc(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="accent-cyan-400" checked={ver} onChange={(e) => setVer(e.target.checked)} />Verified against its source</label>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={bad} onClick={save}>Save</Button></div>
      </div>
    </Modal>
  );
}

function BoundaryForm({ d, onClose, onSaved }: { d: District; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(""); const [src, setSrc] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    try {
      const j = JSON.parse(text); const geom = j.type === "Feature" ? j.geometry : j.type === "FeatureCollection" ? j.features?.[0]?.geometry : j;
      if (!geom) throw new Error("No geometry found in the GeoJSON");
      await districts.setBoundary(d.id, geom, src); toast("ok", "Boundary saved"); onSaved();
    } catch (e) { setErr(e instanceof SyntaxError ? "That is not valid JSON." : (e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Boundary for ${d.name}`} wide>
      <div className="space-y-4">
        <Field label="GeoJSON (Polygon / MultiPolygon, EPSG:4326)" hint="Paste a geometry or Feature, or choose a .geojson file."><Textarea2 value={text} onChange={setText} /></Field>
        <input type="file" accept=".geojson,.json,application/json" aria-label="GeoJSON file" className="text-xs text-slate-300" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        <Field label="Source (required)"><Input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="e.g. NDMA / Survey of Pakistan, 2023" /></Field>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!text || src.trim().length < 3} onClick={save}>Save boundary</Button></div>
      </div>
    </Modal>
  );
}
const Textarea2 = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={8} className="w-full rounded-lg border border-line bg-ink-900 p-3 font-mono text-xs text-white focus:border-cyan-400/70 focus:outline-none" />;
