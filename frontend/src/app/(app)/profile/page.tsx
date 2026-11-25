"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, ConfirmDialog, Field, Input, Notice, PageHeader, Select, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAsync } from "@/lib/hooks";
import { auth, districts, users } from "@/lib/services";

export default function ProfilePage() {
  const { user, demo, refreshUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const ds = useAsync(() => districts.list(), [], "districts");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [districtAlerts, setDistrictAlerts] = useState(true);
  const [incidentUpdates, setIncidentUpdates] = useState(true);
  const [publicSafety, setPublicSafety] = useState(true);
  const [approxOnly, setApproxOnly] = useState(false);

  const [verifyCode, setVerifyCode] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    setPhone(user.phone ?? "");
    setDistrictId(user.district_id ? String(user.district_id) : "");
    setDistrictAlerts(user.notification_prefs?.district_alerts ?? true);
    setIncidentUpdates(user.notification_prefs?.incident_updates ?? true);
    setPublicSafety(user.notification_prefs?.public_safety ?? true);
    setApproxOnly(user.privacy_prefs?.share_approximate_only ?? false);
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await users.updateMe({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        district_id: districtId ? Number(districtId) : null,
        notification_prefs: {
          district_alerts: districtAlerts,
          incident_updates: incidentUpdates,
          public_safety: publicSafety,
        },
        privacy_prefs: {
          share_approximate_only: approxOnly,
        },
      });
      await refreshUser();
      toast("ok", "Profile & preferences saved");
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyAccount() {
    if (!verifyCode.trim()) return;
    setBusy(true);
    try {
      await auth.verifyEmail(verifyCode.trim());
      await refreshUser();
      setVerifyCode("");
      toast("ok", "Email verified");
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await users.changePassword({ current_password: curPw, new_password: newPw });
      setCurPw("");
      setNewPw("");
      toast("ok", "Password updated");
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Profile, notifications & privacy"
        subtitle="Manage your district subscription, alert preferences, location privacy, and account security."
      />

      {demo && (
        <Notice>
          You are using a temporary demo session. Sign in with a registered account to persist profile settings.
        </Notice>
      )}

      {!demo && user && !user.email_verified && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Verify your email</h2>
              <p className="mt-0.5 text-xs text-slate-400">Enter the verification code shown when you registered.</p>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-44"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="Verification code"
              />
              <Button size="sm" onClick={verifyAccount} loading={busy} disabled={!verifyCode.trim()}>
                Verify
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Account details & alert preferences"
          subtitle={user ? `${user.email} · ${user.email_verified ? "Verified email" : "Email unverified"}` : undefined}
          action={user?.email_verified ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : undefined}
        />
        <form onSubmit={saveProfile} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={demo} />
            </Field>
            <Field label="Phone (optional)" hint="Only visible to response administrators on reports.">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3xx xxxxxxx" disabled={demo} />
            </Field>
          </div>
          <Field label="Subscribed district for alerts" hint="Receive alerts specifically affecting your home district plus province-wide notices.">
            <Select value={districtId} onChange={(e) => setDistrictId(e.target.value)} disabled={demo}>
              <option value="">All Balochistan districts</option>
              {(ds.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notification Preferences</p>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" className="accent-cyan-400" checked={districtAlerts} onChange={(e) => setDistrictAlerts(e.target.checked)} disabled={demo} />
              Published emergency alerts for my district
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" className="accent-cyan-400" checked={incidentUpdates} onChange={(e) => setIncidentUpdates(e.target.checked)} disabled={demo} />
              Status updates on my submitted crisis reports
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" className="accent-cyan-400" checked={publicSafety} onChange={(e) => setPublicSafety(e.target.checked)} disabled={demo} />
              General public safety preparedness notices
            </label>
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" /> Privacy
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" className="accent-cyan-400" checked={approxOnly} onChange={(e) => setApproxOnly(e.target.checked)} disabled={demo} />
              Round coordinates (~110 m) when verified incidents appear on public maps (administrators still see exact coordinates for dispatch).
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={demo}>
              Save preferences
            </Button>
          </div>
        </form>
      </Card>

      {!demo && (
        <Card>
          <CardHeader title="Change password" />
          <form onSubmit={changePw} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Current password">
              <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} required />
            </Field>
            <Field label="New password (min 8 chars)">
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" variant="outline" loading={busy} disabled={!curPw || newPw.length < 8}>
                <KeyRound className="h-4 w-4" /> Update password
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!demo && (
        <Card className="border-red-500/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-red-200">Delete account</h2>
              <p className="mt-0.5 text-xs text-slate-400">Deactivates your login and scrubs personal profile fields.</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete account
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDel}
        title="Delete your account?"
        confirmLabel="Delete account"
        message="This permanently deactivates your login and clears your name, phone, and notifications."
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          try {
            await users.deleteMe();
            await logout();
            router.replace("/");
          } catch (err) {
            toast("err", (err as Error).message);
          }
        }}
      />
    </div>
  );
}
