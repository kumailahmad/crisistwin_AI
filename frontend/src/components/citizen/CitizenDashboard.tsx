"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Ambulance,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Flame,
  Hospital,
  LifeBuoy,
  LogIn,
  Megaphone,
  Phone,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { TrackReportBox } from "@/components/incidents/TrackReportBox";
import { Badge, Button, buttonClasses, Card, EmptyState, Modal, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { alerts as alertsApi, incidents as incidentsApi } from "@/lib/services";
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

const HELP_SHORTCUTS = [
  {
    title: "Hospitals",
    desc: "Verified medical facilities and emergency rooms.",
    href: "/resources?type=hospital",
    icon: Hospital,
    accent: "text-[#0b8a99] dark:text-[#21C7D9] bg-[#21C7D9]/12",
  },
  {
    title: "Ambulance",
    desc: "Nearby ambulance units and transport contacts.",
    href: "/resources?type=ambulance",
    icon: Ambulance,
    accent: "text-[#DC454D] bg-[#DC454D]/12",
  },
  {
    title: "Rescue",
    desc: "PDMA & provincial rescue centers and shelters.",
    href: "/resources?type=rescue_center",
    icon: LifeBuoy,
    accent: "text-amber-700 dark:text-[#E9A23B] bg-[#E9A23B]/15",
  },
  {
    title: "Fire",
    desc: "Fire brigade stations and response teams.",
    href: "/resources?type=fire_service",
    icon: Flame,
    accent: "text-orange-700 dark:text-orange-300 bg-orange-500/12",
  },
  {
    title: "Emergency Helplines",
    desc: "Official numbers including Police 15 and hospitals.",
    href: "/resources?tab=contacts",
    icon: Phone,
    accent: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/12",
  },
] as const;

export function CitizenDashboard() {
  const { user, guestChosen, continueAsGuest } = useAuth();
  const publicAlerts = useAsync(() => alertsApi.list().catch(() => []), [], "home-alerts");
  const myReports = useAsync(
    () => (user ? incidentsApi.mine().catch(() => []) : Promise.resolve([])),
    [user?.id],
    user ? `home-reports-${user.id}` : undefined
  );

  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const alertList = publicAlerts.data ?? [];
  const reportList = myReports.data ?? [];

  return (
    <div className="space-y-8">
      {/* Optional Account Access Screen Card (never blocks dashboard) */}
      {!user && !guestChosen && (
        <Card className="border-[#21C7D9]/40 bg-ct-surface p-6 sm:p-7">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0b8a99] dark:text-[#21C7D9]">
                Optional Account Access
              </p>
              <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-ct-text sm:text-3xl">
                Welcome to CRISISTWIN AI
              </h1>
              <p className="mt-1.5 text-sm text-ct-secondary sm:text-base">
                Your emergency companion for a safer Balochistan.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="lg"
                variant="primary"
                onClick={continueAsGuest}
                className="min-h-[48px] font-bold"
              >
                <UserCheck className="h-4 w-4" />
                CONTINUE AS GUEST
              </Button>
              <Link
                href="/login"
                className={buttonClasses({ variant: "outline", size: "lg", className: "w-full min-h-[48px] sm:w-auto" })}
              >
                <LogIn className="h-4 w-4" />
                SIGN IN / CREATE ACCOUNT
              </Link>
            </div>
          </div>
        </Card>
      )}

      {!user && guestChosen && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ct-border bg-ct-surface px-4 py-2.5 text-xs">
          <span className="flex items-center gap-2 font-medium text-ct-secondary">
            <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
            Guest access active — report emergencies, view public alerts, and use the AI assistant immediately.
          </span>
          <Link href="/login" className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
            Sign In / Create Account
          </Link>
        </div>
      )}

      {/* 1. REPORT AN EMERGENCY (Largest & most prominent action) */}
      <section aria-labelledby="sec-report-cta" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1424] via-[#11243A] to-[#0B1424] p-7 text-[#EDF5FA] shadow-card sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-[#21C7D9]/15 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21C7D9]">
            Balochistan Public Safety Portal
          </p>
          <h2 id="sec-report-cta" className="mt-2.5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Need to Report an Emergency?
          </h2>
          <p className="mt-2.5 text-base leading-relaxed text-slate-200">
            Share the emergency category, photo, GPS pin, and details in seconds — available to both guests and registered citizens.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/report"
              className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-2xl bg-[#DC454D] px-8 py-4 text-base font-extrabold tracking-wide text-white shadow-lg transition hover:bg-[#c53a42] focus-visible:outline-white"
            >
              <Megaphone className="h-5 w-5 shrink-0" />
              REPORT AN EMERGENCY
            </Link>
            <a
              href="tel:15"
              className="inline-flex min-h-[56px] items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              <Phone className="h-4 w-4 text-[#21C7D9]" />
              Immediate Danger? Call 15
            </a>
          </div>
        </div>
      </section>

      {/* 2. LATEST PUBLIC ALERTS */}
      <section aria-labelledby="sec-alerts-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="sec-alerts-title" className="text-lg font-bold text-ct-text">
              Latest Public Alerts
            </h2>
            <p className="text-xs text-ct-muted">
              Verified official emergency advisories and warnings across Balochistan.
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
                    <p className="mt-1 text-xs font-medium text-ct-secondary">District: {area}</p>
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

      {/* 3. EMERGENCY HELP */}
      <section aria-labelledby="sec-help-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="sec-help-title" className="text-lg font-bold text-ct-text">
              Emergency Help
            </h2>
            <p className="text-xs text-ct-muted">
              Hospitals, ambulance, rescue centers, fire services, and official helplines with direct calling.
            </p>
          </div>
          <Link
            href="/resources"
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
          >
            All resources <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          {HELP_SHORTCUTS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className="group flex flex-col justify-between rounded-2xl border border-ct-border bg-ct-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-[#21C7D9]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${card.accent}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-ct-muted transition group-hover:translate-x-0.5 group-hover:text-[#0b8a99] dark:group-hover:text-[#21C7D9]" />
                </div>
                <div className="mt-3.5">
                  <h3 className="text-sm font-bold text-ct-text">{card.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ct-muted">{card.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 4. AI EMERGENCY ASSISTANT + 5. MY REPORTS / TRACK REPORT */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 4. AI EMERGENCY ASSISTANT */}
        <section aria-labelledby="sec-ai-title" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sec-ai-title" className="text-lg font-bold text-ct-text">
              AI Emergency Assistant
            </h2>
            <Badge tone="cyan">EN · اردو · بلوچی</Badge>
          </div>
          <Card className="flex flex-col justify-between p-5 sm:p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#21C7D9]/15 text-[#0b8a99] ring-1 ring-[#21C7D9]/35 dark:text-[#21C7D9]">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ct-text">Ask Disaster Safety Questions</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ct-secondary sm:text-sm">
                    Get instant preparedness guidance, verified alert explanations, and nearby hospital contacts in English, Urdu, or Balochi.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  "What should I do during a flood?",
                  "Find nearby verified hospitals",
                ].map((q) => (
                  <Link
                    key={q}
                    href={`/assistant?q=${encodeURIComponent(q)}`}
                    className="rounded-xl border border-ct-border bg-ct-soft/70 px-3 py-2 text-xs font-medium text-ct-text transition hover:border-[#21C7D9] hover:bg-[#21C7D9]/10"
                  >
                    {q}
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-ct-border pt-4">
              <span className="text-xs text-ct-muted">Open to guests &amp; registered citizens</span>
              <Link href="/assistant" className={buttonClasses({ variant: "navy", size: "sm" })}>
                <Bot className="h-4 w-4" />
                Open AI Assistant
              </Link>
            </div>
          </Card>
        </section>

        {/* 5. MY REPORTS / TRACK REPORT */}
        <section aria-labelledby="sec-reports-title" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sec-reports-title" className="text-lg font-bold text-ct-text">
              {user ? "My Reports" : "Track My Report"}
            </h2>
            <Link
              href="/report"
              className="text-xs font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
            >
              Submit a report
            </Link>
          </div>

          {user ? (
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
                  text="Reports you submit appear here with their Reference ID and live verification timeline."
                  action={
                    <Link href="/report" className={buttonClasses({ size: "sm", variant: "emergency", className: "mt-2" })}>
                      Report an Emergency
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
          ) : (
            <TrackReportBox compact />
          )}
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
            <p className="whitespace-pre-wrap leading-relaxed text-ct-text">{selectedAlert.message}</p>
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
              <Link href="/alerts" className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
                Open Public Alerts
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
