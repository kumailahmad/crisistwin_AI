"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Compass,
  Crosshair,
  Hospital,
  LifeBuoy,
  MapPin,
  Megaphone,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, Modal, Select, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { useCitizenLocation } from "@/lib/hooks/useCitizenLocation";
import { alerts as alertsApi, districts as districtsApi, incidents as incidentsApi } from "@/lib/services";
import { INCIDENT_TYPES, STATUS_LABEL, type AlertItem, type IncidentStatus } from "@/lib/types";

const ALERT_META: Record<
  AlertItem["severity"],
  { label: string; tone: "red" | "orange" | "amber" | "blue" }
> = {
  emergency: { label: "Critical", tone: "red" },
  warning: { label: "High", tone: "orange" },
  watch: { label: "Moderate", tone: "amber" },
  advisory: { label: "Information", tone: "blue" },
};

const REPORT_TONE: Record<IncidentStatus, "amber" | "cyan" | "green" | "red"> = {
  pending: "amber",
  under_review: "cyan",
  verified: "green",
  response_assigned: "cyan",
  resolved: "green",
  rejected: "red",
};

const HELP_CARDS = [
  {
    title: "Nearby Hospitals",
    desc: "Find verified medical facilities and clinics with directions.",
    href: "/resources?type=hospital",
    icon: Hospital,
    accent: "text-[#0b8a99] dark:text-[#21C7D9] bg-[#21C7D9]/12",
  },
  {
    title: "Emergency Contacts",
    desc: "Direct helpline numbers including Police 15 and hospital desks.",
    href: "/resources?tab=contacts",
    icon: Phone,
    accent: "text-[#DC454D] bg-[#DC454D]/12",
  },
  {
    title: "Rescue Services",
    desc: "Locate rescue centres, ambulances, fire services, and shelters.",
    href: "/resources?type=rescue",
    icon: LifeBuoy,
    accent: "text-amber-700 dark:text-[#E9A23B] bg-[#E9A23B]/15",
  },
  {
    title: "AI Safety Assistant",
    desc: "Ask preparedness and safety questions in English, Urdu, or Balochi.",
    href: "/assistant",
    icon: Bot,
    accent: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/12",
  },
] as const;

const PERM_LABEL: Record<string, string> = {
  granted: "Allowed",
  prompt: "Ask when needed",
  denied: "Blocked in browser",
  unsupported: "Unavailable",
};

export default function CitizenHomePage() {
  const { demo } = useAuth();
  const ds = useAsync(() => districtsApi.list().catch(() => []), [], "home-districts");
  const publicAlerts = useAsync(
    () => (demo ? Promise.resolve([]) : alertsApi.list().catch(() => [])),
    [demo],
    "home-alerts"
  );
  const myReports = useAsync(() => incidentsApi.mine().catch(() => []), [], "home-reports");
  const loc = useCitizenLocation(ds.data ?? []);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  const districtNames = useMemo(
    () => new Map((ds.data ?? []).map((d) => [d.id, d.name])),
    [ds.data]
  );

  const selectedDistrictName = loc.selectedDistrictId
    ? districtNames.get(loc.selectedDistrictId) ?? `District #${loc.selectedDistrictId}`
    : "Not selected (All Balochistan)";

  const alertList = publicAlerts.data ?? [];
  const reportList = myReports.data ?? [];

  return (
    <div className="space-y-8">
      {/* Main Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1424] via-[#11243A] to-[#0B1424] p-7 text-[#EDF5FA] shadow-card sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-[#21C7D9]/15 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21C7D9]">
            Balochistan Public Safety Portal
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Stay Safe. We&apos;re Here to Help.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-200 sm:text-lg">
            Report emergencies, receive verified alerts and find emergency assistance across Balochistan.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link
              href="/report"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-2xl bg-[#DC454D] px-7 py-3.5 text-base font-bold tracking-wide text-white shadow-lg transition hover:bg-[#c53a42] focus-visible:outline-white"
            >
              <Megaphone className="h-5 w-5 shrink-0" />
              REPORT AN EMERGENCY
            </Link>
            <a
              href="tel:15"
              className="inline-flex min-h-[54px] items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              <Phone className="h-4 w-4 text-[#21C7D9]" />
              Immediate Danger? Call 15
            </a>
          </div>
        </div>
      </section>

      {/* SECTION A: LATEST PUBLIC ALERTS */}
      <section aria-labelledby="sec-alerts-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="sec-alerts-title" className="text-lg font-bold text-ct-text">
              Latest Public Alerts
            </h2>
            <p className="text-xs text-ct-muted">
              Verified official advisories and emergency warnings only.
            </p>
          </div>
          <Link
            href="/alerts"
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
          >
            View all alerts <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {publicAlerts.loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : alertList.length === 0 ? (
          <Card className="p-2">
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title="No new verified emergency alerts in your area."
              text="Official alerts published by response administrators appear here immediately."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {alertList.slice(0, 4).map((a) => {
              const sev = ALERT_META[a.severity] ?? ALERT_META.advisory;
              const area = a.district_names?.length
                ? a.district_names.join(", ")
                : "Province-wide (Balochistan)";
              return (
                <Card key={a.id} className="flex flex-col justify-between p-5">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone={sev.tone}>{sev.label}</Badge>
                      <span className="text-xs capitalize text-ct-muted tabular-nums">
                        {a.hazard_type.replace(/_/g, " ")}
                        {a.published_at ? ` · ${fmtDate(a.published_at)}` : ""}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-ct-text">{a.title}</h3>
                    <p className="mt-1 text-xs font-medium text-ct-secondary">
                      Affected area: {area}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-ct-secondary">{a.message}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-ct-border pt-3">
                    <span className="text-xs text-ct-muted">Source: {a.source}</span>
                    <Button size="sm" variant="outline" onClick={() => setSelectedAlert(a)}>
                      Alert details
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION B: GET EMERGENCY HELP */}
      <section aria-labelledby="sec-help-title" className="space-y-4">
        <div>
          <h2 id="sec-help-title" className="text-lg font-bold text-ct-text">
            Get Emergency Help
          </h2>
          <p className="text-xs text-ct-muted">
            Direct access to verified medical care, contacts, rescue services, and safety guidance.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {HELP_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className="group flex min-h-[132px] flex-col justify-between rounded-2xl border border-ct-border bg-ct-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-[#21C7D9]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${card.accent}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-ct-muted transition group-hover:translate-x-0.5 group-hover:text-[#0b8a99] dark:group-hover:text-[#21C7D9]" />
                </div>
                <div className="mt-4">
                  <h3 className="text-base font-bold text-ct-text">{card.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ct-muted">{card.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* SECTION C & D: MY REPORTS + LOCATION */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* SECTION C: MY REPORTS */}
        <section aria-labelledby="sec-reports-title" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sec-reports-title" className="text-lg font-bold text-ct-text">
              My Reports
            </h2>
            <Link
              href="/report"
              className="text-xs font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
            >
              Submit or track all
            </Link>
          </div>
          <Card>
            {myReports.loading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : reportList.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-5 w-5" />}
                title="No submitted reports yet"
                text="Reports you submit appear here with their Reference ID and live verification status."
                action={
                  <Link href="/report" className="mt-2">
                    <Button size="sm" variant="emergency">
                      Report an Emergency
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-ct-border">
                {reportList.slice(0, 4).map((inc) => {
                  const typeMeta = INCIDENT_TYPES.find((t) => t.value === inc.type);
                  const lastAt = inc.history?.length
                    ? inc.history[inc.history.length - 1].at
                    : inc.created_at;
                  return (
                    <li key={inc.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#0b8a99] dark:text-[#21C7D9] tabular-nums">
                            {inc.code}
                          </span>
                          <span className="text-ct-muted">·</span>
                          <span className="font-medium text-ct-text">
                            {typeMeta?.label ?? inc.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-ct-muted tabular-nums">
                          Last update: {fmtDate(lastAt)}
                        </p>
                      </div>
                      <Badge tone={REPORT_TONE[inc.status]}>{STATUS_LABEL[inc.status]}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* SECTION D: LOCATION */}
        <section aria-labelledby="sec-location-title" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sec-location-title" className="text-lg font-bold text-ct-text">
              Location
            </h2>
            <Link
              href="/profile#location"
              className="text-xs font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
            >
              Manage location sharing
            </Link>
          </div>
          <Card className="p-5">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-ct-muted">
                  <Compass className="h-4 w-4 text-[#0b8a99] dark:text-[#21C7D9]" />
                  Location permission
                </dt>
                <dd className="font-semibold text-ct-text">
                  {PERM_LABEL[loc.permission] ?? loc.permission}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-ct-muted">
                  <MapPin className="h-4 w-4 text-[#0b8a99] dark:text-[#21C7D9]" />
                  Selected district
                </dt>
                <dd className="font-semibold text-ct-text">{selectedDistrictName}</dd>
              </div>

              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-ct-muted">
                  <CheckCircle2 className="h-4 w-4 text-[#0b8a99] dark:text-[#21C7D9]" />
                  Location accuracy
                </dt>
                <dd className="font-mono text-xs font-semibold text-ct-text tabular-nums">
                  {loc.accuracy !== null ? `±${Math.round(loc.accuracy)} m` : "Not measured yet"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 grid gap-3 border-t border-ct-border pt-4 sm:grid-cols-[1fr_auto]">
              <Select
                aria-label="Select your Balochistan district"
                value={loc.selectedDistrictId ? String(loc.selectedDistrictId) : ""}
                onChange={(e) =>
                  loc.setSelectedDistrictId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">All Balochistan districts</option>
                {(ds.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                loading={loc.locating}
                onClick={() => loc.requestGps()}
              >
                <Crosshair className="h-4 w-4" />
                {loc.lat !== null ? "Refresh GPS" : "Check GPS"}
              </Button>
            </div>
            {loc.error && <p className="mt-2 text-xs text-[#DC454D]">{loc.error}</p>}
          </Card>
        </section>
      </div>

      {/* Alert Details Modal */}
      <Modal
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert?.title ?? "Alert Details"}
        wide
      >
        {selectedAlert && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ALERT_META[selectedAlert.severity]?.tone ?? "blue"}>
                {ALERT_META[selectedAlert.severity]?.label ?? selectedAlert.severity}
              </Badge>
              <span className="text-xs capitalize text-ct-muted">
                {selectedAlert.hazard_type.replace(/_/g, " ")}
              </span>
              {selectedAlert.published_at && (
                <span className="text-xs text-ct-muted tabular-nums">
                  · Published {fmtDate(selectedAlert.published_at)}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-ct-secondary">
              Affected area:{" "}
              {selectedAlert.district_names?.length
                ? selectedAlert.district_names.join(", ")
                : "Province-wide (Balochistan)"}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed text-ct-text">
              {selectedAlert.message}
            </p>
            <div className="rounded-xl border border-[#21C7D9]/40 bg-[#21C7D9]/10 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0b8a99] dark:text-[#21C7D9]">
                <ShieldAlert className="h-4 w-4" />
                Safety Instructions
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ct-text">
                {selectedAlert.safety_instructions}
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-ct-border pt-3 text-xs text-ct-muted">
              <span>Verified Source: {selectedAlert.source}</span>
              <Link
                href="/alerts"
                className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
              >
                Open Public Alerts
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
