"use client";
import { useState } from "react";
import { AlertTriangle, Clock, Play, Plus, Power, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  Select,
  useToast,
} from "@/components/ui";
import { fmtDate } from "@/lib/hooks";
import { departmentManager } from "@/lib/services";
import { SEVERITY, type Department, type EscalationLog, type EscalationRule, type IncidentSeverity } from "@/lib/types";

export function EscalationSettingsTab({
  rules,
  logs,
  departments,
  onChanged,
}: {
  rules: EscalationRule[];
  logs: EscalationLog[];
  departments: Department[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("critical");
  const [departmentId, setDepartmentId] = useState("");
  const [timeoutMinutes, setTimeoutMinutes] = useState("15");
  const [notifyAdmins, setNotifyAdmins] = useState(true);
  const [notifyBackup, setNotifyBackup] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState<EscalationRule | null>(null);

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await departmentManager.createEscalationRule({
        name: name.trim(),
        severity,
        department_id: departmentId ? Number(departmentId) : null,
        timeout_minutes: Number(timeoutMinutes || 15),
        notify_admins: notifyAdmins,
        notify_backup_department: notifyBackup,
        enabled: true,
      });
      toast("ok", "Escalation rule added");
      setModalOpen(false);
      setName("");
      onChanged();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await departmentManager.runEscalations();
      toast("ok", res.triggered > 0 ? `Escalated ${res.triggered} assignment(s)` : "No overdue unacknowledged assignments");
      onChanged();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Escalation Settings</h2>
          <p className="text-xs text-slate-400">
            Automatically escalate unacknowledged assignments after a configured timeout to backup departments and administrators.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={running} onClick={runNow}>
            <Play className="h-3.5 w-3.5" /> Run Escalation Check
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add Escalation Rule
          </Button>
        </div>
      </div>

      <Notice tone="cyan">
        Assignments remain marked unacknowledged until an authorized department officer explicitly clicks Accept or updates status in the Department Portal.
      </Notice>

      {rules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Clock className="h-5 w-5" />}
            title="No escalation rules configured"
            text="Define SLA timeouts by incident severity and department to guarantee overdue incidents alert backup agencies."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rules.map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-3 p-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">{r.name}</h3>
                  {r.enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="amber">Disabled</Badge>}
                </div>
                <p className="text-xs text-slate-300">
                  Severity: <b className="uppercase">{r.severity}</b> · Timeout:{" "}
                  <b className="font-mono tabular-nums text-cyan-300">{r.timeout_minutes} min</b>
                </p>
                <p className="text-xs text-slate-400">
                  Scope: {r.department_id ? deptMap.get(r.department_id) ?? `Dept #${r.department_id}` : "All departments"} ·{" "}
                  {r.notify_backup_department ? "Notify backup dept" : "No backup notify"} ·{" "}
                  {r.notify_admins ? "Alert admins" : "No admin alert"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await departmentManager.updateEscalationRule(r.id, { enabled: !r.enabled });
                    onChanged();
                  }}
                >
                  <Power className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(r)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <AlertTriangle className="h-4 w-4 text-amber-300" /> Escalation Logs ({logs.length})
        </h3>
        {logs.length === 0 ? (
          <EmptyState title="No escalations triggered" text="Escalation events appear here if a department fails to acknowledge within SLA." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Incident</th>
                  <th>Department</th>
                  <th>Backup Notified</th>
                  <th>Reason</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 font-mono text-cyan-300">{l.incident_code}</td>
                    <td className="text-white">{l.department_name}</td>
                    <td className="text-slate-300">{l.backup_department_name ?? "Admin only"}</td>
                    <td className="text-slate-300">{l.reason}</td>
                    <td className="text-slate-500">{fmtDate(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Escalation Rule">
        <form onSubmit={createRule} className="space-y-4">
          <Field label="Rule Name *">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Critical Emergency 15-min SLA"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Incident Severity">
              <Select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}>
                {(["low", "medium", "high", "critical"] as IncidentSeverity[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Timeout (minutes)">
              <Input
                type="number"
                min={1}
                max={1440}
                value={timeoutMinutes}
                onChange={(e) => setTimeoutMinutes(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Department (optional)">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-2 text-xs text-slate-200">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyBackup}
                onChange={(e) => setNotifyBackup(e.target.checked)}
                className="accent-[#21C7D9]"
              />
              Notify assigned backup department
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyAdmins}
                onChange={(e) => setNotifyAdmins(e.target.checked)}
                className="accent-[#21C7D9]"
              />
              Send urgent alert to administrators
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create Rule
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Escalation Rule"
        confirmLabel="Delete"
        message={`Delete "${deleting?.name}"?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await departmentManager.deleteEscalationRule(deleting.id);
          toast("ok", "Escalation rule deleted");
          onChanged();
        }}
      />
    </div>
  );
}
