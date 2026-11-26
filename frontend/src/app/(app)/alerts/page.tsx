"use client";
import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, Card, EmptyState, ErrorState, Notice, PageHeader, Select, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { fmtDate, useAsync } from "@/lib/hooks";
import { useCitizenLocation } from "@/lib/hooks/useCitizenLocation";
import { alerts, districts } from "@/lib/services";
import type { AlertItem } from "@/lib/types";

type AlertTab = "all" | "my_district" | "critical" | "high" | "resolved";

const SEVERITY_META: Record<
  AlertItem["severity"],
  { label: string; tone: "red" | "orange" | "amber" | "blue"; bar: string }
> = {
  emergency: { label: "Critical", tone: "red", bar: "bg-[#DC454D]" },
  warning: { label: "High", tone: "orange", bar: "bg-orange-500" },
  watch: { label: "Moderate", tone: "amber", bar: "bg-[#E9A23B]" },
  advisory: { label: "Information", tone: "blue", bar: "bg-sky-500" },
};

const TABS: { id: AlertTab; label: string }[] = [
  { id: "all", label: "All Alerts" },
  { id: "my_district", label: "My District" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "resolved", label: "Resolved" },
];

export default function CitizenAlertsPage() {
  const { demo } = useAuth();
  const ds = useAsync(() => districts.list().catch(() => []), [], "alerts-districts");
  const loc = useCitizenLocation(ds.data ?? []);
  const [tab, setTab] = useState<AlertTab>("all");
  const [manualDistrictId, setManualDistrictId] = useState("");

  const list = useAsync(
    () => (demo ? Promise.resolve([]) : alerts.list({ include_expired: true })),
    [demo],
    "citizen-alerts"
  );

  const effectiveDistrictId = manualDistrictId
    ? Number(manualDistrictId)
    : loc.selectedDistrictId;

  const filtered = useMemo(() => {
    const all = list.data ?? [];
    const now = Date.now();
    const isResolved = (a: AlertItem) =>
      a.status === "expired" || (Boolean(a.expires_at) && new Date(a.expires_at!).getTime() <= now);

    return all.filter((a) => {
      if (a.status === "draft") return false;
      const resolved = isResolved(a);
      if (tab === "resolved") return resolved;
      if (resolved) return false;
      if (tab === "critical") return a.severity === "emergency";
      if (tab === "high") return a.severity === "warning";
      if (tab === "my_district" && effectiveDistrictId) {
        return a.district_ids.length === 0 || a.district_ids.includes(effectiveDistrictId);
      }
      return true;
    });
  }, [list.data, tab, effectiveDistrictId]);

  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Public Emergency Alerts"
        subtitle="Only verified official alerts published by emergency administrators are shown."
        actions={
          <Select
            className="w-56"
            value={manualDistrictId || (loc.selectedDistrictId ? String(loc.selectedDistrictId) : "")}
            onChange={(e) => {
              setManualDistrictId(e.target.value);
              if (e.target.value) loc.setSelectedDistrictId(Number(e.target.value));
            }}
            aria-label="Filter alerts by district"
          >
            <option value="">All Balochistan districts</option>
            {(ds.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        }
      />

      {demo && (
        <Notice>
          Preview mode does not connect to live alert feeds. Sign in with an account to receive verified district advisories.
        </Notice>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter alerts">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-[42px] rounded-xl border px-4 py-2 text-xs font-semibold transition",
              tab === t.id
                ? "border-[#21C7D9] bg-[#21C7D9]/15 text-[#0b7280] dark:text-[#21C7D9]"
                : "border-ct-border bg-ct-surface text-ct-secondary hover:border-[#21C7D9]/50 hover:text-ct-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No new verified emergency alerts in your area."
            text={
              tab === "resolved"
                ? "There are no expired or resolved official alerts recorded yet."
                : "Official alerts published by PDMA or platform administrators will appear here."
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((a) => {
            const sev = SEVERITY_META[a.severity] ?? SEVERITY_META.advisory;
            const resolved =
              a.status === "expired" ||
              (Boolean(a.expires_at) && new Date(a.expires_at!).getTime() <= Date.now());
            return (
              <Card key={a.id} className="overflow-hidden p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={sev.tone}>{sev.label}</Badge>
                      {resolved && <Badge tone="neutral">Resolved</Badge>}
                      <span className="text-xs font-medium capitalize text-ct-muted">
                        {a.hazard_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <h2 className="mt-2.5 flex items-center gap-2 text-lg font-bold text-ct-text">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-[#DC454D]" />
                      {a.title}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-ct-secondary">
                      Affected district:{" "}
                      {a.district_names?.length
                        ? a.district_names.join(", ")
                        : "Province-wide (Balochistan)"}
                    </p>
                  </div>
                  {a.published_at && (
                    <span className="text-xs text-ct-muted tabular-nums">
                      Published {fmtDate(a.published_at)}
                    </span>
                  )}
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ct-text">
                  {a.message}
                </p>

                <div className="mt-4 rounded-xl border border-ct-border bg-ct-soft p-3.5 text-xs">
                  <p className="font-bold uppercase tracking-wider text-[#0b8a99] dark:text-[#21C7D9]">
                    Safety Instructions
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ct-text">
                    {a.safety_instructions}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ct-muted">
                  <span>Source: {a.source}</span>
                  {a.expires_at && (
                    <span className="tabular-nums">Expires: {fmtDate(a.expires_at)}</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
