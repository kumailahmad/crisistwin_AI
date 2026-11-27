"use client";
import { useState } from "react";
import { Building2, Edit3, Plus, Power, Trash2, UserPlus } from "lucide-react";
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
  type Department,
  type DepartmentContact,
  type District,
  type IncidentType,
  type NotificationChannelType,
} from "@/lib/types";

const DEPT_TYPES = [
  { value: "disaster_management", label: "Disaster Management" },
  { value: "fire_rescue", label: "Fire & Rescue" },
  { value: "medical_emergency", label: "Medical & Ambulance" },
  { value: "police_levies", label: "Police / Levies" },
  { value: "public_works", label: "Roads & Infrastructure" },
  { value: "district_admin", label: "District Administration" },
  { value: "emergency_response", label: "General Emergency Response" },
];

const CHANNELS: { value: NotificationChannelType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "webhook", label: "Webhook (HTTPS)" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp Business" },
  { value: "push", label: "In-App / Push" },
];

type ContactDraft = {
  id?: number;
  name: string;
  role_title: string;
  email: string;
  phone: string;
  channel_preference: NotificationChannelType;
  is_primary: boolean;
};

type FormState = {
  name: string;
  description: string;
  department_type: string;
  assigned_district_ids: number[];
  supported_categories: IncidentType[];
  primary_contact_name: string;
  contact_email: string;
  contact_phone: string;
  notification_channel: NotificationChannelType;
  webhook_url: string;
  backup_department_id: string;
  priority_weight: string;
  is_active: boolean;
  contacts: ContactDraft[];
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  department_type: "emergency_response",
  assigned_district_ids: [],
  supported_categories: [],
  primary_contact_name: "",
  contact_email: "",
  contact_phone: "",
  notification_channel: "email",
  webhook_url: "",
  backup_department_id: "",
  priority_weight: "10",
  is_active: true,
  contacts: [],
});

export function DepartmentDirectoryTab({
  departments,
  districts,
  onChanged,
}: {
  departments: Department[];
  districts: District[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setEditing(d);
    setForm({
      name: d.name,
      description: d.description ?? "",
      department_type: d.department_type || "emergency_response",
      assigned_district_ids: d.assigned_district_ids ?? [],
      supported_categories: d.supported_categories ?? [],
      primary_contact_name: d.primary_contact_name ?? "",
      contact_email: d.contact_email ?? "",
      contact_phone: d.contact_phone ?? "",
      notification_channel: d.notification_channel ?? "email",
      webhook_url: d.webhook_url ?? "",
      backup_department_id: d.backup_department_id ? String(d.backup_department_id) : "",
      priority_weight: String(d.priority_weight ?? 10),
      is_active: d.is_active,
      contacts: (d.contacts ?? []).map((c: DepartmentContact) => ({
        id: c.id,
        name: c.name,
        role_title: c.role_title ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        channel_preference: c.channel_preference,
        is_primary: c.is_primary,
      })),
    });
    setFormError(null);
    setModalOpen(true);
  }

  function toggleDistrict(id: number) {
    setForm((s) => ({
      ...s,
      assigned_district_ids: s.assigned_district_ids.includes(id)
        ? s.assigned_district_ids.filter((x) => x !== id)
        : [...s.assigned_district_ids, id],
    }));
  }

  function toggleCategory(cat: IncidentType) {
    setForm((s) => ({
      ...s,
      supported_categories: s.supported_categories.includes(cat)
        ? s.supported_categories.filter((x) => x !== cat)
        : [...s.supported_categories, cat],
    }));
  }

  function addContactRow() {
    setForm((s) => ({
      ...s,
      contacts: [
        ...s.contacts,
        {
          name: "",
          role_title: "",
          email: "",
          phone: "",
          channel_preference: s.notification_channel,
          is_primary: false,
        },
      ],
    }));
  }

  function updateContactRow(idx: number, patch: Partial<ContactDraft>) {
    setForm((s) => ({
      ...s,
      contacts: s.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  function removeContactRow(idx: number) {
    setForm((s) => ({
      ...s,
      contacts: s.contacts.filter((_, i) => i !== idx),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload: Partial<Department> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        department_type: form.department_type,
        assigned_district_ids: form.assigned_district_ids,
        supported_categories: form.supported_categories,
        primary_contact_name: form.primary_contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        notification_channel: form.notification_channel,
        webhook_url: form.webhook_url.trim() || null,
        backup_department_id: form.backup_department_id ? Number(form.backup_department_id) : null,
        priority_weight: Number(form.priority_weight || 10),
        is_active: form.is_active,
        contacts: form.contacts
          .filter((c) => c.name.trim())
          .map((c) => ({
            id: c.id ?? 0,
            department_id: editing?.id ?? 0,
            name: c.name.trim(),
            role_title: c.role_title.trim() || null,
            email: c.email.trim() || null,
            phone: c.phone.trim() || null,
            channel_preference: c.channel_preference,
            is_primary: c.is_primary,
          })),
      };
      if (editing) {
        await departmentManager.updateDepartment(editing.id, payload);
        toast("ok", `Updated "${form.name.trim()}"`);
      } else {
        await departmentManager.createDepartment(payload);
        toast("ok", `Created "${form.name.trim()}"`);
      }
      setModalOpen(false);
      onChanged();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(d: Department) {
    try {
      await departmentManager.updateDepartment(d.id, { is_active: !d.is_active });
      toast("ok", `${d.name} ${!d.is_active ? "enabled" : "disabled"}`);
      onChanged();
    } catch (err) {
      toast("err", (err as Error).message);
    }
  }

  const districtMap = new Map(districts.map((d) => [d.id, d.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Department Directory</h2>
          <p className="text-xs text-slate-400">
            Configure response agencies, district coverage, incident categories, notification endpoints, and backup departments without code.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Department
        </Button>
      </div>

      {departments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="No departments configured yet"
            text="Create your first emergency response department to enable deterministic incident routing and notifications."
            action={
              <Button size="sm" onClick={openCreate} className="mt-2">
                <Plus className="h-4 w-4" /> Create first department
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {departments.map((d) => {
            const backupName = d.backup_department_id
              ? departments.find((x) => x.id === d.backup_department_id)?.name
              : null;
            const districtLabel =
              d.assigned_district_ids.length === 0
                ? "All Balochistan"
                : d.assigned_district_ids
                    .slice(0, 3)
                    .map((id) => districtMap.get(id) ?? `#${id}`)
                    .join(", ") + (d.assigned_district_ids.length > 3 ? ` +${d.assigned_district_ids.length - 3}` : "");

            return (
              <Card key={d.id} className="flex flex-col justify-between gap-3 p-4">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-white">{d.name}</h3>
                        {d.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Inactive</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {DEPT_TYPES.find((t) => t.value === d.department_type)?.label ?? d.department_type} · Channel:{" "}
                        <span className="uppercase text-cyan-300">{d.notification_channel}</span> · Weight{" "}
                        <span className="font-mono tabular-nums text-slate-200">{d.priority_weight}</span>
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">
                      {d.incident_count ?? 0} assigned
                    </span>
                  </div>

                  {d.description && <p className="text-xs leading-relaxed text-slate-300">{d.description}</p>}

                  <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Districts</dt>
                      <dd className="text-slate-200">{districtLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Primary contact</dt>
                      <dd className="truncate text-slate-200">
                        {d.primary_contact_name || d.contact_email || d.contact_phone || "Not set"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Email / Phone</dt>
                      <dd className="truncate text-slate-300">
                        {[d.contact_email, d.contact_phone].filter(Boolean).join(" · ") || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Backup department</dt>
                      <dd className="truncate text-slate-300">{backupName ?? "None"}</dd>
                    </div>
                  </dl>

                  {d.supported_categories.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      <span className="text-slate-500">Categories:</span>{" "}
                      {d.supported_categories.map((c) => c.replace(/_/g, " ")).join(", ")}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-line/60 pt-3">
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(d)}>
                    <Power className="h-3.5 w-3.5" />
                    {d.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(d)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Department · ${editing.name}` : "Add Department"}
        wide
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department Name *">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Quetta Fire & Rescue 1122"
              />
            </Field>
            <Field label="Department Type">
              <Select
                value={form.department_type}
                onChange={(e) => setForm((s) => ({ ...s, department_type: e.target.value }))}
              >
                {DEPT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Department Description">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="Jurisdiction, dispatch capabilities, and SLA scope"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Primary Contact Name">
              <Input
                value={form.primary_contact_name}
                onChange={(e) => setForm((s) => ({ ...s, primary_contact_name: e.target.value }))}
                placeholder="Duty Officer"
              />
            </Field>
            <Field label="Contact Email">
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((s) => ({ ...s, contact_email: e.target.value }))}
                placeholder="dispatch@agency.gov.pk"
              />
            </Field>
            <Field label="Contact Phone">
              <Input
                value={form.contact_phone}
                onChange={(e) => setForm((s) => ({ ...s, contact_phone: e.target.value }))}
                placeholder="+92..."
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Notification Channel">
              <Select
                value={form.notification_channel}
                onChange={(e) =>
                  setForm((s) => ({ ...s, notification_channel: e.target.value as NotificationChannelType }))
                }
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Backup Department">
              <Select
                value={form.backup_department_id}
                onChange={(e) => setForm((s) => ({ ...s, backup_department_id: e.target.value }))}
              >
                <option value="">None</option>
                {departments
                  .filter((d) => d.id !== editing?.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Priority Weight (1–100)">
              <Input
                type="number"
                min={1}
                max={100}
                value={form.priority_weight}
                onChange={(e) => setForm((s) => ({ ...s, priority_weight: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Webhook URL (HTTPS only, optional)" hint="Receives HMAC-signed JSON dispatch payloads.">
            <Input
              type="url"
              value={form.webhook_url}
              onChange={(e) => setForm((s) => ({ ...s, webhook_url: e.target.value }))}
              placeholder="https://hooks.agency.example/incidents"
            />
          </Field>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ct-secondary">
                Assigned Districts ({form.assigned_district_ids.length === 0 ? "All Balochistan" : form.assigned_district_ids.length})
              </span>
              {form.assigned_district_ids.length > 0 && (
                <button
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, assigned_district_ids: [] }))}
                  className="text-[11px] text-cyan-300 hover:underline"
                >
                  Clear (All districts)
                </button>
              )}
            </div>
            <div className="grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-line bg-ink-900 p-2.5 sm:grid-cols-3">
              {districts.map((dist) => (
                <label key={dist.id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.assigned_district_ids.includes(dist.id)}
                    onChange={() => toggleDistrict(dist.id)}
                    className="rounded border-line accent-[#21C7D9]"
                  />
                  <span className="truncate">{dist.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-ct-secondary">
              Supported Incident Categories ({form.supported_categories.length === 0 ? "All categories" : form.supported_categories.length})
            </span>
            <div className="grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-line bg-ink-900 p-2.5 sm:grid-cols-3">
              {INCIDENT_TYPES.map((cat) => (
                <label key={cat.value} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.supported_categories.includes(cat.value)}
                    onChange={() => toggleCategory(cat.value)}
                    className="rounded border-line accent-[#21C7D9]"
                  />
                  <span className="truncate">{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ct-secondary">Additional Contacts ({form.contacts.length})</span>
              <Button type="button" size="sm" variant="outline" onClick={addContactRow}>
                <UserPlus className="h-3.5 w-3.5" /> Add Contact
              </Button>
            </div>
            {form.contacts.map((c, idx) => (
              <div key={idx} className="grid gap-2 rounded-xl border border-line bg-ink-900 p-2.5 sm:grid-cols-5">
                <Input
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => updateContactRow(idx, { name: e.target.value })}
                />
                <Input
                  placeholder="Role"
                  value={c.role_title}
                  onChange={(e) => updateContactRow(idx, { role_title: e.target.value })}
                />
                <Input
                  placeholder="Email"
                  value={c.email}
                  onChange={(e) => updateContactRow(idx, { email: e.target.value })}
                />
                <Input
                  placeholder="Phone"
                  value={c.phone}
                  onChange={(e) => updateContactRow(idx, { phone: e.target.value })}
                />
                <div className="flex items-center justify-between gap-1">
                  <Select
                    value={c.channel_preference}
                    onChange={(e) =>
                      updateContactRow(idx, { channel_preference: e.target.value as NotificationChannelType })
                    }
                  >
                    {CHANNELS.map((ch) => (
                      <option key={ch.value} value={ch.value}>
                        {ch.label}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    onClick={() => removeContactRow(idx)}
                    aria-label="Remove contact"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
              className="rounded border-line accent-[#21C7D9]"
            />
            Department is active and eligible to receive automated assignments
          </label>

          {formError && <Notice tone="amber">{formError}</Notice>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save Changes" : "Create Department"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Department"
        confirmLabel="Delete"
        message={`Delete "${deleting?.name}"? Departments with existing incident assignment history are protected and must be disabled instead.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await departmentManager.deleteDepartment(deleting.id);
            toast("ok", `Deleted "${deleting.name}"`);
            onChanged();
          } catch (err) {
            toast("err", (err as Error).message);
          }
        }}
      />
    </div>
  );
}
