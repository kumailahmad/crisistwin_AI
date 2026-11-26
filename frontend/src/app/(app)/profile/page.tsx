"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  UserCheck,
} from "lucide-react";
import { TrackReportBox } from "@/components/incidents/TrackReportBox";
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAsync } from "@/lib/hooks";
import { useCitizenLocation } from "@/lib/hooks/useCitizenLocation";
import { auth, districts, incidents, users } from "@/lib/services";
import { INCIDENT_TYPES, STATUS_LABEL, type IncidentStatus } from "@/lib/types";
import { useTheme } from "@/lib/theme/ThemeContext";

export default function ProfilePage() {
  const { user, refreshUser, continueAsGuest, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const ds = useAsync(() => districts.list(), [], "districts");
  const myReports = useAsync(
    () => (user ? incidents.mine().catch(() => []) : Promise.resolve([])),
    [user?.id],
    user ? `profile-reports-${user.id}` : undefined
  );
  const loc = useCitizenLocation(ds.data ?? []);

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
      const nextDist = districtId ? Number(districtId) : null;
      await users.updateMe({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        district_id: nextDist,
        notification_prefs: {
          district_alerts: districtAlerts,
          incident_updates: incidentUpdates,
          public_safety: publicSafety,
        },
        privacy_prefs: {
          share_approximate_only: approxOnly,
        },
      });
      loc.setSelectedDistrictId(nextDist);
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

  const activeDistrict = (ds.data ?? []).find(
    (d) => d.id === (loc.selectedDistrictId ?? (districtId ? Number(districtId) : null))
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Account & Settings"
        subtitle={
          user
            ? "Manage your district alerts, location sharing, display theme, and account security."
            : "Guest access is active. Manage your district location, theme, report tracking, or optionally sign in."
        }
        actions={
          user ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                router.replace("/");
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          ) : undefined
        }
      />

      {!user && (
        <Card className="border-[#21C7D9]/40 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-ct-text">
                <UserCheck className="h-4 w-4 text-[#16A34A]" />
                Guest Mode Active
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ct-secondary">
                You can submit emergency reports, check public alerts, locate help, and use the AI safety assistant without an account. Create an account anytime to save reports and notification preferences across devices.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/login" className={buttonClasses({ size: "sm", variant: "primary" })}>
                <LogIn className="h-3.5 w-3.5" /> Sign In / Create Account
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  continueAsGuest();
                  router.replace("/");
                }}
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        </Card>
      )}

      {user && !user.email_verified && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ct-text">Verify your email</h2>
              <p className="mt-0.5 text-xs text-ct-muted">
                Enter the verification code shown when you registered.
              </p>
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

      {/* Location & Appearance Card */}
      <Card id="location">
        <CardHeader
          title="Location & Display Preferences"
          subtitle="Manage your location permission status, active Balochistan district, and Light/Dark appearance."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-ct-border bg-ct-soft/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ct-muted">
                <MapPin className="h-3.5 w-3.5 text-cyan-700 dark:text-[#21C7D9]" />
                Location Status
              </span>
              <Badge tone={loc.permission === "granted" ? "green" : loc.permission === "denied" ? "red" : "neutral"}>
                {loc.permission === "granted"
                  ? "Granted"
                  : loc.permission === "denied"
                    ? "Denied"
                    : loc.permission === "unsupported"
                      ? "Unavailable"
                      : "Not requested"}
              </Badge>
            </div>
            <p className="text-sm font-semibold text-ct-text">
              District: {activeDistrict ? activeDistrict.name : "Not selected"}
            </p>
            <p className="font-mono text-xs text-ct-muted tabular-nums">
              {loc.lat != null && loc.lon != null
                ? `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}${loc.accuracy != null ? ` · ±${Math.round(loc.accuracy)} m` : ""}`
                : "No live GPS coordinates cached in this session"}
            </p>
            {loc.error && <p className="text-xs text-[#DC454D] dark:text-red-300">{loc.error}</p>}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => loc.requestGps()}
              loading={loc.locating}
            >
              <LocateFixed className="h-3.5 w-3.5" />
              {loc.lat != null ? "Refresh GPS" : "Allow GPS location"}
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-ct-border bg-ct-soft/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ct-muted">
              Citizen Interface Theme
            </p>
            <p className="text-xs text-ct-secondary">
              Light mode gives high daytime readability; switch to Dark navy at night.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant={theme === "light" ? "primary" : "outline"}
                onClick={() => setTheme("light")}
              >
                <Sun className="h-4 w-4" /> Light
              </Button>
              <Button
                type="button"
                size="sm"
                variant={theme === "dark" ? "primary" : "outline"}
                onClick={() => setTheme("dark")}
              >
                <Moon className="h-4 w-4" /> Dark
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {!user && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-ct-text">Track a Guest Emergency Report</h2>
          <TrackReportBox />
        </div>
      )}

      {user && (
        <>
          <Card>
            <CardHeader
              title="My Submitted Reports"
              subtitle="Track verification status and dispatch updates for your reports."
              action={
                <Link
                  href="/report#track"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="p-5">
              {myReports.loading ? (
                <p className="text-xs text-ct-muted">Loading submitted reports…</p>
              ) : myReports.data?.length ? (
                <div className="divide-y divide-ct-border">
                  {myReports.data.slice(0, 4).map((rep) => {
                    const tone: Record<IncidentStatus, "amber" | "green" | "cyan" | "neutral" | "red"> = {
                      pending: "amber",
                      under_review: "cyan",
                      verified: "green",
                      response_assigned: "cyan",
                      resolved: "neutral",
                      rejected: "red",
                    };
                    const typeMeta = INCIDENT_TYPES.find((t) => t.value === rep.type);
                    return (
                      <div key={rep.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-semibold text-ct-text">
                            <span className="font-mono text-xs text-[#0b8a99] dark:text-[#21C7D9] tabular-nums">
                              {rep.code}
                            </span>
                            <span className="truncate">{typeMeta?.label ?? rep.type.replace(/_/g, " ")}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-ct-muted">
                            {rep.district_name ?? rep.place_text ?? `${rep.latitude.toFixed(2)}, ${rep.longitude.toFixed(2)}`} ·{" "}
                            {new Date(rep.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge tone={tone[rep.status]}>{STATUS_LABEL[rep.status]}</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs text-ct-muted">
                    <ClipboardList className="h-4 w-4" />
                    No emergency reports submitted from this account yet.
                  </p>
                  <Link href="/report" className={buttonClasses({ size: "sm", variant: "outline" })}>
                    Report an Emergency
                  </Link>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Account details & alert preferences"
              subtitle={`${user.email} · ${user.email_verified ? "Verified email" : "Email unverified"}`}
              action={user.email_verified ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : undefined}
            />
            <form onSubmit={saveProfile} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                <Field label="Phone (optional)" hint="Only visible to response administrators on reports.">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3xx xxxxxxx" />
                </Field>
              </div>
              <Field label="Subscribed district for alerts" hint="Receive alerts specifically affecting your home district plus province-wide notices.">
                <Select
                  value={districtId}
                  onChange={(e) => {
                    setDistrictId(e.target.value);
                    loc.setSelectedDistrictId(e.target.value ? Number(e.target.value) : null);
                  }}
                >
                  <option value="">All Balochistan districts</option>
                  {(ds.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-2 border-t border-ct-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-ct-muted">
                  Notification Preferences
                </p>
                <label className="flex min-h-[36px] items-center gap-2.5 text-sm text-ct-text">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#21C7D9]"
                    checked={districtAlerts}
                    onChange={(e) => setDistrictAlerts(e.target.checked)}
                  />
                  Published emergency alerts for my district
                </label>
                <label className="flex min-h-[36px] items-center gap-2.5 text-sm text-ct-text">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#21C7D9]"
                    checked={incidentUpdates}
                    onChange={(e) => setIncidentUpdates(e.target.checked)}
                  />
                  Status updates on my submitted crisis reports
                </label>
                <label className="flex min-h-[36px] items-center gap-2.5 text-sm text-ct-text">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#21C7D9]"
                    checked={publicSafety}
                    onChange={(e) => setPublicSafety(e.target.checked)}
                  />
                  General public safety preparedness notices
                </label>
              </div>

              <div className="space-y-2 border-t border-ct-border pt-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ct-muted">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-700 dark:text-[#21C7D9]" /> Privacy
                </p>
                <label className="flex min-h-[36px] items-start gap-2.5 text-sm text-ct-text">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[#21C7D9]"
                    checked={approxOnly}
                    onChange={(e) => setApproxOnly(e.target.checked)}
                  />
                  <span>
                    Round coordinates (~110 m) when verified incidents appear on public maps (administrators still see exact coordinates for dispatch).
                  </span>
                </label>
              </div>

              <div className="flex justify-end">
                <Button type="submit" loading={busy}>
                  Save preferences
                </Button>
              </div>
            </form>
          </Card>

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

          <Card className="border-[#DC454D]/35 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#b91c25] dark:text-red-200">Delete account</h2>
                <p className="mt-0.5 text-xs text-ct-muted">
                  Deactivates your login and scrubs personal profile fields.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete account
              </Button>
            </div>
          </Card>
        </>
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
