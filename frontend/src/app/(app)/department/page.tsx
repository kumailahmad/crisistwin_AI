"use client";
import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Inbox,
  MapPin,
  RefreshCw,
  Shield,
  Truck,
  UserCheck,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Textarea,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { departmentPortal, type DepartmentPortalItem } from "@/lib/services";
import { INCIDENT_TYPES, SEVERITY, type DepartmentResponseRecord, type WorkflowStatus } from "@/lib/types";

const STATUS_BADGE: Record<WorkflowStatus, "amber" | "cyan" | "green" | "red" | "neutral"> = {
  submitted: "neutral",
  ai_processing: "cyan",
  awaiting_verification: "amber",
  assigned: "amber",
  notified: "cyan",
  accepted: "cyan",
  in_progress: "cyan",
  resolved: "green",
  rejected: "red",
  unassigned: "red",
};

export default function DepartmentPortalPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [adminDeptId, setAdminDeptId] = useState<string>("");
  const q = useAsync(
    () => departmentPortal.listAssignments(adminDeptId ? Number(adminDeptId) : undefined),
    [adminDeptId]
  );

  const [selected, setSelected] = useState<DepartmentPortalItem | null>(null);
  const [personnel, setPersonnel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function openItem(item: DepartmentPortalItem) {
    setSelected(item);
    setPersonnel(item.assignment.assigned_personnel ?? "");
    setNote("");
  }

  async function respond(action: DepartmentResponseRecord["action"], status?: WorkflowStatus) {
    if (!selected) return;
    if (action === "rejected" && note.trim().length < 3) {
      toast("err", "Please enter a brief rejection reason in the note box first.");
      return;
    }
    setBusy(true);
    try {
      const res = await departmentPortal.respond(selected.assignment.id, {
        action,
        status,
        assigned_personnel: personnel.trim() || null,
        note: note.trim() || null,
      });
      toast("ok", `Updated ${selected.assignment.incident_code}: ${res.assignment.status.replace(/_/g, " ")}`);
      setSelected(null);
      q.reload();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = q.data?.items ?? [];
  const pendingCount = items.filter(
    (x) => x.assignment.status === "assigned" || x.assignment.status === "notified"
  ).length;
  const activeCount = items.filter(
    (x) => x.assignment.status === "accepted" || x.assignment.status === "in_progress"
  ).length;
  const resolvedCount = items.filter((x) => x.assignment.status === "resolved").length;
  const escalatedCount = items.filter((x) => x.assignment.escalated && x.assignment.status !== "resolved").length;

  const typeMeta = (v: string) => INCIDENT_TYPES.find((t) => t.value === v);

  return (
    <div className="space-y-5">
      <PageHeader
        title={q.data?.department ? `${q.data.department.name} · Response Portal` : "Department Response Portal"}
        subtitle="Inspect assigned emergency incidents, assign field personnel, update response progress, and acknowledge SLA dispatches. Private citizen identities are redacted."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {user?.role === "admin" && (q.data?.departments?.length ?? 0) > 0 && (
              <Select
                className="w-56"
                aria-label="Filter department"
                value={adminDeptId}
                onChange={(e) => setAdminDeptId(e.target.value)}
              >
                <option value="">All Departments (Admin View)</option>
                {(q.data?.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
            {user?.role === "admin" && (
              <Link
                href="/admin/departments"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-ct-border bg-ct-surface px-3 py-1.5 text-xs font-medium text-ct-text hover:border-[#21C7D9]"
              >
                <Shield className="h-3.5 w-3.5 text-[#21C7D9]" /> Department Manager
              </Link>
            )}
            <Button size="sm" variant="outline" onClick={q.reload} loading={q.loading}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending Acknowledgement" value={pendingCount} icon={<Inbox className="h-4 w-4" />} accent="#fbbf24" />
        <StatCard label="Active / In Progress" value={activeCount} icon={<Truck className="h-4 w-4" />} accent="#21C7D9" />
        <StatCard label="Escalated Alerts" value={escalatedCount} icon={<Clock className="h-4 w-4" />} accent="#ef4444" />
        <StatCard label="Resolved Dispatches" value={resolvedCount} icon={<CheckCircle2 className="h-4 w-4" />} accent="#34d399" />
      </div>

      {q.loading ? (
        <Skeleton className="h-44 w-full" />
      ) : q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="No assigned incidents"
            text="New emergency reports routed to your department will appear here immediately."
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const { assignment: a, incident: inc } = item;
            const tm = typeMeta(a.incident_type);
            return (
              <Card
                key={a.id}
                onClick={() => openItem(item)}
                className="cursor-pointer p-4 transition hover:border-cyan-400/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-300">{a.incident_code}</span>
                    <span className="text-xs text-slate-400">· {a.department_name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.escalated && <Badge tone="red">Escalated L{a.escalation_level}</Badge>}
                    <span
                      className="rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase"
                      style={{
                        color: SEVERITY[a.priority]?.color ?? "#21C7D9",
                        borderColor: (SEVERITY[a.priority]?.color ?? "#21C7D9") + "55",
                      }}
                    >
                      {a.priority}
                    </span>
                    <Badge tone={STATUS_BADGE[a.status]}>{a.status.replace(/_/g, " ")}</Badge>
                  </div>
                </div>

                <p className="mt-2 font-medium text-white">
                  {tm?.emoji} {tm?.label ?? a.incident_type.replace(/_/g, " ")}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-300">
                  {inc?.description ?? "Incident details unavailable."}
                </p>

                {inc?.ai_image_summary && (
                  <p className="mt-1.5 text-xs text-cyan-200/90">AI Image Note: {inc.ai_image_summary}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {a.district_name ?? "Balochistan"} · Assigned {fmtDate(a.assigned_at)}
                    {a.assigned_personnel ? ` · Unit: ${a.assigned_personnel}` : ""}
                  </span>
                  <span className="font-semibold text-cyan-300">Respond →</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Dispatch ${selected.assignment.incident_code} · ${selected.assignment.department_name}` : ""}
        wide
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone={STATUS_BADGE[selected.assignment.status]}>
                {selected.assignment.status.replace(/_/g, " ")}
              </Badge>
              <Badge>{selected.assignment.priority.toUpperCase()}</Badge>
              {selected.assignment.district_name && <Badge tone="cyan">{selected.assignment.district_name}</Badge>}
              {selected.assignment.escalated && <Badge tone="red">Escalated</Badge>}
            </div>

            {selected.incident ? (
              <>
                <p className="whitespace-pre-wrap text-slate-200">{selected.incident.description}</p>
                {selected.incident.ai_image_summary && (
                  <Notice tone="cyan">
                    <b>AI Photo Analysis:</b> {selected.incident.ai_image_summary}
                  </Notice>
                )}
                <dl className="grid gap-2 rounded-xl border border-line bg-ink-900 p-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Coordinates</dt>
                    <dd className="font-mono text-slate-200">
                      {selected.incident.latitude.toFixed(5)}, {selected.incident.longitude.toFixed(5)}{" "}
                      <a
                        className="ml-1 inline-flex items-center gap-0.5 text-cyan-300 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.openstreetmap.org/?mlat=${selected.incident.latitude}&mlon=${selected.incident.longitude}#map=16/${selected.incident.latitude}/${selected.incident.longitude}`}
                      >
                        Map <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Landmark / Place</dt>
                    <dd className="text-slate-200">{selected.incident.place_text ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">People Affected</dt>
                    <dd className="text-slate-200">{selected.incident.people_affected ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Reporter Contact Phone</dt>
                    <dd className="text-slate-200">
                      {selected.incident.contact_phone ? (
                        <a className="text-cyan-300" href={`tel:${selected.incident.contact_phone}`}>
                          {selected.incident.contact_phone}
                        </a>
                      ) : (
                        "Redacted / Not provided"
                      )}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <Notice tone="amber">Incident record is unavailable.</Notice>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assigned Response Personnel / Unit">
                <Input
                  value={personnel}
                  onChange={(e) => setPersonnel(e.target.value)}
                  placeholder="e.g. Squad Bravo · Inspector Tariq"
                />
              </Field>
              <Field label="Note / Progress Update / Rejection Reason">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Enter dispatch update, field status, or reason if rejecting..."
                />
              </Field>
            </div>

            {selected.responses.length > 0 && (
              <div className="rounded-xl border border-line bg-ink-900 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Response Audit Trail
                </p>
                <ol className="space-y-1.5 text-xs">
                  {selected.responses.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 pb-1.5">
                      <span>
                        <b className="text-white">{r.user_name}</b> ·{" "}
                        <span className="text-cyan-300">{r.action.replace(/_/g, " ")}</span>{" "}
                        <span className="text-slate-400">→ {r.status_after.replace(/_/g, " ")}</span>
                        {r.assigned_personnel && <span className="text-slate-300"> · Unit: {r.assigned_personnel}</span>}
                        {r.note && <span className="text-slate-300"> — {r.note}</span>}
                      </span>
                      <span className="text-slate-500">{fmtDate(r.created_at)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" size="sm" loading={busy} onClick={() => respond("rejected")}>
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </Button>
                <Button variant="outline" size="sm" loading={busy} onClick={() => respond("request_info")}>
                  <HelpCircle className="h-3.5 w-3.5" /> Request Info
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" loading={busy} onClick={() => respond("assigned_personnel")}>
                  <UserCheck className="h-3.5 w-3.5" /> Save Personnel / Note
                </Button>
                <Button variant="outline" size="sm" loading={busy} onClick={() => respond("accepted")}>
                  Accept
                </Button>
                <Button variant="outline" size="sm" loading={busy} onClick={() => respond("status_update", "in_progress")}>
                  In Progress
                </Button>
                <Button size="sm" loading={busy} onClick={() => respond("resolved")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Resolved
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
