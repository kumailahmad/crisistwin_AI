"use client";
import { useState } from "react";
import { AlertOctagon, Bot, CheckCircle2, Clock, RefreshCw, Send, ShieldAlert, Truck, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatCard,
  useToast,
} from "@/components/ui";
import { fmtDate } from "@/lib/hooks";
import { departmentManager } from "@/lib/services";
import {
  INCIDENT_TYPES,
  SEVERITY,
  type Department,
  type DepartmentAnalytics,
  type DepartmentResponseRecord,
  type District,
  type IncidentAssignment,
  type IncidentSeverity,
  type IncidentType,
  type WorkflowStatus,
} from "@/lib/types";

type UnassignedItem = {
  id: number;
  code: string;
  type: IncidentType;
  severity: IncidentSeverity;
  district_name: string | null;
  status: string;
  workflow_status: WorkflowStatus;
  ai_analysis_status: string;
  ai_recommended_category: IncidentType | null;
  ai_recommended_severity: IncidentSeverity | null;
  ai_confidence: number | null;
  ai_image_summary: string | null;
  created_at: string;
};

const WORKFLOW_TONE: Record<WorkflowStatus, "amber" | "cyan" | "green" | "red" | "neutral"> = {
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

export function AssignmentMonitorTab({
  analytics,
  assignments,
  unassigned,
  responses,
  departments,
  districts,
  filters,
  onFiltersChange,
  onReload,
}: {
  analytics: DepartmentAnalytics;
  assignments: IncidentAssignment[];
  unassigned: UnassignedItem[];
  responses: DepartmentResponseRecord[];
  departments: Department[];
  districts: District[];
  filters: { district_id: string; department_id: string; type: string; severity: string; from: string; to: string };
  onFiltersChange: (next: { district_id: string; department_id: string; type: string; severity: string; from: string; to: string }) => void;
  onReload: () => void;
}) {
  const toast = useToast();
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const [assignTarget, setAssignTarget] = useState<UnassignedItem | null>(null);
  const [assignDeptId, setAssignDeptId] = useState("");
  const [assignPriority, setAssignPriority] = useState<IncidentSeverity>("high");
  const [assignNotify, setAssignNotify] = useState(true);
  const [assignBusy, setAssignBusy] = useState(false);

  async function reprocess(iid: number) {
    setReprocessingId(iid);
    try {
      const res = await departmentManager.reprocessIncident(iid);
      toast(
        "ok",
        res.assigned_department_name
          ? `Assigned to ${res.assigned_department_name}`
          : `Processed (${res.workflow_status})`
      );
      onReload();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setReprocessingId(null);
    }
  }

  async function submitManualAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTarget || !assignDeptId) return;
    setAssignBusy(true);
    try {
      await departmentManager.manualAssignIncident(assignTarget.id, {
        department_id: Number(assignDeptId),
        priority: assignPriority,
        send_notification: assignNotify,
      });
      toast("ok", `Assigned ${assignTarget.code}`);
      setAssignTarget(null);
      onReload();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setAssignBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Incident Reports" value={analytics.total_reports} icon={<Truck className="h-4 w-4" />} accent="#21C7D9" />
        <StatCard
          label="Auto-Assigned"
          value={analytics.auto_assigned_reports}
          hint={`${analytics.unassigned_reports} unassigned`}
          icon={<Bot className="h-4 w-4" />}
          accent="#34d399"
        />
        <StatCard
          label="Pending Acknowledgements"
          value={analytics.pending_acknowledgements}
          hint={`${analytics.active_escalations} escalated`}
          icon={<Clock className="h-4 w-4" />}
          accent="#fbbf24"
        />
        <StatCard
          label="Resolved / Failures"
          value={`${analytics.resolved_incidents} / ${analytics.notification_failures}`}
          hint={`${analytics.ai_classification_failures} AI classification error(s)`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="#a5b4fc"
        />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Select
            aria-label="Filter by district"
            value={filters.district_id}
            onChange={(e) => onFiltersChange({ ...filters, district_id: e.target.value })}
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by department"
            value={filters.department_id}
            onChange={(e) => onFiltersChange({ ...filters, department_id: e.target.value })}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by category"
            value={filters.type}
            onChange={(e) => onFiltersChange({ ...filters, type: e.target.value })}
          >
            <option value="">All categories</option>
            {INCIDENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by severity"
            value={filters.severity}
            onChange={(e) => onFiltersChange({ ...filters, severity: e.target.value })}
          >
            <option value="">All severities</option>
            {(["low", "medium", "high", "critical"] as IncidentSeverity[]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY[s].label}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            aria-label="From date"
            value={filters.from}
            onChange={(e) => onFiltersChange({ ...filters, from: e.target.value })}
          />
          <Input
            type="date"
            aria-label="To date"
            value={filters.to}
            onChange={(e) => onFiltersChange({ ...filters, to: e.target.value })}
          />
        </div>
      </Card>

      {/* Unassigned / Awaiting Verification Queue */}
      {unassigned.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-300" /> Unassigned &amp; Human Review Queue ({unassigned.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Code</th>
                  <th>Category / Severity</th>
                  <th>District</th>
                  <th>Workflow / AI</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {unassigned.map((u) => (
                  <tr key={u.id} className="hover:bg-ink-800/40">
                    <td className="py-2 font-mono text-cyan-300">{u.code}</td>
                    <td className="text-white">
                      {u.type.replace(/_/g, " ")} · <span className="uppercase">{u.severity}</span>
                      {u.ai_recommended_category && (
                        <span className="block text-[11px] text-slate-400">
                          AI: {u.ai_recommended_category} ({u.ai_recommended_severity})
                        </span>
                      )}
                    </td>
                    <td className="text-slate-300">{u.district_name ?? "Unspecified"}</td>
                    <td>
                      <Badge tone={WORKFLOW_TONE[u.workflow_status]}>{u.workflow_status.replace(/_/g, " ")}</Badge>
                      <span className="ml-1.5 text-[11px] text-slate-400">AI: {u.ai_analysis_status}</span>
                    </td>
                    <td className="text-slate-500">{fmtDate(u.created_at)}</td>
                    <td className="space-x-1.5 whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={reprocessingId === u.id}
                        onClick={() => reprocess(u.id)}
                      >
                        <RefreshCw className="h-3 w-3" /> Re-run Agent
                      </Button>
                      <Button
                        size="sm"
                        disabled={departments.length === 0}
                        onClick={() => {
                          setAssignTarget(u);
                          setAssignDeptId(departments[0] ? String(departments[0].id) : "");
                          setAssignPriority(u.severity);
                          setAssignNotify(true);
                        }}
                      >
                        <Send className="h-3 w-3" /> Assign
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Department-wise breakdown */}
      {analytics.by_department.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="h-4 w-4 text-cyan-300" /> Department-wise Assignment Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Department</th>
                  <th>Total</th>
                  <th>Pending Ack</th>
                  <th>Escalated</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {analytics.by_department.map((row) => (
                  <tr key={row.department_id}>
                    <td className="py-2 font-medium text-white">{row.department_name}</td>
                    <td className="font-mono tabular-nums text-slate-200">{row.total}</td>
                    <td className="font-mono tabular-nums text-amber-300">{row.pending}</td>
                    <td className="font-mono tabular-nums text-red-300">{row.escalated}</td>
                    <td className="font-mono tabular-nums text-emerald-300">{row.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Assignments Table */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Active &amp; Recent Department Assignments ({assignments.length})</h3>
        {assignments.length === 0 ? (
          <EmptyState
            icon={<AlertOctagon className="h-5 w-5" />}
            title="No department assignments yet"
            text="Assignments appear automatically when routing rules match incoming incidents or after manual admin assignment."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Incident</th>
                  <th>Department</th>
                  <th>Rule</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Personnel</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-ink-800/40">
                    <td className="py-2">
                      <span className="font-mono text-cyan-300">{a.incident_code}</span>
                      <span className="block text-[11px] text-slate-400">
                        {a.incident_type.replace(/_/g, " ")} · {a.district_name ?? "Balochistan"}
                      </span>
                    </td>
                    <td className="font-medium text-white">{a.department_name}</td>
                    <td className="text-slate-300">{a.routing_rule_name ?? "Manual"}</td>
                    <td>
                      <span
                        className="font-semibold uppercase"
                        style={{ color: SEVERITY[a.priority]?.color ?? "#21C7D9" }}
                      >
                        {a.priority}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={WORKFLOW_TONE[a.status]}>{a.status.replace(/_/g, " ")}</Badge>
                        {a.escalated && <Badge tone="red">Escalated L{a.escalation_level}</Badge>}
                      </div>
                    </td>
                    <td className="text-slate-300">{a.assigned_personnel ?? "—"}</td>
                    <td className="text-slate-500">{fmtDate(a.assigned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Department Responses Audit */}
      {responses.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Department Officer Response Audit Trail</h3>
          <div className="space-y-2 text-xs">
            {responses.slice(0, 20).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 pb-2">
                <div>
                  <b className="text-white">{r.user_name}</b>{" "}
                  <span className="text-cyan-300">{r.action.replace(/_/g, " ")}</span>{" "}
                  <span className="text-slate-400">→ {r.status_after.replace(/_/g, " ")}</span>
                  {r.note && <span className="ml-2 text-slate-300">— {r.note}</span>}
                </div>
                <span className="text-slate-500">{fmtDate(r.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Assign Department · ${assignTarget.code}` : "Assign Department"}
      >
        {assignTarget && (
          <form onSubmit={submitManualAssign} className="space-y-4">
            <Field label="Target Department *">
              <Select required value={assignDeptId} onChange={(e) => setAssignDeptId(e.target.value)}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {!d.is_active ? "(Inactive)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignment Priority">
              <Select
                value={assignPriority}
                onChange={(e) => setAssignPriority(e.target.value as IncidentSeverity)}
              >
                {(["low", "medium", "high", "critical"] as IncidentSeverity[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={assignNotify}
                onChange={(e) => setAssignNotify(e.target.checked)}
                className="accent-[#21C7D9]"
              />
              Deliver configured department notifications immediately
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAssignTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={assignBusy}>
                Confirm Assignment
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
