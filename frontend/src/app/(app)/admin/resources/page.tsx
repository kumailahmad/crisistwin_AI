"use client";
import { useMemo, useState } from "react";
import { FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { TYPE_META } from "@/components/map/CrisisMap";
import { BulkResourceUpload } from "@/components/BulkResourceUpload";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, VerifiedBadge, useToast } from "@/components/ui";
import { useAsync } from "@/lib/hooks";
import { districts, resources } from "@/lib/services";
import type { Resource, ResourceInput, ResourceType } from "@/lib/types";

export default function AdminResources() {
  const toast = useToast();
  const q = useAsync(() => resources.list(), []);
  const ds = useAsync(() => districts.list(), []);
  const [bulk, setBulk] = useState(false);
  const [edit, setEdit] = useState<Resource | "new" | null>(null); const [del, setDel] = useState<Resource | null>(null);
  const [s, setS] = useState(""); const [t, setT] = useState("");
  const dn = new Map((ds.data ?? []).map((d) => [d.id, d.name]));
  const list = useMemo(() => (q.data ?? []).filter((r) => (!t || r.type === t) && r.name.toLowerCase().includes(s.toLowerCase())), [q.data, s, t]);
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  return (
    <>
      <PageHeader title="Emergency resource management" subtitle="Add only real facilities with a documented source. Coordinates must lie inside the Balochistan study area." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => setBulk(true)}><FileUp className="h-4 w-4" />Bulk import CSV</Button><Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add resource</Button></div>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input className="pl-9" placeholder="Search by name" value={s} onChange={(e) => setS(e.target.value)} aria-label="Search" /></div>
        <Select className="w-44" value={t} onChange={(e) => setT(e.target.value)} aria-label="Type"><option value="">All types</option>{Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      </div>
      <Card>
        {q.loading ? <Skeleton className="m-5 h-32" /> : list.length === 0 ? <EmptyState title={q.data?.length ? "No matches" : "No resources recorded"} text="Create hospital, shelter and rescue-centre records from verified sources." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Name</th><th>Type</th><th>District</th><th>Phone</th><th>Coordinates</th><th>Status</th><th /></tr></thead>
            <tbody className="divide-y divide-line/60">{list.map((r) => <tr key={r.id} className="text-slate-300 hover:bg-ink-800/50"><td className="px-5 py-3 font-medium text-white">{r.name}<span className="block text-xs font-normal text-slate-500">{r.source}</span></td><td style={{ color: TYPE_META[r.type]?.color }}>{TYPE_META[r.type]?.label}</td><td>{r.district_id ? dn.get(r.district_id) : "—"}</td><td>{r.phone ?? "—"}</td><td className="font-mono text-xs">{r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</td><td><VerifiedBadge ok={r.verified} /></td>
              <td className="space-x-1 whitespace-nowrap px-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5 text-red-300" /></Button></td></tr>)}</tbody></table></div>
        )}
      </Card>
      {bulk && <BulkResourceUpload districts={ds.data ?? []} onClose={() => setBulk(false)} onDone={() => { setBulk(false); q.reload(); }} />}
      {edit && <Form initial={edit === "new" ? null : edit} districtsList={ds.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); q.reload(); }} />}
      <ConfirmDialog open={!!del} title="Delete resource" message={`Delete “${del?.name}”? This cannot be undone.`} onClose={() => setDel(null)} onConfirm={async () => { try { await resources.remove(del!.id); toast("ok", "Resource deleted"); q.reload(); } catch (e) { toast("err", (e as Error).message); } }} />
    </>
  );
}

function Form({ initial, districtsList, onClose, onSaved }: { initial: Resource | null; districtsList: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: initial?.name ?? "", type: (initial?.type ?? "hospital") as ResourceType, district_id: String(initial?.district_id ?? ""), latitude: String(initial?.latitude ?? ""), longitude: String(initial?.longitude ?? ""), phone: initial?.phone ?? "", address: initial?.address ?? "", source: initial?.source ?? "", verified: initial?.verified ?? false });
  const [busy, setBusy] = useState(false);
  const lat = Number(f.latitude), lon = Number(f.longitude);
  const latErr = f.latitude !== "" && !(lat >= 24 && lat <= 32.2) ? "Latitude must be 24 – 32.2 (Balochistan area)" : undefined;
  const lonErr = f.longitude !== "" && !(lon >= 60.8 && lon <= 70.6) ? "Longitude must be 60.8 – 70.6 (Balochistan area)" : undefined;
  const bad = f.name.trim().length < 2 || f.source.trim().length < 3 || f.latitude === "" || f.longitude === "" || !!latErr || !!lonErr;
  async function save() {
    setBusy(true);
    try {
      const body: ResourceInput = { name: f.name.trim(), type: f.type, district_id: f.district_id ? Number(f.district_id) : null, latitude: lat, longitude: lon, phone: f.phone || null, address: f.address || null, source: f.source.trim(), verified: f.verified };
      if (initial) await resources.update(initial.id, body); else await resources.create(body);
      toast("ok", "Resource saved"); onSaved();
    } catch (e) { toast("err", (e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={initial ? "Edit resource" : "Add resource"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
        <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ResourceType })}>{Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="District (optional)"><Select value={f.district_id} onChange={(e) => setF({ ...f, district_id: e.target.value })}><option value="">None</option>{districtsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Latitude" error={latErr}><Input type="number" step="any" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} /></Field>
        <Field label="Longitude" error={lonErr}><Input type="number" step="any" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Source (required)" hint="Where did you obtain these details?"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field></div>
        <label className="flex items-center gap-2 text-sm text-slate-200 sm:col-span-2"><input type="checkbox" className="accent-cyan-400" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />Verified against its source</label>
        <div className="sm:col-span-2"><Notice tone="cyan">Tip: find coordinates by right-clicking the location in OpenStreetMap and choosing “Show address”.</Notice></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={bad} onClick={save}>Save</Button></div>
      </div>
    </Modal>
  );
}
