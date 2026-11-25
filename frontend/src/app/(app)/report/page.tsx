"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, MapPin, Phone, ShieldAlert } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { LocationPicker, type Picked } from "@/components/incidents/LocationPicker";
import { EvidencePhoto, PhotoPicker } from "@/components/incidents/Photos";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAsync, fmtDate } from "@/lib/hooks";
import { incidents } from "@/lib/services";
import { INCIDENT_TYPES, SEVERITY, STATUS_LABEL, type Incident, type IncidentSeverity, type IncidentStatus, type IncidentType } from "@/lib/types";

const statusTone: Record<IncidentStatus, "amber" | "green" | "red" | "cyan"> = { pending: "amber", verified: "green", rejected: "red", resolved: "cyan" };
const typeLabel = (t: string) => INCIDENT_TYPES.find((x) => x.value === t);

export default function ReportPage() {
  const { demo } = useAuth(); const toast = useToast();
  const [type, setType] = useState<IncidentType>("flood"); const [severity, setSeverity] = useState<IncidentSeverity>("high");
  const [desc, setDesc] = useState(""); const [place, setPlace] = useState(""); const [phone, setPhone] = useState(""); const [people, setPeople] = useState("");
  const [loc, setLoc] = useState<Picked | null>(null); const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false); const [errs, setErrs] = useState<Record<string, string>>({}); const [done, setDone] = useState<Incident | null>(null);
  const [view, setView] = useState<Incident | null>(null); const [zoom, setZoom] = useState<string | null>(null);
  const mine = useAsync(() => incidents.mine(), [], "my-incidents");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); const er: Record<string, string> = {};
    if (desc.trim().length < 10) er.desc = "Describe what is happening (at least 10 characters).";
    if (!loc) er.loc = "Choose the location: use live location, search, or tap the map.";
    if (phone && !/^[+0-9][0-9 \-()]{5,24}$/.test(phone.trim())) er.phone = "Enter a valid phone number.";
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = await incidents.submit({ type, severity, description: desc.trim(), latitude: loc!.lat, longitude: loc!.lon, accuracy_m: loc!.accuracy ?? null, location_source: loc!.source,
        place_text: place.trim() || undefined, contact_phone: phone.trim() || undefined, people_affected: people ? Number(people) : null }, files);
      setDone(r); mine.reload(); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { toast("err", (e as Error).message); } finally { setBusy(false); }
  }
  function again() { setDone(null); setDesc(""); setPlace(""); setPhone(""); setPeople(""); setFiles([]); setLoc(null); }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Report a crisis" subtitle="Tell us what is happening and exactly where. Photos and a live location help the response team verify and act faster." />
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
        <ShieldAlert className="h-5 w-5 shrink-0 text-red-300" />
        <p className="flex-1 min-w-[220px]"><strong>Life in danger?</strong> Call <strong>Police 15</strong> first. This form is reviewed by administrators and is not a replacement for the emergency services.</p>
        <a href="tel:15" className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-400"><Phone className="h-4 w-4" />Call 15</a>
      </div>
      {demo && <div className="mb-5"><Notice tone="cyan">Demo mode: reports are saved only in this browser and are not sent to anyone. Sign in with a real account to submit to the response team.</Notice></div>}

      {done ? (
        <Card className="mb-8 border-emerald-400/40 p-6 text-center animate-fadeUp">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
          <h2 className="mt-3 text-xl font-bold text-white">Report received</h2>
          <p className="mt-1 text-slate-300">Your reference code</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-wider text-cyan-300" data-testid="ref-code">{done.code}</p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">An administrator will review it. Check the status below under “Your reports”.{done.district_name ? ` Located in ${done.district_name}.` : ""}{done.photo_count ? ` ${done.photo_count} photo(s) attached.` : ""}</p>
          {!!done.similar_nearby && <p className="mx-auto mt-3 max-w-lg rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">{done.similar_nearby} similar report(s) were made nearby in the last 24 hours — this helps responders confirm the event.</p>}
          <div className="mt-5 flex justify-center gap-3"><Button onClick={again}>Report another</Button><Link href="/map"><Button variant="outline">Open map</Button></Link></div>
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Card>
            <CardHeader title="1 · What is happening?" />
            <div className="space-y-4 p-5">
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-slate-300">Type of incident</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {INCIDENT_TYPES.map((t) => (
                    <button type="button" key={t.value} onClick={() => setType(t.value)} aria-pressed={type === t.value}
                      className={`rounded-xl border px-2 py-3 text-center text-xs font-medium transition ${type === t.value ? "border-cyan-400 bg-cyan-400/15 text-white shadow-glow" : "border-line bg-ink-900 text-slate-300 hover:border-slate-500"}`}>
                      <span className="block text-2xl" aria-hidden>{t.emoji}</span>{t.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-slate-300">How serious is it?</legend>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(SEVERITY) as IncidentSeverity[]).map((s) => (
                    <button type="button" key={s} onClick={() => setSeverity(s)} aria-pressed={severity === s}
                      className="rounded-full border px-4 py-1.5 text-xs font-semibold transition" style={severity === s ? { background: SEVERITY[s].color + "26", borderColor: SEVERITY[s].color, color: SEVERITY[s].color } : { borderColor: "#1b2f55", color: "#94a3b8" }}>{SEVERITY[s].label}</button>
                  ))}
                </div>
              </fieldset>
              <Field label="Describe the situation" error={errs.desc} hint="What you see, how many people or homes, what help is needed.">
                <Textarea value={desc} onChange={(e) => { setDesc(e.target.value); setErrs((x) => ({ ...x, desc: "" })); }} maxLength={2000} placeholder="e.g. Flood water has entered homes near the river; road to the village is cut off." />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="People affected (optional)"><Input inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="Approximate number" /></Field>
                <Field label="Your phone for follow-up (optional)" error={errs.phone} hint="Only administrators can see it."><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3xx xxxxxxx" /></Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="2 · Where is it?" subtitle="Your live location is the most reliable. You can also search a town or street, or tap / drag the pin." />
            <div className="space-y-4 p-5">
              <LocationPicker value={loc} onChange={(p) => { setLoc(p); setErrs((e) => ({ ...e, loc: "" })); }} />
              {errs.loc && <p className="text-xs text-red-300" role="alert">{errs.loc}</p>}
              <Field label="Landmark or address (optional)" hint="Village, road, nearby building — anything that helps responders find the place."><Input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={255} placeholder="e.g. Near Bolan bridge, Sibi Road" /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="3 · Evidence (photos)" subtitle={`Up to 4 photos. They are resized on your device and location data inside the photo file is removed.`} />
            <div className="p-5"><PhotoPicker files={files} onChange={setFiles} onError={(m) => toast("err", m)} /></div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-xs text-slate-500"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />False reports delay real help. Your account is attached to the report.</p>
            <Button type="submit" loading={busy} className="px-8 py-3 text-base"><ShieldAlert className="h-5 w-5" />Submit report</Button>
          </div>
        </form>
      )}

      <section className="mt-10" aria-labelledby="mine-h">
        <h2 id="mine-h" className="mb-3 flex items-center gap-2 text-lg font-semibold text-white"><ClipboardList className="h-5 w-5 text-cyan-300" />Your reports</h2>
        {mine.loading ? <Skeleton className="h-24 w-full" /> : mine.data?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.data.map((i) => (
              <button key={i.id} onClick={() => setView(i)} className="rounded-2xl border border-line bg-ink-850/80 p-4 text-left transition hover:border-cyan-400/50">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-cyan-300">{i.code}</span><Badge tone={statusTone[i.status]}>{STATUS_LABEL[i.status]}</Badge></div>
                <p className="mt-2 font-medium text-white">{typeLabel(i.type)?.emoji} {typeLabel(i.type)?.label}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{i.description}</p>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><MapPin className="h-3 w-3" />{i.district_name ?? i.place_text ?? `${i.latitude.toFixed(3)}, ${i.longitude.toFixed(3)}`} · {fmtDate(i.created_at)}{i.photo_count ? ` · ${i.photo_count} photo(s)` : ""}</p>
              </button>
            ))}
          </div>
        ) : <EmptyState title="No reports yet" text="Reports you submit appear here with their review status." />}
      </section>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `Report ${view.code}` : ""} wide>
        {view && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2"><Badge tone={statusTone[view.status]}>{STATUS_LABEL[view.status]}</Badge><Badge>{typeLabel(view.type)?.label}</Badge><Badge>{SEVERITY[view.severity].label} severity</Badge></div>
            <p className="whitespace-pre-wrap text-slate-200">{view.description}</p>
            <p className="font-mono text-xs text-slate-400">{view.latitude.toFixed(5)}, {view.longitude.toFixed(5)}{view.accuracy_m ? ` · ±${Math.round(view.accuracy_m)} m` : ""} · {view.location_source}</p>
            {view.admin_note && <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3"><p className="text-xs font-semibold text-cyan-300">Note from the response team</p><p className="text-slate-200">{view.admin_note}</p></div>}
            {!!view.media?.length && <div className="grid grid-cols-4 gap-2">{view.media.map((m) => <EvidencePhoto key={m.id} incident={view} media={m} onOpen={setZoom} />)}</div>}
          </div>
        )}
      </Modal>
      <Modal open={!!zoom} onClose={() => setZoom(null)} title="Photo" wide>{zoom && /* eslint-disable-next-line @next/next/no-img-element */ <img src={zoom} alt="Evidence" className="max-h-[75vh] w-full rounded-lg object-contain" />}</Modal>
    </div>
  );
}
