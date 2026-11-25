"use client";
import { useState } from "react";
import { CheckCircle2, ExternalLink, MapPin, Trash2, XCircle } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Modal, PageHeader, Skeleton, StatCard, Textarea, useToast } from "@/components/ui";
import { EvidencePhoto } from "@/components/incidents/Photos";
import { useAsync, fmtDate } from "@/lib/hooks";
import { incidents } from "@/lib/services";
import { INCIDENT_TYPES, SEVERITY, STATUS_LABEL, type Incident, type IncidentStatus } from "@/lib/types";
import { Inbox, ShieldCheck, Archive } from "lucide-react";

const tone: Record<IncidentStatus, "amber" | "green" | "red" | "cyan"> = { pending: "amber", verified: "green", rejected: "red", resolved: "cyan" };
const FILTERS: { v: IncidentStatus | ""; l: string }[] = [{ v: "pending", l: "Awaiting review" }, { v: "verified", l: "Verified" }, { v: "resolved", l: "Resolved" }, { v: "rejected", l: "Rejected" }, { v: "", l: "All" }];

export default function AdminIncidents() {
  const toast = useToast(); const [status, setStatus] = useState<IncidentStatus | "">("pending");
  const list = useAsync(() => incidents.list(status), [status]); const stats = useAsync(() => incidents.stats(), []);
  const [sel, setSel] = useState<Incident | null>(null); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [del, setDel] = useState<Incident | null>(null); const [zoom, setZoom] = useState<string | null>(null);

  async function act(s: IncidentStatus) {
    if (!sel) return; setBusy(true);
    try { await incidents.review(sel.id, { status: s, admin_note: note.trim() || undefined }); toast("ok", `Marked ${STATUS_LABEL[s].toLowerCase()}`); setSel(null); list.reload(); stats.reload(); }
    catch (e) { toast("err", (e as Error).message); } finally { setBusy(false); }
  }
  const t = (v: string) => INCIDENT_TYPES.find((x) => x.value === v);

  return (
    <div>
      <PageHeader title="Incident reports" subtitle="Review crisis reports from users. Verify only what the evidence supports; verified reports appear on the shared map (without reporter details or photos)." />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="Awaiting review" value={stats.data?.pending ?? "—"} icon={<Inbox className="h-4 w-4" />} accent="#fbbf24" />
        <StatCard label="Verified" value={stats.data?.verified ?? "—"} icon={<ShieldCheck className="h-4 w-4" />} accent="#34d399" />
        <StatCard label="Resolved" value={stats.data?.resolved ?? "—"} icon={<Archive className="h-4 w-4" />} accent="#22d3ee" />
        <StatCard label="Rejected" value={stats.data?.rejected ?? "—"} icon={<XCircle className="h-4 w-4" />} accent="#ef4444" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((f) => <button key={f.l} role="tab" aria-selected={status === f.v} onClick={() => setStatus(f.v)} className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${status === f.v ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-line text-slate-400 hover:text-white"}`}>{f.l}</button>)}
      </div>
      {list.loading ? <Skeleton className="h-40 w-full" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.length ? <EmptyState title="Nothing here" text="No reports match this filter." /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((i) => (
            <Card key={i.id} className="cursor-pointer p-4 transition hover:border-cyan-400/50" onClick={() => { setSel(i); setNote(i.admin_note ?? ""); }}>
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-cyan-300">{i.code}</span><div className="flex gap-1.5"><span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ color: SEVERITY[i.severity].color, borderColor: SEVERITY[i.severity].color + "66" }}>{SEVERITY[i.severity].label}</span><Badge tone={tone[i.status]}>{STATUS_LABEL[i.status]}</Badge></div></div>
              <p className="mt-2 font-medium text-white">{t(i.type)?.emoji} {t(i.type)?.label}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{i.description}</p>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><MapPin className="h-3 w-3" />{i.district_name ?? "Unknown district"} · {fmtDate(i.created_at)} · {i.photo_count} photo(s)</p>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Report ${sel.code}` : ""} wide>
        {sel && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2"><Badge tone={tone[sel.status]}>{STATUS_LABEL[sel.status]}</Badge><Badge>{t(sel.type)?.label}</Badge><Badge>{SEVERITY[sel.severity].label} (reporter)</Badge>{sel.district_name && <Badge tone="cyan">{sel.district_name}</Badge>}</div>
            <p className="whitespace-pre-wrap text-slate-200">{sel.description}</p>
            <dl className="grid gap-2 rounded-xl border border-line bg-ink-900 p-3 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-500">Location</dt><dd className="font-mono text-slate-200">{sel.latitude.toFixed(5)}, {sel.longitude.toFixed(5)} <a className="ml-1 inline-flex items-center gap-0.5 text-cyan-300 hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${sel.latitude}&mlon=${sel.longitude}#map=16/${sel.latitude}/${sel.longitude}`}>OSM<ExternalLink className="h-3 w-3" /></a></dd></div>
              <div><dt className="text-slate-500">How located</dt><dd className="text-slate-200">{sel.location_source}{sel.accuracy_m ? ` · ±${Math.round(sel.accuracy_m)} m` : ""}</dd></div>
              <div><dt className="text-slate-500">Landmark</dt><dd className="text-slate-200">{sel.place_text ?? "—"}</dd></div>
              <div><dt className="text-slate-500">People affected</dt><dd className="text-slate-200">{sel.people_affected ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Reporter phone</dt><dd className="text-slate-200">{sel.contact_phone ? <a className="text-cyan-300" href={`tel:${sel.contact_phone}`}>{sel.contact_phone}</a> : "—"}</dd></div>
              <div><dt className="text-slate-500">Submitted</dt><dd className="text-slate-200">{fmtDate(sel.created_at)}</dd></div>
            </dl>
            {sel.media?.length ? <div className="grid grid-cols-4 gap-2">{sel.media.map((m) => <EvidencePhoto key={m.id} incident={sel} media={m} onOpen={setZoom} />)}</div> : <p className="text-xs text-amber-300">No photo evidence attached — verify by another source (call the reporter, local officials).</p>}
            <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-300">Note (shown to the reporter)</span><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="danger" size="sm" onClick={() => setDel(sel)}><Trash2 className="h-4 w-4" />Delete</Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" loading={busy} onClick={() => act("rejected")}><XCircle className="h-4 w-4" />Reject</Button>
                <Button variant="outline" loading={busy} onClick={() => act("resolved")}>Mark resolved</Button>
                <Button loading={busy} onClick={() => act("verified")}><CheckCircle2 className="h-4 w-4" />Verify</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} title="Delete report" message="This permanently removes the report and its photos." onClose={() => setDel(null)}
        onConfirm={async () => { await incidents.remove(del!.id); toast("ok", "Deleted"); setDel(null); setSel(null); list.reload(); stats.reload(); }} />
      <Modal open={!!zoom} onClose={() => setZoom(null)} title="Photo" wide>{zoom && /* eslint-disable-next-line @next/next/no-img-element */ <img src={zoom} alt="Evidence" className="max-h-[75vh] w-full rounded-lg object-contain" />}</Modal>
    </div>
  );
}
