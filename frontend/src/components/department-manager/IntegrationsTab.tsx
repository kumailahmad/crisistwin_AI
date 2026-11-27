"use client";
import { useState } from "react";
import { CheckCircle2, Edit3, Plus, Send, ShieldCheck, Trash2, Webhook } from "lucide-react";
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
import type { Department, NotificationChannelType, NotificationIntegration } from "@/lib/types";

const CHANNELS: { value: NotificationChannelType; label: string; providers: string }[] = [
  { value: "email", label: "Email (Resend / HTTPS Relay)", providers: "resend" },
  { value: "webhook", label: "Webhook (Signed HTTPS POST)", providers: "https-webhook" },
  { value: "sms", label: "SMS Gateway (Twilio / Custom)", providers: "twilio" },
  { value: "whatsapp", label: "WhatsApp Business Cloud API", providers: "meta-whatsapp" },
  { value: "push", label: "In-App & Push Portal Alerts", providers: "in-app-push" },
];

type IntForm = {
  name: string;
  channel: NotificationChannelType;
  provider_name: string;
  enabled: boolean;
  endpoint_url: string;
  sender_identity: string;
  default_recipients_csv: string;
  department_ids: number[];
  api_key: string;
  auth_token: string;
  account_sid: string;
};

const emptyIntForm = (): IntForm => ({
  name: "",
  channel: "webhook",
  provider_name: "https-webhook",
  enabled: true,
  endpoint_url: "",
  sender_identity: "",
  default_recipients_csv: "",
  department_ids: [],
  api_key: "",
  auth_token: "",
  account_sid: "",
});

export function IntegrationsTab({
  integrations,
  departments,
  onChanged,
}: {
  integrations: NotificationIntegration[];
  departments: Department[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationIntegration | null>(null);
  const [form, setForm] = useState<IntForm>(emptyIntForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NotificationIntegration | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testTargetModal, setTestTargetModal] = useState<NotificationIntegration | null>(null);
  const [testRecipient, setTestRecipient] = useState("");

  function openCreate() {
    setEditing(null);
    setForm(emptyIntForm());
    setFormErr(null);
    setModalOpen(true);
  }

  function openEdit(i: NotificationIntegration) {
    setEditing(i);
    setForm({
      name: i.name,
      channel: i.channel,
      provider_name: i.provider_name,
      enabled: i.enabled,
      endpoint_url: i.endpoint_url ?? "",
      sender_identity: i.sender_identity ?? "",
      default_recipients_csv: (i.default_recipients ?? []).join(", "),
      department_ids: i.department_ids ?? [],
      api_key: "",
      auth_token: "",
      account_sid: i.account_sid ?? "",
    });
    setFormErr(null);
    setModalOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      const recipients = form.default_recipients_csv
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const base = {
        name: form.name.trim(),
        provider_name: form.provider_name.trim() || form.channel,
        enabled: form.enabled,
        endpoint_url: form.endpoint_url.trim() || null,
        sender_identity: form.sender_identity.trim() || null,
        default_recipients: recipients,
        department_ids: form.department_ids,
        account_sid: form.account_sid.trim() || null,
        ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
        ...(form.auth_token.trim() ? { auth_token: form.auth_token.trim() } : {}),
      };
      if (editing) {
        await departmentManager.updateIntegration(editing.id, base);
        toast("ok", `Updated integration "${form.name.trim()}"`);
      } else {
        await departmentManager.createIntegration({ ...base, channel: form.channel });
        toast("ok", `Created "${form.name.trim()}" (run Test Delivery to verify)`);
      }
      setModalOpen(false);
      onChanged();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runTest(intg: NotificationIntegration, overrideRecipient?: string) {
    setTestingId(intg.id);
    try {
      const res = await departmentManager.testIntegration(intg.id, overrideRecipient?.trim() || undefined);
      if (res.ok) {
        toast("ok", `${intg.name}: Test delivery succeeded (${res.response ?? "OK"})`);
      } else {
        toast("err", `${intg.name}: ${res.error || "Test failed"}`);
      }
      onChanged();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setTestingId(null);
      setTestTargetModal(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Notification Integrations</h2>
          <p className="text-xs text-slate-400">
            Configure Email, HTTPS Webhooks, SMS, WhatsApp Business API, or Push alerts. Secrets are encrypted at rest and never returned to the browser.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Integration
        </Button>
      </div>

      <Notice tone="cyan">
        <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
        Integrations remain <b>Unverified</b> until a real <b>Test Delivery</b> succeeds. Editing credentials resets verification status.
      </Notice>

      {integrations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Webhook className="h-5 w-5" />}
            title="No notification integrations configured"
            text="Add Email, Webhook, SMS, WhatsApp, or Push connectors so assigned departments are notified immediately."
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {integrations.map((i) => (
            <Card key={i.id} className="flex flex-col justify-between gap-3 p-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{i.name}</h3>
                      <Badge tone="cyan">{i.channel.toUpperCase()}</Badge>
                      {i.connection_status === "verified" ? (
                        <Badge tone="green">
                          <CheckCircle2 className="h-3 w-3" /> Verified
                        </Badge>
                      ) : i.connection_status === "error" ? (
                        <Badge tone="red">Failed</Badge>
                      ) : (
                        <Badge tone="amber">Unverified</Badge>
                      )}
                      {!i.enabled && <Badge tone="neutral">Disabled</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Provider: {i.provider_name}
                      {i.last_verified_at ? ` · Verified ${fmtDate(i.last_verified_at)}` : ""}
                    </p>
                  </div>
                </div>

                <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Endpoint / Relay</dt>
                    <dd className="truncate font-mono text-slate-300">{i.endpoint_url ?? "Provider default"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Sender identity</dt>
                    <dd className="truncate text-slate-300">{i.sender_identity ?? "Default"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Stored secrets</dt>
                    <dd className="font-mono text-slate-300">
                      {i.has_api_key ? `Key ${i.api_key_hint}` : "No key"}
                      {i.has_auth_token ? ` · Token ${i.auth_token_hint}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Department scope</dt>
                    <dd className="text-slate-300">
                      {i.department_ids.length ? `${i.department_ids.length} department(s)` : "All departments"}
                    </dd>
                  </div>
                </dl>

                {i.last_error && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200">
                    Last error: {i.last_error}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-line/60 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  loading={testingId === i.id}
                  onClick={() => {
                    if (i.channel === "webhook" || i.channel === "push") {
                      void runTest(i);
                    } else {
                      setTestRecipient(i.default_recipients[0] ?? "");
                      setTestTargetModal(i);
                    }
                  }}
                >
                  <Send className="h-3.5 w-3.5" /> Test Delivery
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(i)}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Integration · ${editing.name}` : "Add Notification Integration"}
        wide
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Integration Name *">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. PDMA Dispatch Webhook"
              />
            </Field>
            <Field label="Channel Type">
              <Select
                disabled={Boolean(editing)}
                value={form.channel}
                onChange={(e) => {
                  const ch = e.target.value as NotificationChannelType;
                  const meta = CHANNELS.find((x) => x.value === ch);
                  setForm((s) => ({ ...s, channel: ch, provider_name: meta?.providers ?? ch }));
                }}
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Provider Name">
              <Input
                value={form.provider_name}
                onChange={(e) => setForm((s) => ({ ...s, provider_name: e.target.value }))}
                placeholder="resend, twilio, meta-whatsapp, https-webhook"
              />
            </Field>
            <Field label="Sender Identity (From Email / Number)">
              <Input
                value={form.sender_identity}
                onChange={(e) => setForm((s) => ({ ...s, sender_identity: e.target.value }))}
                placeholder="alerts@domain.com or +1..."
              />
            </Field>
          </div>

          <Field
            label="Endpoint URL (HTTPS only)"
            hint="Required for webhooks or custom SMS/Email/WhatsApp relays. Private/localhost URLs are blocked."
          >
            <Input
              type="url"
              value={form.endpoint_url}
              onChange={(e) => setForm((s) => ({ ...s, endpoint_url: e.target.value }))}
              placeholder="https://example.com/webhook"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={editing?.has_api_key ? `API Key / Signing Secret (${editing.api_key_hint})` : "API Key / Signing Secret"}>
              <Input
                type="password"
                autoComplete="new-password"
                value={form.api_key}
                onChange={(e) => setForm((s) => ({ ...s, api_key: e.target.value }))}
                placeholder={editing?.has_api_key ? "Leave blank to keep stored" : "Encrypted AES-256-GCM"}
              />
            </Field>
            <Field label={editing?.has_auth_token ? `Auth Token (${editing.auth_token_hint})` : "Auth Token (Twilio)"}>
              <Input
                type="password"
                autoComplete="new-password"
                value={form.auth_token}
                onChange={(e) => setForm((s) => ({ ...s, auth_token: e.target.value }))}
                placeholder={editing?.has_auth_token ? "Leave blank to keep stored" : "Optional"}
              />
            </Field>
            <Field label="Account SID / Phone ID">
              <Input
                value={form.account_sid}
                onChange={(e) => setForm((s) => ({ ...s, account_sid: e.target.value }))}
                placeholder="Twilio SID or WhatsApp Phone ID"
              />
            </Field>
          </div>

          <Field label="Fallback / Default Recipients (comma-separated)">
            <Input
              value={form.default_recipients_csv}
              onChange={(e) => setForm((s) => ({ ...s, default_recipients_csv: e.target.value }))}
              placeholder="ops@agency.gov.pk, +92300..."
            />
          </Field>

          {departments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-ct-secondary">
                Limit to Departments ({form.department_ids.length === 0 ? "All departments" : form.department_ids.length})
              </span>
              <div className="grid max-h-28 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-line bg-ink-900 p-2.5 sm:grid-cols-3">
                {departments.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.department_ids.includes(d.id)}
                      onChange={() =>
                        setForm((s) => ({
                          ...s,
                          department_ids: s.department_ids.includes(d.id)
                            ? s.department_ids.filter((x) => x !== d.id)
                            : [...s.department_ids, d.id],
                        }))
                      }
                      className="accent-[#21C7D9]"
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
              className="accent-[#21C7D9]"
            />
            Integration enabled for live dispatches
          </label>

          {formErr && <Notice tone="amber">{formErr}</Notice>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save Integration" : "Save Integration"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!testTargetModal}
        onClose={() => setTestTargetModal(null)}
        title={`Test ${testTargetModal?.name ?? "Integration"}`}
      >
        {testTargetModal && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runTest(testTargetModal, testRecipient);
            }}
            className="space-y-4"
          >
            <Field label={`Test Recipient (${testTargetModal.channel.toUpperCase()})`}>
              <Input
                required
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder={testTargetModal.channel === "email" ? "you@example.com" : "+923001234567"}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setTestTargetModal(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={testingId === testTargetModal.id}>
                Send Real Test
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Integration"
        confirmLabel="Delete"
        message={`Delete "${deleting?.name}"? Existing delivery logs will be preserved.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await departmentManager.deleteIntegration(deleting.id);
            toast("ok", "Integration deleted");
            onChanged();
          } catch (err) {
            toast("err", (err as Error).message);
          }
        }}
      />
    </div>
  );
}
