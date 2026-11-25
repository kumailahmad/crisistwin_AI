"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Skeleton, Textarea, VerifiedBadge, useToast } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { datasets } from "@/lib/services";
import type { Dataset } from "@/lib/types";

const KINDS = ["boundary", "rainfall", "elevation", "flood_history", "exposure", "facilities", "other"];

export default function AdminDatasets() {
  const toast = useToast();
  const q = useAsync(() => datasets.list(), []);
  const [edit, setEdit] = useState<Dataset | "new" | null>(null); const [del, setDel] = useState<Dataset | null>(null);
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  return (
    <>
      <PageHeader title="Dataset management" subtitle="Register every data source used by the platform so results can be traced and verified." actions={<Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add dataset</Button>} />
      <Card>
        {q.loading ? <Skeleton className="m-5 h-32" /> : !q.data?.length ? <EmptyState title="No datasets registered" text="Add the sources behind your boundaries, rainfall, terrain and facility data." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Name</th><th>Kind</th><th>Source</th><th>Status</th><th>Added</th><th /></tr></thead>
            <tbody className="divide-y divide-line/60">{q.data.map((d) => <tr key={d.id} className="text-slate-300 hover:bg-ink-800/50"><td className="px-5 py-3 font-medium text-white">{d.name}{d.description && <span className="block max-w-xs truncate text-xs font-normal text-slate-500">{d.description}</span>}</td><td><Badge tone="cyan">{d.kind}</Badge></td><td className="max-w-[220px] truncate">{d.source}</td><td><VerifiedBadge ok={d.verified} /></td><td className="text-xs text-slate-500">{fmtDate(d.created_at)}</td>
              <td className="space-x-1 px-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => setDel(d)}><Trash2 className="h-3.5 w-3.5 text-red-300" /></Button></td></tr>)}</tbody></table></div>
        )}
      </Card>
      {edit && <Form initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); q.reload(); }} />}
      <ConfirmDialog open={!!del} title="Delete dataset" message={`Delete “${del?.name}”? This cannot be undone.`} onClose={() => setDel(null)} onConfirm={async () => { try { await datasets.remove(del!.id); toast("ok", "Dataset deleted"); q.reload(); } catch (e) { toast("err", (e as Error).message); } }} />
    </>
  );
}
function Form({ initial, onClose, onSaved }: { initial: Dataset | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: initial?.name ?? "", kind: initial?.kind ?? "boundary", source: initial?.source ?? "", description: initial?.description ?? "", verified: initial?.verified ?? false });
  const [busy, setBusy] = useState(false);
  const bad = f.name.trim().length < 2 || f.source.trim().length < 3;
  async function save() {
    setBusy(true);
    try { const b = { ...f, description: f.description || null }; if (initial) await datasets.update(initial.id, b); else await datasets.create(b); toast("ok", "Dataset saved"); onSaved(); }
    catch (e) { toast("err", (e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={initial ? "Edit dataset" : "Add dataset"}>
      <div className="space-y-4">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Kind"><select className="w-full rounded-lg border border-line bg-ink-900 px-3 py-2.5 text-sm text-white" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Source / URL / citation"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="accent-cyan-400" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />Verified</label>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={bad} onClick={save}>Save</Button></div>
      </div>
    </Modal>
  );
}
