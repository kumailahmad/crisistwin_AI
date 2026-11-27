"use client";
import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Save } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, useToast } from "@/components/ui";
import { fmtDate } from "@/lib/hooks";
import { departmentManager } from "@/lib/services";
import type { AgentConfiguration, AgentExecutionLog } from "@/lib/types";

export function AgentSettingsTab({
  config,
  groqConfigured,
  executionLogs,
  onChanged,
}: {
  config: AgentConfiguration;
  groqConfigured: boolean;
  executionLogs: AgentExecutionLog[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(config);
  }, [config]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await departmentManager.updateAgentConfig(form);
      toast("ok", "AI Agent settings saved");
      onChanged();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">Centralized Incident Intelligence Agent</h2>
            <p className="text-xs text-slate-400">
              Groq AI classifies descriptions &amp; analyzes uploaded images. Deterministic backend routing rules perform actual department assignments.
            </p>
          </div>
          {groqConfigured ? (
            <Badge tone="green">
              <CheckCircle2 className="h-3 w-3" /> Groq API Connected
            </Badge>
          ) : (
            <Badge tone="amber">GROQ_API_KEY Missing</Badge>
          )}
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-ink-900 p-3 text-xs">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
                className="mt-0.5 accent-[#21C7D9]"
              />
              <span>
                <b className="block text-sm text-white">Enable Incident Intelligence Agent</b>
                <span className="text-slate-400">Automatically process newly submitted citizen &amp; guest reports asynchronously.</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-ink-900 p-3 text-xs">
              <input
                type="checkbox"
                checked={form.auto_assign}
                onChange={(e) => setForm((s) => ({ ...s, auto_assign: e.target.checked }))}
                className="mt-0.5 accent-[#21C7D9]"
              />
              <span>
                <b className="block text-sm text-white">Enable Auto-Assignment</b>
                <span className="text-slate-400">Match against active routing rules and dispatch department notifications immediately.</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-ink-900 p-3 text-xs">
              <input
                type="checkbox"
                checked={form.analyze_images_with_vision}
                onChange={(e) => setForm((s) => ({ ...s, analyze_images_with_vision: e.target.checked }))}
                className="mt-0.5 accent-[#21C7D9]"
              />
              <span>
                <b className="block text-sm text-white">Analyze Uploaded Images (Groq Vision)</b>
                <span className="text-slate-400">Inspect emergency photos to verify hazard type, visible damage, and severity cues.</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-ink-900 p-3 text-xs">
              <input
                type="checkbox"
                checked={form.require_human_verification}
                onChange={(e) => setForm((s) => ({ ...s, require_human_verification: e.target.checked }))}
                className="mt-0.5 accent-[#21C7D9]"
              />
              <span>
                <b className="block text-sm text-white">Require Human Verification Before Routing</b>
                <span className="text-slate-400">Hold AI-classified incidents in the review queue for admin sign-off before department dispatch.</span>
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Groq Classification Model">
              <Input
                value={form.classification_model}
                onChange={(e) => setForm((s) => ({ ...s, classification_model: e.target.value }))}
              />
            </Field>
            <Field label="Groq Vision Model">
              <Input
                value={form.vision_model}
                onChange={(e) => setForm((s) => ({ ...s, vision_model: e.target.value }))}
              />
            </Field>
            <Field label="AI Confidence Threshold (0–1)">
              <Input
                type="number"
                step="0.05"
                min={0}
                max={1}
                value={form.confidence_threshold}
                onChange={(e) => setForm((s) => ({ ...s, confidence_threshold: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Max Notification Retries (1–5)">
              <Input
                type="number"
                min={1}
                max={5}
                value={form.max_notification_retries}
                onChange={(e) => setForm((s) => ({ ...s, max_notification_retries: Number(e.target.value) }))}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-6 text-xs text-slate-200">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_admin_on_unassigned}
                onChange={(e) => setForm((s) => ({ ...s, notify_admin_on_unassigned: e.target.checked }))}
                className="accent-[#21C7D9]"
              />
              Alert admins when no routing rule matches
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_admin_on_ai_failure}
                onChange={(e) => setForm((s) => ({ ...s, notify_admin_on_ai_failure: e.target.checked }))}
                className="accent-[#21C7D9]"
              />
              Alert admins when AI classification fails
            </label>
          </div>

          {!groqConfigured && (
            <Notice tone="amber">
              Set <code>GROQ_API_KEY</code> in environment Secrets to activate live Groq classification and vision analysis. Incidents without AI will still be saved and routed to the review queue.
            </Notice>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={saving}>
              <Save className="h-3.5 w-3.5" /> Save Agent Settings
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Recent AI Agent Execution Logs</h3>
        {executionLogs.length === 0 ? (
          <EmptyState
            icon={<Bot className="h-5 w-5" />}
            title="No agent runs recorded yet"
            text="Execution traces will appear here after reports are processed by the Incident Intelligence Agent."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Incident</th>
                  <th>Status</th>
                  <th>AI Recommendation</th>
                  <th>Confidence</th>
                  <th>Matched Rule / Dept</th>
                  <th>Latency</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {executionLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-ink-800/40">
                    <td className="py-2 font-mono text-cyan-300">{log.incident_code}</td>
                    <td>
                      {log.status === "completed" ? (
                        <Badge tone="green">Completed</Badge>
                      ) : log.status === "unassigned" ? (
                        <Badge tone="amber">Unassigned</Badge>
                      ) : log.status === "failed" ? (
                        <Badge tone="red">Failed</Badge>
                      ) : (
                        <Badge tone="neutral">{log.status}</Badge>
                      )}
                    </td>
                    <td className="text-slate-200">
                      {log.recommended_category ? `${log.recommended_category} · ${log.recommended_severity}` : "—"}
                      {log.error_message && <span className="block text-[11px] text-red-300">{log.error_message}</span>}
                    </td>
                    <td className="font-mono tabular-nums text-slate-300">
                      {log.confidence !== null ? `${Math.round(log.confidence * 100)}%` : "—"}
                    </td>
                    <td className="text-slate-300">
                      {log.assigned_department_name
                        ? `${log.assigned_department_name} (${log.matched_rule_name ?? "Manual"})`
                        : "Review queue"}
                    </td>
                    <td className="font-mono tabular-nums text-slate-400">{log.duration_ms} ms</td>
                    <td className="text-slate-500">{fmtDate(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
