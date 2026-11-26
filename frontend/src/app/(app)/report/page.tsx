"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flag,
  MapPin,
  Phone,
  Save,
  ShieldAlert,
  Trash2,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { LocationPicker, type Picked } from "@/components/incidents/LocationPicker";
import { EvidencePhoto, PhotoPicker } from "@/components/incidents/Photos";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { fmtDate, useAsync } from "@/lib/hooks";
import { incidents, loadOpenBoundaries } from "@/lib/services";
import {
  INCIDENT_TYPES,
  SEVERITY,
  STATUS_LABEL,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
} from "@/lib/types";
import {
  createOfflineDraft,
  loadOfflineDrafts,
  removeOfflineDraft,
  saveOfflineDraft,
  type OfflineIncidentDraft,
} from "@/lib/utils/offlineDrafts";

const statusTone: Record<IncidentStatus, "amber" | "green" | "red" | "cyan"> = {
  pending: "amber",
  under_review: "cyan",
  verified: "green",
  response_assigned: "cyan",
  resolved: "green",
  rejected: "red",
};

const PRIMARY_TYPES = INCIDENT_TYPES.filter((t) => t.citizenPrimary);
const typeLabel = (t: string) => INCIDENT_TYPES.find((x) => x.value === t);

const STEP_TITLES = [
  "Emergency Type",
  "Photo Evidence",
  "Location",
  "Description",
  "Review & Submit",
] as const;

export default function ReportEmergencyPage() {
  const { demo, user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [type, setType] = useState<IncidentType>("flood");
  const [severity, setSeverity] = useState<IncidentSeverity>("high");
  const [files, setFiles] = useState<File[]>([]);
  const [loc, setLoc] = useState<Picked | null>(null);
  const [manualDistrict, setManualDistrict] = useState("");
  const [desc, setDesc] = useState("");
  const [place, setPlace] = useState("");
  const [phone, setPhone] = useState("");
  const [people, setPeople] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepErr, setStepErr] = useState<string | null>(null);

  const [done, setDone] = useState<Incident | null>(null);
  const [view, setView] = useState<Incident | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const [online, setOnline] = useState(true);
  const [drafts, setDrafts] = useState<OfflineIncidentDraft[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [flagTarget, setFlagTarget] = useState<Incident | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);

  const mine = useAsync(() => incidents.mine(), [], "my-incidents");
  const pub = useAsync(() => incidents.public(), [], "public-incidents");
  const geoDistricts = useAsync(() => loadOpenBoundaries(), [], "report-districts");

  useEffect(() => {
    setDrafts(loadOfflineDrafts());
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  function applyManualDistrict(name: string) {
    setManualDistrict(name);
    setStepErr(null);
    if (!name) return;
    const feat = geoDistricts.data?.features.find((f) => f.properties.name === name);
    const c = feat?.properties.centroid;
    if (c && c.length >= 2) {
      setLoc({ lat: c[1], lon: c[0], source: "manual" });
      if (!place.trim()) setPlace(`${name} district (manual selection)`);
    }
  }

  function validateStep(targetStep = step): string | null {
    if (targetStep === 3 && !loc) {
      return "Please share your GPS location, tap the map pin, or manually select your district.";
    }
    if (targetStep === 4) {
      if (desc.trim().length < 10) {
        return "Please enter a short description of at least 10 characters.";
      }
      if (phone.trim() && !/^[+0-9][0-9 \-()]{5,24}$/.test(phone.trim())) {
        return "Enter a valid follow-up phone number or leave it blank.";
      }
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) {
      setStepErr(err);
      return;
    }
    setStepErr(null);
    setStep((s) => Math.min(5, s + 1));
  }

  function prevStep() {
    setStepErr(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function saveLocalDraft() {
    const errLoc = validateStep(3);
    const errDesc = validateStep(4);
    if (errLoc || errDesc) {
      setStepErr(errLoc || errDesc);
      return;
    }
    const draft = createOfflineDraft({
      type,
      severity,
      description: desc.trim(),
      latitude: loc!.lat,
      longitude: loc!.lon,
      accuracy_m: loc!.accuracy ?? null,
      location_source: loc!.source,
      place_text: place.trim() || undefined,
      contact_phone: phone.trim() || undefined,
      people_affected: people ? Number(people) : null,
    });
    setDrafts(saveOfflineDraft(draft));
    resetWizard();
    toast("ok", "Saved locally on this device as an unsubmitted draft.");
  }

  async function submitReport() {
    const errLoc = validateStep(3);
    const errDesc = validateStep(4);
    if (errLoc || errDesc) {
      setStepErr(errLoc || errDesc);
      return;
    }
    if (!online && !demo) {
      saveLocalDraft();
      return;
    }
    setBusy(true);
    setStepErr(null);
    try {
      const r = await incidents.submit(
        {
          type,
          severity,
          description: desc.trim(),
          latitude: loc!.lat,
          longitude: loc!.lon,
          accuracy_m: loc!.accuracy ?? null,
          location_source: loc!.source,
          place_text: place.trim() || undefined,
          contact_phone: phone.trim() || undefined,
          people_affected: people ? Number(people) : null,
        },
        files
      );
      setDone(r);
      mine.reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast("err", (err as Error).message);
      setStepErr((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retryDraft(d: OfflineIncidentDraft) {
    if (!online && !demo) {
      toast("err", "Still offline. Connect to the internet to submit.");
      return;
    }
    setRetryingId(d.local_id);
    try {
      const r = await incidents.submit(
        {
          type: d.type,
          severity: d.severity,
          description: d.description,
          latitude: d.latitude,
          longitude: d.longitude,
          accuracy_m: d.accuracy_m,
          location_source: d.location_source,
          place_text: d.place_text,
          contact_phone: d.contact_phone,
          people_affected: d.people_affected,
        },
        []
      );
      setDrafts(removeOfflineDraft(d.local_id));
      setDone(r);
      mine.reload();
      toast("ok", `Draft submitted (${r.code})`);
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setRetryingId(null);
    }
  }

  async function submitFlag() {
    if (!flagTarget || flagReason.trim().length < 5) return;
    setFlagBusy(true);
    try {
      await incidents.flag(flagTarget.id, flagReason.trim());
      toast("ok", "Feedback flagged for administrator review");
      setFlagTarget(null);
      setFlagReason("");
      pub.reload();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setFlagBusy(false);
    }
  }

  function resetWizard() {
    setDone(null);
    setStep(1);
    setType("flood");
    setSeverity("high");
    setFiles([]);
    setLoc(null);
    setManualDistrict("");
    setDesc("");
    setPlace("");
    setPhone("");
    setPeople("");
    setStepErr(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Report Emergency"
        subtitle="Follow these 5 simple steps to share what is happening and where help is needed."
      />

      {/* Immediate Danger Banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#DC454D]/40 bg-[#DC454D]/10 p-4 text-sm text-ct-text">
        <ShieldAlert className="h-5 w-5 shrink-0 text-[#DC454D]" />
        <p className="min-w-[220px] flex-1">
          <strong>Life-threatening danger?</strong> Call <strong>Police 15</strong> first. Reports submitted here are reviewed by coordinators.
        </p>
        <a
          href="tel:15"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#DC454D] px-4 py-2 font-bold text-white hover:bg-[#c53a42]"
        >
          <Phone className="h-4 w-4" />
          Call 15
        </a>
      </div>

      {!online && (
        <Notice>
          <span className="flex items-center gap-2 font-semibold">
            <WifiOff className="h-4 w-4 shrink-0" /> Offline mode: saved drafts stay in this browser until connectivity returns.
          </span>
        </Notice>
      )}

      {demo && (
        <Notice tone="cyan">
          Preview mode: reports are stored locally in this browser only. Sign in with an account to send reports to response administrators.
        </Notice>
      )}

      {/* Offline Drafts Queue */}
      {drafts.length > 0 && (
        <Card className="border-[#E9A23B]/50">
          <CardHeader
            title={`Saved Offline Drafts (${drafts.length})`}
            subtitle="Stored locally on this device — not submitted yet"
          />
          <ul className="divide-y divide-ct-border">
            {drafts.map((d) => (
              <li key={d.local_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone="amber">Unsubmitted Draft</Badge>
                    <span className="text-xs font-medium text-ct-secondary">
                      {typeLabel(d.type)?.label ?? d.type}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-ct-text">{d.description}</p>
                  <p className="text-[11px] text-ct-muted tabular-nums">
                    Saved {fmtDate(d.saved_at)} · {d.latitude.toFixed(3)}, {d.longitude.toFixed(3)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDrafts(removeOfflineDraft(d.local_id))}
                    aria-label="Discard draft"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" loading={retryingId === d.local_id} onClick={() => retryDraft(d)}>
                    <UploadCloud className="h-3.5 w-3.5" />
                    Submit now
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Confirmation or 5-Step Wizard */}
      {done ? (
        <Card className="animate-fadeUp border-emerald-500/40 p-7 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-[#16A34A]" />
          <h2 className="mt-3 text-2xl font-bold text-ct-text">Emergency Report Submitted</h2>
          <p className="mt-1 text-sm text-ct-secondary">Your unique Reference ID</p>
          <p className="mt-1 font-mono text-3xl font-extrabold tracking-wider text-[#0b8a99] dark:text-[#21C7D9] tabular-nums" data-testid="ref-code">
            {done.code}
          </p>

          <div className="mx-auto mt-5 grid max-w-xl gap-3 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-ct-border bg-ct-soft p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ct-muted">
                Verification Status
              </p>
              <p className="mt-1 text-sm font-semibold text-ct-text">
                {STATUS_LABEL[done.status]} — Pending administrator verification
              </p>
            </div>
            <div className="rounded-xl border border-ct-border bg-ct-soft p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ct-muted">
                AI Analysis Status
              </p>
              <p className="mt-1 text-sm font-semibold text-ct-text">
                Not automatically run — queued for human coordinator triage
              </p>
            </div>
          </div>

          <p className="mx-auto mt-4 max-w-lg text-xs text-ct-muted">
            {done.district_name ? `Detected district: ${done.district_name}. ` : ""}
            {done.photo_count ? `${done.photo_count} photo(s) attached. ` : ""}
            Track live status updates below under My Reports.
          </p>

          {!!done.similar_nearby && (
            <p className="mx-auto mt-3 max-w-lg rounded-xl border border-[#E9A23B]/45 bg-[#E9A23B]/12 p-2.5 text-xs font-medium text-ct-text">
              {done.similar_nearby} similar report(s) were filed nearby in the last 24 hours.
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={resetWizard}>Submit Another Report</Button>
            <Button variant="outline" onClick={() => setView(done)}>
              Track Report Progress
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Stepper Progress Header */}
          <div className="border-b border-ct-border bg-ct-soft/60 px-5 py-4">
            <div className="flex items-center justify-between text-xs font-semibold text-ct-secondary">
              <span>Step {step} of 5</span>
              <span>{STEP_TITLES[step - 1]}</span>
            </div>
            <div className="mt-2.5 grid grid-cols-5 gap-1.5" aria-label="Reporting progress">
              {STEP_TITLES.map((title, idx) => {
                const n = idx + 1;
                const doneStep = n < step;
                const activeStep = n === step;
                return (
                  <button
                    key={title}
                    type="button"
                    onClick={() => {
                      if (n < step) {
                        setStepErr(null);
                        setStep(n);
                      }
                    }}
                    aria-label={`Step ${n}: ${title}`}
                    className={cn(
                      "h-2 rounded-full transition",
                      activeStep
                        ? "bg-[#21C7D9]"
                        : doneStep
                          ? "bg-[#16A34A] cursor-pointer"
                          : "bg-ct-border cursor-default"
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="p-5 sm:p-7">
            {/* STEP 1: Select emergency type */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-ct-text">1. Select Emergency Type</h2>
                  <p className="mt-1 text-sm text-ct-muted">
                    Choose the emergency category that best matches what is happening.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {PRIMARY_TYPES.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setType(t.value)}
                      aria-pressed={type === t.value}
                      className={cn(
                        "flex min-h-[82px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center text-sm font-semibold transition",
                        type === t.value
                          ? "border-[#21C7D9] bg-[#21C7D9]/15 text-ct-text ring-2 ring-[#21C7D9]/30"
                          : "border-ct-border bg-ct-surface text-ct-secondary hover:border-[#21C7D9]/60 hover:text-ct-text"
                      )}
                    >
                      <span className="text-2xl" aria-hidden>
                        {t.emoji}
                      </span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ct-muted">
                    Urgency Level
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(SEVERITY) as IncidentSeverity[]).map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setSeverity(s)}
                        aria-pressed={severity === s}
                        className={cn(
                          "min-h-[40px] rounded-xl border px-4 py-2 text-xs font-semibold transition",
                          severity === s
                            ? "border-ct-text bg-[#0B1424] text-white dark:bg-[#21C7D9] dark:text-[#0B1424]"
                            : "border-ct-border bg-ct-surface text-ct-secondary hover:border-[#21C7D9]"
                        )}
                      >
                        {SEVERITY[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Upload photograph or use phone camera */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ct-text">2. Add a Photograph</h2>
                  <p className="mt-1 text-sm text-ct-muted">
                    Take a photo with your phone camera or upload one from your device. You can skip this step if no photo is available.
                  </p>
                </div>
                <PhotoPicker files={files} onChange={setFiles} onError={(m) => toast("err", m)} />
              </div>
            )}

            {/* STEP 3: Get current GPS location */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ct-text">3. Confirm Location</h2>
                  <p className="mt-1 text-sm text-ct-muted">
                    Use your live GPS, confirm the pin on the map, or select your district manually if GPS is unavailable.
                  </p>
                </div>

                <LocationPicker
                  value={loc}
                  onChange={(p) => {
                    setLoc(p);
                    setStepErr(null);
                  }}
                />

                <div className="rounded-2xl border border-ct-border bg-ct-soft/60 p-4">
                  <Field
                    label="Manual District Selection (if GPS is unavailable)"
                    hint="Choosing a district places the report pin in that district so coordinators can triage it."
                  >
                    <Select
                      value={manualDistrict}
                      onChange={(e) => applyManualDistrict(e.target.value)}
                      aria-label="Manually select district"
                    >
                      <option value="">Select a Balochistan district…</option>
                      {(geoDistricts.data?.features ?? [])
                        .map((f) => f.properties.name)
                        .sort((a, b) => a.localeCompare(b))
                        .map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {/* STEP 4: Short description */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ct-text">4. Short Description</h2>
                  <p className="mt-1 text-sm text-ct-muted">
                    Briefly explain what happened, how many people are affected, and what help is needed.
                  </p>
                </div>
                <Field
                  label="What is happening?"
                  hint="Minimum 10 characters."
                >
                  <Textarea
                    value={desc}
                    onChange={(e) => {
                      setDesc(e.target.value);
                      setStepErr(null);
                    }}
                    maxLength={2000}
                    placeholder="e.g. Heavy floodwater entered homes near the main bridge; families need rescue."
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Landmark or street (optional)">
                    <Input
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                      maxLength={255}
                      placeholder="e.g. Near Sibi Road bridge"
                    />
                  </Field>
                  <Field label="People affected (optional)">
                    <Input
                      inputMode="numeric"
                      value={people}
                      onChange={(e) => setPeople(e.target.value.replace(/\D/g, "").slice(0, 7))}
                      placeholder="Approximate count"
                    />
                  </Field>
                </div>
                <Field
                  label="Contact phone for responders (optional)"
                  hint="Visible only to response administrators."
                >
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setStepErr(null);
                    }}
                    placeholder="+92 3xx xxxxxxx"
                  />
                </Field>
              </div>
            )}

            {/* STEP 5: Submit emergency report */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ct-text">5. Review &amp; Submit Emergency Report</h2>
                  <p className="mt-1 text-sm text-ct-muted">
                    Confirm the details below before submitting.
                  </p>
                </div>
                <dl className="divide-y divide-ct-border rounded-2xl border border-ct-border bg-ct-soft/40 text-sm">
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-ct-muted">Emergency Type</dt>
                    <dd className="font-semibold text-ct-text">
                      {typeLabel(type)?.label} ({SEVERITY[severity].label})
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-ct-muted">Photographs</dt>
                    <dd className="font-semibold text-ct-text">{files.length} attached</dd>
                  </div>
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-ct-muted">Location</dt>
                    <dd className="text-right font-mono text-xs font-semibold text-ct-text tabular-nums">
                      {loc ? `${loc.lat.toFixed(4)}°N, ${loc.lon.toFixed(4)}°E` : "Not selected"}
                      {place ? ` · ${place}` : ""}
                    </dd>
                  </div>
                  <div className="px-4 py-3">
                    <dt className="text-ct-muted">Description</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-ct-text">{desc.trim()}</dd>
                  </div>
                </dl>
              </div>
            )}

            {stepErr && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-[#DC454D]/40 bg-[#DC454D]/10 px-4 py-3 text-sm font-medium text-[#b91c25] dark:text-red-200"
              >
                {stepErr}
              </div>
            )}

            {/* Wizard Navigation Footer */}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-ct-border pt-5">
              {step > 1 ? (
                <Button type="button" variant="outline" onClick={prevStep}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : (
                <span className="text-xs text-ct-muted">False reports delay emergency help.</span>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {step === 5 && !demo && (
                  <Button type="button" variant="outline" onClick={saveLocalDraft}>
                    <Save className="h-4 w-4" />
                    Save Offline Draft
                  </Button>
                )}

                {step < 5 ? (
                  <Button type="button" variant="navy" onClick={nextStep}>
                    {step === 2 && files.length === 0 ? "Skip / Next" : "Next Step"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="emergency"
                    size="lg"
                    loading={busy}
                    onClick={submitReport}
                  >
                    <ShieldAlert className="h-5 w-5" />
                    {online || demo ? "Submit Emergency Report" : "Save Offline Draft"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* My Submitted Reports */}
      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="flex items-center gap-2 text-lg font-bold text-ct-text">
          <ClipboardList className="h-5 w-5 text-[#0b8a99] dark:text-[#21C7D9]" />
          My Reports &amp; Progress
        </h2>
        {mine.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : mine.data?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.data.map((i) => (
              <button
                key={i.id}
                onClick={() => setView(i)}
                className="rounded-2xl border border-ct-border bg-ct-surface p-4 text-left shadow-card transition hover:border-[#21C7D9]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0b8a99] dark:text-[#21C7D9] tabular-nums">
                    {i.code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {i.assigned_team && <Badge tone="cyan">{i.assigned_team}</Badge>}
                    <Badge tone={statusTone[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                  </div>
                </div>
                <p className="mt-2 font-semibold text-ct-text">
                  {typeLabel(i.type)?.label ?? i.type.replace(/_/g, " ")}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-ct-secondary">{i.description}</p>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-ct-muted tabular-nums">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {i.district_name ?? i.place_text ?? `${i.latitude.toFixed(3)}, ${i.longitude.toFixed(3)}`} ·{" "}
                  {fmtDate(i.created_at)}
                  {i.photo_count ? ` · ${i.photo_count} photo(s)` : ""}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No submitted reports yet"
              text="Reports you submit appear here with their unique Reference ID and verification timeline."
            />
          </Card>
        )}
      </section>

      {/* Verified Public Incidents */}
      {!demo && (
        <section aria-labelledby="pub-h" className="space-y-3">
          <div>
            <h2 id="pub-h" className="text-lg font-bold text-ct-text">
              Verified Community Reports
            </h2>
            <p className="text-xs text-ct-muted">
              Only administrator-verified incidents appear here without reporter personal details.
            </p>
          </div>
          {pub.loading ? (
            <Skeleton className="h-20 w-full" />
          ) : pub.data?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {pub.data.map((inc) => (
                <Card key={inc.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ct-text">
                      {typeLabel(inc.type)?.label ?? inc.type.replace(/_/g, " ")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={statusTone[inc.status]}>{STATUS_LABEL[inc.status]}</Badge>
                      {inc.assigned_team && <Badge tone="cyan">{inc.assigned_team}</Badge>}
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm text-ct-secondary">{inc.description}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-ct-muted">
                    <span className="tabular-nums">
                      {inc.district_name ?? "Balochistan"} · {fmtDate(inc.created_at)}
                    </span>
                    {user && (
                      <button
                        type="button"
                        onClick={() => {
                          setFlagTarget(inc);
                          setFlagReason("");
                        }}
                        className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline dark:text-amber-300"
                      >
                        <Flag className="h-3 w-3" /> Flag update
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No verified community incidents"
                text="Verified incidents approved by administrators appear here."
              />
            </Card>
          )}
        </section>
      )}

      {/* Report Detail Modal */}
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `Report ${view.code}` : ""} wide>
        {view && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone={statusTone[view.status]}>{STATUS_LABEL[view.status]}</Badge>
              <Badge>{typeLabel(view.type)?.label ?? view.type}</Badge>
              <Badge>{SEVERITY[view.severity].label} urgency</Badge>
              {view.assigned_team && <Badge tone="cyan">Team: {view.assigned_team}</Badge>}
            </div>
            <p className="whitespace-pre-wrap text-ct-text">{view.description}</p>
            <p className="font-mono text-xs text-ct-muted tabular-nums">
              {view.latitude.toFixed(5)}, {view.longitude.toFixed(5)}
              {view.accuracy_m ? ` · ±${Math.round(view.accuracy_m)} m` : ""} · {view.location_source}
            </p>
            {view.admin_note && (
              <div className="rounded-xl border border-[#21C7D9]/35 bg-[#21C7D9]/10 p-3.5">
                <p className="text-xs font-bold text-[#0b8a99] dark:text-[#21C7D9]">
                  Response Coordinator Note
                </p>
                <p className="mt-1 text-ct-text">{view.admin_note}</p>
              </div>
            )}
            {!!view.history?.length && (
              <div className="rounded-xl border border-ct-border bg-ct-soft p-3.5">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ct-muted">
                  <Clock className="h-3.5 w-3.5 text-[#0b8a99] dark:text-[#21C7D9]" />
                  Progress Timeline
                </p>
                <ol className="space-y-2.5 text-xs">
                  {view.history.map((h, idx) => (
                    <li key={idx} className="flex flex-wrap items-center justify-between gap-2 pl-1">
                      <div>
                        <span className="font-semibold text-ct-text">{STATUS_LABEL[h.status]}</span>
                        {h.assigned_team && (
                          <span className="ml-2 text-[#0b8a99] dark:text-[#21C7D9]">· {h.assigned_team}</span>
                        )}
                        {h.note && <p className="text-ct-secondary">{h.note}</p>}
                      </div>
                      <span className="text-ct-muted tabular-nums">{fmtDate(h.at)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!!view.media?.length && (
              <div className="grid grid-cols-4 gap-2">
                {view.media.map((m) => (
                  <EvidencePhoto key={m.id} incident={view} media={m} onOpen={setZoom} />
                ))}
              </div>
            )}
            <div className="flex justify-end border-t border-ct-border pt-3">
              <Link href="/map" className="text-xs font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
                View Public Map
              </Link>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!flagTarget} onClose={() => setFlagTarget(null)} title="Flag incident report">
        <div className="space-y-4">
          <p className="text-xs text-ct-muted">
            Tell administrators why this incident should be re-checked or marked resolved.
          </p>
          <Field label="Reason (min 5 characters)">
            <Textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              maxLength={300}
              placeholder="Explain what changed or appears inaccurate"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFlagTarget(null)}>
              Cancel
            </Button>
            <Button loading={flagBusy} disabled={flagReason.trim().length < 5} onClick={submitFlag}>
              Submit Flag
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!zoom} onClose={() => setZoom(null)} title="Evidence Photo" wide>
        {zoom && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={zoom} alt="Evidence" className="max-h-[75vh] w-full rounded-lg object-contain" />
        )}
      </Modal>
    </div>
  );
}
