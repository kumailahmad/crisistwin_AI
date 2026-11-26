"use client";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Hospital,
  Info,
  LogIn,
  Megaphone,
  Phone,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { BalochistanOutline } from "@/components/citizen/BalochistanOutline";
import { Button, buttonClasses } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAsync } from "@/lib/hooks";
import { alerts as alertsApi, incidents as incidentsApi } from "@/lib/services";

export function CitizenDashboard() {
  const { user, guestChosen, continueAsGuest } = useAuth();

  const publicAlerts = useAsync(() => alertsApi.list().catch(() => []), [], "home-alerts");
  const myReports = useAsync(
    () => (user ? incidentsApi.mine().catch(() => []) : Promise.resolve([])),
    [user?.id],
    user ? `home-reports-${user.id}` : undefined
  );

  const alertCount = publicAlerts.data?.length ?? 0;
  const latestAlert = publicAlerts.data?.[0] ?? null;
  const myReportCount = myReports.data?.length ?? 0;

  const portalDestinations = [
    {
      title: "Latest Public Alerts",
      detail: publicAlerts.loading
        ? "Checking verified advisories…"
        : alertCount === 0
          ? "No active warnings · View alert archive"
          : `${alertCount} verified alert${alertCount === 1 ? "" : "s"} · ${latestAlert?.title ?? "View details"}`,
      href: "/alerts",
      icon: ShieldAlert,
      accent: "text-[#DC454D]",
    },
    {
      title: "Emergency Help",
      detail: "Hospitals, ambulance, rescue centers, fire & 15 helplines",
      href: "/resources",
      icon: Hospital,
      accent: "text-[#0b8a99] dark:text-[#21C7D9]",
    },
    {
      title: "AI Emergency Assistant",
      detail: "Preparedness & safety guidance in English · اردو · بلوچی",
      href: "/assistant",
      icon: Bot,
      accent: "text-[#0b8a99] dark:text-[#21C7D9]",
    },
    {
      title: user ? "My Reports & Tracking" : "Track My Report",
      detail: user
        ? myReportCount === 0
          ? "View live status of your submitted reports"
          : `${myReportCount} submitted report${myReportCount === 1 ? "" : "s"} · Check progress`
        : "Look up report status with your Reference ID & PIN",
      href: "/report#track",
      icon: ClipboardCheck,
      accent: "text-amber-700 dark:text-[#E9A23B]",
    },
    {
      title: "About & Balochistan Districts",
      detail: "How CRISISTWIN AI works, 26 districts, privacy & safety guide",
      href: "/about",
      icon: Info,
      accent: "text-ct-secondary",
    },
  ] as const;

  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 sm:gap-4 lg:h-full">
      {/* Compact Optional Account Access Strip (zero clutter, stays above the fold) */}
      {!user && !guestChosen ? (
        <section
          aria-label="Optional Account Access"
          className="flex min-w-0 flex-col justify-between gap-2.5 rounded-2xl border border-ct-border bg-ct-surface px-4 py-3 shadow-card sm:flex-row sm:items-center sm:px-5 sm:py-3.5"
        >
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-ct-text sm:text-lg">
              Welcome to CRISISTWIN AI
            </h1>
            <p className="text-xs text-ct-secondary sm:text-sm">
              Your emergency companion for a safer Balochistan.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={continueAsGuest}
              className="min-h-[40px] px-3.5 text-xs font-bold sm:min-h-[42px] sm:px-4 sm:text-sm"
            >
              <UserCheck className="h-4 w-4 shrink-0" />
              CONTINUE AS GUEST
            </Button>
            <Link
              href="/login"
              className={buttonClasses({
                variant: "outline",
                size: "sm",
                className: "min-h-[40px] px-3.5 text-xs sm:min-h-[42px] sm:px-4 sm:text-sm",
              })}
            >
              <LogIn className="h-4 w-4 shrink-0" />
              SIGN IN / CREATE ACCOUNT
            </Link>
          </div>
        </section>
      ) : !user ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ct-border bg-ct-surface px-4 py-2 text-xs">
          <span className="flex items-center gap-2 font-medium text-ct-secondary">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" />
            Guest access active — all emergency features are ready.
          </span>
          <Link href="/login" className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
            Sign In / Create Account
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ct-border bg-ct-surface px-4 py-2 text-xs">
          <span className="font-medium text-ct-secondary">
            Signed in as <strong className="text-ct-text">{user.full_name || user.email}</strong>
          </span>
          <Link href="/profile" className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
            Account &amp; Preferences
          </Link>
        </div>
      )}

      {/* Main Clean Zero-Scroll Home Split */}
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3.5 sm:gap-5 lg:min-h-0 lg:grid-cols-12 lg:items-stretch">
        {/* Primary Focal Anchor: Report an Emergency + Balochistan Map Outline */}
        <section
          aria-labelledby="sec-report-cta"
          className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1424] via-[#11243A] to-[#0B1424] p-5 text-[#EDF5FA] shadow-card sm:p-7 lg:col-span-7"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-[#21C7D9]/12 blur-3xl"
          />

          <div className="relative flex flex-1 flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="min-w-0 max-w-lg space-y-3 sm:space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#21C7D9] sm:text-xs">
                Balochistan Public Safety Portal
              </p>
              <h2
                id="sec-report-cta"
                className="text-2xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-4xl"
              >
                Stay Safe. Report &amp; Get Help Fast.
              </h2>
              <p className="text-xs leading-relaxed text-slate-300 sm:text-base">
                Submit emergencies with photos and GPS location, check verified warnings, and locate nearby hospitals — no login required.
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Link
                  href="/report"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[#DC454D] px-5 py-3 text-sm font-extrabold tracking-wide text-white shadow-lg transition hover:bg-[#c53a42] focus-visible:outline-white sm:min-h-[50px] sm:text-[15px]"
                >
                  <Megaphone className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                  REPORT AN EMERGENCY
                </Link>
                <a
                  href="tel:15"
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:min-h-[50px]"
                >
                  <Phone className="h-4 w-4 shrink-0 text-[#21C7D9]" />
                  Call Police 15
                </a>
              </div>
            </div>

            <div className="hidden shrink-0 sm:block lg:w-[225px] xl:w-[260px]">
              <BalochistanOutline className="h-auto w-full opacity-95" />
            </div>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-slate-300 sm:mt-5 sm:pt-3.5 sm:text-xs">
            <span>Predict Risks · Simulate Disasters · Save Lives</span>
            <span className="tabular-nums text-[#21C7D9]">26 Balochistan Districts</span>
          </div>
        </section>

        {/* Right Clean Portal Directory (all data lives cleanly inside dedicated pages) */}
        <nav
          aria-label="Citizen sections"
          className="flex min-w-0 flex-col justify-between overflow-hidden rounded-3xl border border-ct-border bg-ct-surface shadow-card lg:col-span-5"
        >
          <div className="border-b border-ct-border px-4 py-3 sm:px-5 sm:py-3.5">
            <h2 className="text-sm font-bold tracking-tight text-ct-text">
              Explore Emergency Services
            </h2>
            <p className="text-xs text-ct-muted">
              Open each dedicated section directly
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col divide-y divide-ct-border">
            {portalDestinations.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-ct-soft/70 sm:px-5 sm:py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ct-soft text-ct-text transition group-hover:bg-[#21C7D9]/15 sm:h-10 sm:w-10">
                      <Icon className={`h-[18px] w-[18px] ${item.accent}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ct-text group-hover:text-[#0b8a99] dark:group-hover:text-[#21C7D9]">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-ct-muted">{item.detail}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ct-muted transition group-hover:translate-x-0.5 group-hover:text-[#0b8a99] dark:group-hover:text-[#21C7D9]" />
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Quiet Bottom Strip */}
      <footer className="hidden items-center justify-between gap-4 border-t border-ct-border/80 pt-2.5 text-xs text-ct-muted lg:flex">
        <span>CRISISTWIN AI · Balochistan Emergency &amp; Digital Twin System</span>
        <div className="flex items-center gap-4">
          <Link href="/about#safety" className="hover:text-ct-text">
            Safety Guidelines
          </Link>
          <Link href="/about#privacy" className="hover:text-ct-text">
            Privacy
          </Link>
          <Link href="/staff-access" className="hover:text-ct-text">
            Staff Sign-In
          </Link>
        </div>
      </footer>
    </div>
  );
}
