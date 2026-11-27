"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Edit3, FlaskConical, GitBranch, Plus, Power, Trash2 } from "lucide-react";
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
  Textarea,
  useToast,
} from "@/components/ui";
import { departmentManager } from "@/lib/services";
import {
  INCIDENT_TYPES,
  SEVERITY,
  type Department,
  type District,
  type IncidentSeverity,
  type IncidentType,
  type RoutingRule,
} from "@/lib/types";

const SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "critical"];

type RuleForm = {
  name: string;
  description: string;
  enabled: boolean;
  is_fallback: boolean;
  priority_order: string;
  incident_categories: IncidentType[];
  district_ids: number[];
  severities: IncidentSeverity[];
  min_people_affected: string;
  require_photos: boolean;
  keywords: string;
  target_department_id: string;
  backup_department_id: string;
  set_priority: string;
  send_notification: boolean;
  escalation_minutes: string;
};

const emptyRuleForm = (departments: Department[], count: number): RuleForm => ({
  name: "",
  description: "",
  enabled: true,
  is_fallback: false,
  priority_order: String(count + 1),
  incident_categories: [],
  district_ids: [],
  severities: [],
  min_people_affected: "",
  require_photos: false,
  keywords: "",
  target_department_id: departments[0] ? String(departments[0].id) : "",
  backup_department_id: "",
  set_priority: "",
  send_notification: true,
  escalation_minutes: "",
});

export function RoutingRulesTab({
  rules,
  departments,
  districts,
  onChanged,
}: {
  rules: RoutingRule[];
  departments: Department[];
  districts: District[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRuleForm(departments, rules.length));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<RoutingRule | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  // Interactive rule tester
  const [testOpen, setTestOpen] = useState(false);
  const [testInput, setTestInput] = useState({
    category: "flood" as IncidentType,
    district_id: "",
    severity: "high" as IncidentSeverity,
    people_affected: "",
    photo_count: "1",
    description: "Water level rising fast near main road bridge.",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof departmentManager.testRules>> | null>(null);

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const distMap = new Map(districts.map((d) => [d.id, d.name]));

  function openCreate() {
    setEditing(null);
    setForm(emptyRuleForm(departments, rules.length));
    setFormErr(null);
    setModalOpen(true);
  }

  function openEdit(r: RoutingRule) {
    setEditing(r);
    setForm({
      name: r.name,
      description: r.description ?? "",
      enabled: r.enabled,
      is_fallback: r.is_fallback,
      priority_order: String(r.priority_order),
      incident_categories: r.incident_categories ?? [],
      district_ids: r.district_ids ?? [],
      severities: r.severities ?? [],
      min_people_affected: r.min_people_affected !== null && r.min_people_affected !== undefined ? String(r.min_people_affected) : "",
      require_photos: r.require_photos,
      keywords: r.keywords ?? "",
      target_department_id: String(r.target_department_id),
      backup_department_id: r.backup_department_id ? String(r.backup_department_id) : "",
      set_priority: r.set_priority ?? "",
      send_notification: r.send_notification,
      escalation_minutes: r.escalation_minutes ? String(r.escalation_minutes) : "",
    });
    setFormErr(null);
    setModalOpen(true);
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      const payload: Partial<RoutingRule> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        enabled: form.enabled,
        is_fallback: form.is_fallback,
        priority_order: Number(form.priority_order || 1),
        incident_categories: form.incident_categories,
        district_ids: form.district_ids,
        severities: form.severities,
        min_people_affected: form.min_people_affected ? Number(form.min_people_affected) : null,
        require_photos: form.require_photos,
        keywords: form.keywords.trim() || null,
        target_department_id: Number(form.target_department_id),
        backup_department_id: form.backup_department_id ? Number(form.backup_department_id) : null,
        set_priority: (form.set_priority as IncidentSeverity) || null,
        send_notification: form.send_notification,
        escalation_minutes: form.escalation_minutes ? Number(form.escalation_minutes) : null,
      };
      if (editing) {
        await departmentManager.updateRule(editing.id, payload);
        toast("ok", `Updated rule "${form.name.trim()}"`);
      } else {
        await departmentManager.createRule(payload);
        toast("ok", `Created rule "${form.name.trim()}"`);
      }
      setModalOpen(false);
      onChanged();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function moveOrder(r: RoutingRule, delta: -1 | 1) {
    const nextOrder = Math.max(1, r.priority_order + delta);
    try {
      await departmentManager.updateRule(r.id, { priority_order: nextOrder });
      onChanged();
    } catch (err) {
      toast("err", (err as Error).message);
    }
  }

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    try {
      const res = await departmentManager.testRules({
        category: testInput.category,
        district_id: testInput.district_id ? Number(testInput.district_id) : null,
        severity: testInput.severity,
        people_affected: testInput.people_affected ? Number(testInput.people_affected) : null,
        photo_count: Number(testInput.photo_count || 0),
        description: testInput.description,
      });
      setTestResult(res);
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Deterministic Routing Rules</h2>
          <p className="text-xs text-slate-400">
            Visual WHEN / THEN rules assign incidents to verified departments. Specificity wins first, then rule order (1 = highest).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setTestOpen((v) => !v)}>
            <FlaskConical className="h-4 w-4" /> Test Rule Simulator
          </Button>
          <Button size="sm" onClick={openCreate} disabled={departments.length === 0}>
            <Plus className="h-4 w-4" /> Add Routing Rule
          </Button>
        </div>
      </div>

      {departments.length === 0 && (
        <Notice tone="amber">
          Create at least one department in Department Directory before creating routing rules.
        </Notice>
      )}

      {testOpen && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Rule Conflict &amp; Simulation Tester</h3>
          <form onSubmit={runTest} className="grid gap-3 sm:grid-cols-3">
            <Field label="Incident Category">
              <Select
                value={testInput.category}
                onChange={(e) => setTestInput((s) => ({ ...s, category: e.target.value as IncidentType }))}
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="District">
              <Select
                value={testInput.district_id}
                onChange={(e) => setTestInput((s) => ({ ...s, district_id: e.target.value }))}
              >
                <option value="">Any / Unknown</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Severity">
              <Select
                value={testInput.severity}
                onChange={(e) => setTestInput((s) => ({ ...s, severity: e.target.value as IncidentSeverity }))}
              >
                {SEVERITIES.map((sv) => (
                  <option key={sv} value={sv}>
                    {SEVERITY[sv].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="People Affected">
              <Input
                type="number"
                min={0}
                value={testInput.people_affected}
                onChange={(e) => setTestInput((s) => ({ ...s, people_affected: e.target.value }))}
                placeholder="Optional"
              />
            </Field>
            <Field label="Photos Attached">
              <Input
                type="number"
                min={0}
                max={4}
                value={testInput.photo_count}
                onChange={(e) => setTestInput((s) => ({ ...s, photo_count: e.target.value }))}
              />
            </Field>
            <Field label="Sample Description">
              <Input
                value={testInput.description}
                onChange={(e) => setTestInput((s) => ({ ...s, description: e.target.value }))}
              />
            </Field>
            <div className="sm:col-span-3 flex justify-end">
              <Button type="submit" size="sm" loading={testing}>
                Run Simulation
              </Button>
            </div>
          </form>

          {testResult && (
            <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
              {testResult.matched && testResult.assigned_department ? (
                <Notice tone="cyan">
                  Matched rule <b>{testResult.matched_rule?.name}</b> (specificity{" "}
                  <span className="font-mono tabular-nums">{testResult.specificity}</span>) → Assigned to{" "}
                  <b>{testResult.assigned_department.name}</b>
                  {testResult.backup_department ? ` · Backup: ${testResult.backup_department.name}` : ""} · Effective priority:{" "}
                  <b className="uppercase">{testResult.effective_priority}</b>
                </Notice>
              ) : (
                <Notice tone="amber">
                  No routing rule matched. Incident would enter the Unassigned queue and notify administrators.
                </Notice>
              )}
              {testResult.evaluated.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1.5">Order</th>
                        <th>Rule</th>
                        <th>Target Dept</th>
                        <th>Specificity</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {testResult.evaluated.map((ev) => (
                        <tr key={ev.rule_id}>
                          <td className="py-1.5 font-mono tabular-nums text-slate-400">#{ev.priority_order}</td>
                          <td className="text-white">
                            {ev.rule_name} {ev.is_fallback ? "(Fallback)" : ""}
                          </td>
                          <td className="text-slate-300">{ev.department_name}</td>
                          <td className="font-mono tabular-nums text-slate-300">{ev.specificity}</td>
                          <td>
                            {ev.matched ? (
                              <Badge tone="green">Matched ({ev.reasons.join(", ") || "OK"})</Badge>
                            ) : (
                              <span className="text-slate-500">No match</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {rules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GitBranch className="h-5 w-5" />}
            title="No routing rules created"
            text="Define WHEN conditions (category, district, severity, keywords) and THEN actions (target department, escalation timeout)."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rules.map((r) => {
            const targetName = deptMap.get(r.target_department_id) ?? `Dept #${r.target_department_id}`;
            const backupName = r.backup_department_id ? deptMap.get(r.backup_department_id) : null;
            const whenParts: string[] = [];
            if (r.is_fallback) whenParts.push("Fallback when no specific rule matches");
            if (r.incident_categories.length)
              whenParts.push(`Category in [${r.incident_categories.map((c) => c.replace(/_/g, " ")).join(", ")}]`);
            if (r.district_ids.length)
              whenParts.push(`District in [${r.district_ids.map((id) => distMap.get(id) ?? `#${id}`).join(", ")}]`);
            if (r.severities.length) whenParts.push(`Severity in [${r.severities.join(", ")}]`);
            if (r.min_people_affected) whenParts.push(`People >= ${r.min_people_affected}`);
            if (r.require_photos) whenParts.push("Has photos");
            if (r.keywords) whenParts.push(`Keywords: ${r.keywords}`);

            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold tabular-nums text-cyan-300">
                        #{r.priority_order}
                      </span>
                      <h3 className="text-sm font-semibold text-white">{r.name}</h3>
                      {r.enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="amber">Disabled</Badge>}
                      {r.is_fallback && <Badge tone="cyan">Fallback</Badge>}
                    </div>
                    <p className="text-xs text-slate-300">
                      <span className="font-semibold text-slate-400">WHEN:</span>{" "}
                      {whenParts.length ? whenParts.join(" · ") : "Matches target department district/category coverage"}
                    </p>
                    <p className="text-xs text-slate-200">
                      <span className="font-semibold text-cyan-300">THEN:</span> Assign to <b>{targetName}</b>
                      {backupName ? ` · Backup: ${backupName}` : ""}
                      {r.set_priority ? ` · Set priority ${r.set_priority.toUpperCase()}` : ""}
                      {r.escalation_minutes ? ` · Escalate in ${r.escalation_minutes}m` : ""}
                      {r.send_notification ? " · Notify" : " · Silent assign"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => moveOrder(r, -1)} title="Move priority higher">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => moveOrder(r, 1)} title="Move priority lower">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await departmentManager.updateRule(r.id, { enabled: !r.enabled });
                        toast("ok", `${r.name} ${!r.enabled ? "enabled" : "disabled"}`);
                        onChanged();
                      }}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Duplicate rule"
                      onClick={async () => {
                        await departmentManager.duplicateRule(r.id);
                        toast("ok", "Rule duplicated (disabled by default)");
                        onChanged();
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                      <Edit3 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleting(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Routing Rule · ${editing.name}` : "Create Routing Rule"}
        wide
      >
        <form onSubmit={saveRule} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Rule Name *">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Critical Floods in Coastal Districts"
                />
              </Field>
            </div>
            <Field label="Priority Order (1 = highest)">
              <Input
                type="number"
                min={1}
                value={form.priority_order}
                onChange={(e) => setForm((s) => ({ ...s, priority_order: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="Explain when this rule should match"
            />
          </Field>

          <div className="rounded-xl border border-line bg-ink-900 p-3.5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">WHEN Conditions (AND across non-empty filters)</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_fallback}
                  onChange={(e) => setForm((s) => ({ ...s, is_fallback: e.target.checked }))}
                  className="rounded border-line accent-[#21C7D9]"
                />
                Default fallback rule (matches only if no specific rule matches)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={form.require_photos}
                  onChange={(e) => setForm((s) => ({ ...s, require_photos: e.target.checked }))}
                  className="rounded border-line accent-[#21C7D9]"
                />
                Require attached photos
              </label>
            </div>

            {!form.is_fallback && (
              <>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-300">Incident Categories (empty = any)</span>
                  <div className="grid max-h-28 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
                    {INCIDENT_TYPES.map((c) => (
                      <label key={c.value} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.incident_categories.includes(c.value)}
                          onChange={() =>
                            setForm((s) => ({
                              ...s,
                              incident_categories: s.incident_categories.includes(c.value)
                                ? s.incident_categories.filter((x) => x !== c.value)
                                : [...s.incident_categories, c.value],
                            }))
                          }
                          className="accent-[#21C7D9]"
                        />
                        <span className="truncate">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-300">Districts (empty = any)</span>
                  <div className="grid max-h-28 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
                    {districts.map((d) => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.district_ids.includes(d.id)}
                          onChange={() =>
                            setForm((s) => ({
                              ...s,
                              district_ids: s.district_ids.includes(d.id)
                                ? s.district_ids.filter((x) => x !== d.id)
                                : [...s.district_ids, d.id],
                            }))
                          }
                          className="accent-[#21C7D9]"
                        />
                        <span className="truncate">{d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-300">Severities (empty = any)</span>
                    <div className="flex flex-wrap gap-2">
                      {SEVERITIES.map((sv) => (
                        <label key={sv} className="flex cursor-pointer items-center gap-1 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={form.severities.includes(sv)}
                            onChange={() =>
                              setForm((s) => ({
                                ...s,
                                severities: s.severities.includes(sv)
                                  ? s.severities.filter((x) => x !== sv)
                                  : [...s.severities, sv],
                              }))
                            }
                            className="accent-[#21C7D9]"
                          />
                          {SEVERITY[sv].label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Field label="Min People Affected">
                    <Input
                      type="number"
                      min={0}
                      value={form.min_people_affected}
                      onChange={(e) => setForm((s) => ({ ...s, min_people_affected: e.target.value }))}
                      placeholder="Any"
                    />
                  </Field>
                  <Field label="Keywords (comma-separated)">
                    <Input
                      value={form.keywords}
                      onChange={(e) => setForm((s) => ({ ...s, keywords: e.target.value }))}
                      placeholder="bridge, hospital, highway"
                    />
                  </Field>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-line bg-ink-900 p-3.5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">THEN Actions</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assign Primary Department *">
                <Select
                  required
                  value={form.target_department_id}
                  onChange={(e) => setForm((s) => ({ ...s, target_department_id: e.target.value }))}
                >
                  <option value="">Select department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {!d.is_active ? "(Inactive)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Backup Department (optional)">
                <Select
                  value={form.backup_department_id}
                  onChange={(e) => setForm((s) => ({ ...s, backup_department_id: e.target.value }))}
                >
                  <option value="">Use department default</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimum Priority Override">
                <Select
                  value={form.set_priority}
                  onChange={(e) => setForm((s) => ({ ...s, set_priority: e.target.value }))}
                >
                  <option value="">Keep incident severity</option>
                  {SEVERITIES.map((sv) => (
                    <option key={sv} value={sv}>
                      {SEVERITY[sv].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Escalation Timeout (minutes)">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={form.escalation_minutes}
                  onChange={(e) => setForm((s) => ({ ...s, escalation_minutes: e.target.value }))}
                  placeholder="Optional override"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={form.send_notification}
                  onChange={(e) => setForm((s) => ({ ...s, send_notification: e.target.checked }))}
                  className="accent-[#21C7D9]"
                />
                Send configured department notifications automatically
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
                  className="accent-[#21C7D9]"
                />
                Rule enabled
              </label>
            </div>
          </div>

          {formErr && <Notice tone="amber">{formErr}</Notice>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save Rule" : "Create Rule"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Routing Rule"
        confirmLabel="Delete"
        message={`Delete routing rule "${deleting?.name}"?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await departmentManager.deleteRule(deleting.id);
            toast("ok", "Routing rule deleted");
            onChanged();
          } catch (err) {
            toast("err", (err as Error).message);
          }
        }}
      />
    </div>
  );
}
