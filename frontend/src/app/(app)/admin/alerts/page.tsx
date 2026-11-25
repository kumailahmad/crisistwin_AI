"use client";
import { useState } from "react";
import { CheckCircle2, Clock, Pencil, Plus, Send, ShieldAlert, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { alerts, districts } from "@/lib/services";
import type { AlertItem } from "@/lib/types";

const SEV_TONE: Record<AlertItem["severity"], "cyan" | "amber" | "orange" | "red"> = {
  advisory: "cyan",
  watch: "amber",
  warning: "orange",
  emergency: "red",
};

const ST_TONE: Record<AlertItem["status"], "amber" | "green" | "neutral"> = {
  draft: "amber",
  published: "green",
  expired: "neutral",
};

export default function AdminAlertsPage() {
  const toast = useToast();
  const q = useAsync(() => alerts.list({ all: true }), [], "admin-alerts");
  const ds = useAsync(() => districts.list(), [], "districts");

  const [edit, setEdit] = useState<AlertItem | "new" | null>(null);
  const [del, setDel] = useState<AlertItem | null>(null);

  async function quickStatus(a: AlertItem, status: AlertItem["status"]) {
    try {
      await alerts.update(a.id, { status });
      toast("ok", `Alert marked ${status}`);
      q.reload();
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }

  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;

  return (
    <>
      <PageHeader
        title="Alert management"
        subtitle="Draft, publish, target districts, and expire public alerts. Published alerts notify opted-in users and appear on citizen dashboards."
        actions={
          <Button onClick={() => setEdit("new")}>
            <Plus className="h-4 w-4" /> New public alert
          </Button>
        }
      />

      <Card>
        {q.loading ? (
          <Skeleton className="m-5 h-32" />
        ) : !q.data?.length ? (
          <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="No alerts created yet" text="Create a draft or publish an official public advisory or warning." />
        ) : (
          <ul className="divide-y divide-line/60">
            {q.data.map((a) => (
              <li key={a.id} className="space-y-2 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEV_TONE[a.severity]}>{a.severity.toUpperCase()}</Badge>
                    <Badge tone={ST_TONE[a.status]}>{a.status}</Badge>
                    <span className="font-semibold text-white">{a.title}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.status !== "published" && (
                      <Button size="sm" onClick={() => quickStatus(a, "published")}>
                        <Send className="h-3.5 w-3.5" /> Publish
                      </Button>
                    )}
                    {a.status === "published" && (
                      <Button size="sm" variant="outline" onClick={() => quickStatus(a, "expired")}>
                        <Clock className="h-3.5 w-3.5" /> Expire
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEdit(a)} aria-label="Edit alert">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDel(a)} aria-label="Delete alert">
                      <Trash2 className="h-3.5 w-3.5 text-red-300" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-slate-300">{a.message}</p>
                <p className="text-xs text-cyan-200">Guidance: {a.safety_instructions}</p>
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span>Scope: {a.district_names?.length ? a.district_names.join(", ") : "All districts"}</span>
                  <span>Hazard: {a.hazard_type}</span>
                  <span>Source: {a.source}</span>
                  <span>Deliveries: {a.delivery_count}</span>
                  <span>Created {fmtDate(a.created_at)}</span>
                  {a.expires_at && <span>Expires {fmtDate(a.expires_at)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {edit && (
        <AlertModal
          initial={edit === "new" ? null : edit}
          districtsList={ds.data ?? []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            q.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={!!del}
        title="Delete alert"
        message={`Permanently delete “${del?.title}”?`}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          try {
            await alerts.remove(del!.id);
            toast("ok", "Alert deleted");
            q.reload();
          } catch (e) {
            toast("err", (e as Error).message);
          }
        }}
      />
    </>
  );
}

function AlertModal({
  initial,
  districtsList,
  onClose,
  onSaved,
}: {
  initial: AlertItem | null;
  districtsList: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [message, setMessage] = useState(initial?.message ?? "");
  const [severity, setSeverity] = useState<AlertItem["severity"]>(initial?.severity ?? "advisory");
  const [hazardType, setHazardType] = useState(initial?.hazard_type ?? "flood");
  const [safety, setSafety] = useState(initial?.safety_instructions ?? "Move away from seasonal riverbeds (nullahs) and follow local district instructions.");
  const [source, setSource] = useState(initial?.source ?? "PDMA Balochistan");
  const [status, setStatus] = useState<AlertItem["status"]>(initial?.status ?? "published");
  const [selectedDistricts, setSelectedDistricts] = useState<number[]>(initial?.district_ids ?? []);
  const [expiresAt, setExpiresAt] = useState(initial?.expires_at ? initial.expires_at.slice(0, 16) : "");
  const [busy, setBusy] = useState(false);

  function toggleDistrict(id: number) {
    setSelectedDistricts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const bad = title.trim().length < 3 || message.trim().length < 10 || source.trim().length < 2;

  async function save() {
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        message: message.trim(),
        severity,
        hazard_type: hazardType,
        district_ids: selectedDistricts,
        safety_instructions: safety.trim(),
        source: source.trim(),
        status,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (initial) await alerts.update(initial.id, payload);
      else await alerts.create(payload);
      toast("ok", initial ? "Alert updated" : status === "published" ? "Alert published" : "Alert draft saved");
      onSaved();
    } catch (e) {
      toast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? "Edit alert" : "Create public alert"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Flash Flood Watch — Nasirabad & Jafarabad" />
          </Field>
        </div>
        <Field label="Severity">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as AlertItem["severity"])}>
            <option value="advisory">Advisory</option>
            <option value="watch">Watch</option>
            <option value="warning">Warning</option>
            <option value="emergency">Emergency</option>
          </Select>
        </Field>
        <Field label="Hazard type">
          <Select value={hazardType} onChange={(e) => setHazardType(e.target.value)}>
            <option value="flood">Flood / Flash flood</option>
            <option value="heavy_rain">Heavy rainfall</option>
            <option value="earthquake">Earthquake</option>
            <option value="landslide">Landslide</option>
            <option value="heatwave">Heatwave / Drought</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Alert message">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Clear public statement describing the hazard, affected zones, and expected timeline." />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Safety instructions">
            <Textarea value={safety} onChange={(e) => setSafety(e.target.value)} maxLength={1000} />
          </Field>
        </div>
        <Field label="Authoritative source (required)">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="PDMA Balochistan / PMD" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AlertItem["status"])}>
            <option value="published">Published (notify citizens)</option>
            <option value="draft">Draft (internal only)</option>
            <option value="expired">Expired</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Expires at (optional)">
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Target districts ({selectedDistricts.length === 0 ? "All districts" : `${selectedDistricts.length} selected`})</span>
            {selectedDistricts.length > 0 && (
              <button type="button" onClick={() => setSelectedDistricts([])} className="text-xs text-cyan-300 hover:underline">
                Clear (province-wide)
              </button>
            )}
          </div>
          <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-auto rounded-xl border border-line bg-ink-900 p-3 sm:grid-cols-3">
            {districtsList.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="accent-cyan-400" checked={selectedDistricts.includes(d.id)} onChange={() => toggleDistrict(d.id)} />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={bad} onClick={save}>
            <CheckCircle2 className="h-4 w-4" /> Save alert
          </Button>
        </div>
      </div>
    </Modal>
  );
}
