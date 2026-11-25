"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Save, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Notice, PageHeader, Skeleton, useToast } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { admin } from "@/lib/services";

export default function AdminSettingsPage() {
  const toast = useToast();
  const q = useAsync(() => admin.settings(), [], "admin-settings");

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [emergencyNum, setEmergencyNum] = useState("");
  const [defaultAlerts, setDefaultAlerts] = useState(true);
  const [allowReg, setAllowReg] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setName(q.data.platform_name);
    setTagline(q.data.tagline);
    setSupportEmail(q.data.support_email);
    setEmergencyNum(q.data.emergency_primary_number);
    setDefaultAlerts(q.data.default_alert_notifications);
    setAllowReg(q.data.allow_public_registration);
  }, [q.data]);

  async function save() {
    setBusy(true);
    try {
      await admin.updateSettings({
        platform_name: name.trim(),
        tagline: tagline.trim(),
        support_email: supportEmail.trim(),
        emergency_primary_number: emergencyNum.trim(),
        default_alert_notifications: defaultAlerts,
        allow_public_registration: allowReg,
      });
      toast("ok", "System settings saved");
      q.reload();
    } catch (e) {
      toast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;

  const s = q.data;

  return (
    <>
      <PageHeader title="System settings" subtitle="Platform branding, citizen onboarding policies, notification defaults, and live server integration status." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Platform & policy settings" subtitle={s ? `Last updated ${fmtDate(s.updated_at)}` : undefined} />
          {q.loading || !s ? (
            <Skeleton className="m-5 h-56" />
          ) : (
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Platform name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </Field>
                <Field label="Primary emergency number">
                  <Input value={emergencyNum} onChange={(e) => setEmergencyNum(e.target.value)} maxLength={30} />
                </Field>
              </div>
              <Field label="Tagline">
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} />
              </Field>
              <Field label="Support contact email">
                <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} maxLength={120} />
              </Field>
              <div className="space-y-2 rounded-xl border border-line bg-ink-900 p-4 text-sm">
                <label className="flex items-center gap-2.5 text-slate-200">
                  <input type="checkbox" className="accent-cyan-400" checked={allowReg} onChange={(e) => setAllowReg(e.target.checked)} />
                  Allow new public citizen registrations
                </label>
                <label className="flex items-center gap-2.5 text-slate-200">
                  <input type="checkbox" className="accent-cyan-400" checked={defaultAlerts} onChange={(e) => setDefaultAlerts(e.target.checked)} />
                  Enable district alert notifications by default for new citizens
                </label>
              </div>
              <div className="flex justify-end">
                <Button loading={busy} onClick={save}>
                  <Save className="h-4 w-4" /> Save settings
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Runtime integration status" />
            {s && (
              <div className="space-y-3 p-5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Persistence store</span>
                  <Badge tone="cyan">{s.persistence_mode}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">AI provider</span>
                  <Badge tone={s.ai_provider_configured ? "green" : "amber"}>{s.ai_provider_configured ? "Configured" : "Not configured"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Outbound SMTP email</span>
                  <Badge tone={s.smtp_configured ? "green" : "amber"}>{s.smtp_configured ? "Configured" : "Not configured"}</Badge>
                </div>
                <Notice tone="cyan">
                  When SMTP is not configured, verification and password reset codes remain explicit rather than simulating email delivery.
                </Notice>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="API & Role matrix" />
            <div className="space-y-3 p-5 text-xs text-slate-300">
              <p className="flex items-center gap-1.5 font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-cyan-300" /> Access tiers
              </p>
              <ul className="space-y-1 text-slate-400">
                <li>
                  <b className="text-slate-200">Citizen (`user`):</b> Report crises, flag verified reports, run risk/scenarios, view alerts & resources, manage own profile.
                </li>
                <li>
                  <b className="text-slate-200">Administrator (`admin`):</b> Full incident triage & response assignment, alert publishing, user management, AI & system config, resource & GIS governance.
                </li>
              </ul>
              <a
                href="/api/v1/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-cyan-300 hover:underline"
              >
                OpenAPI 3.1 Schema JSON <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
