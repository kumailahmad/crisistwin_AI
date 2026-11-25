"use client";
import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, Card, EmptyState, ErrorState, Notice, PageHeader, Select, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { alerts, districts } from "@/lib/services";
import type { AlertItem } from "@/lib/types";

const SEV_TONE: Record<AlertItem["severity"], "cyan" | "amber" | "orange" | "red"> = {
  advisory: "cyan",
  watch: "amber",
  warning: "orange",
  emergency: "red",
};

export default function CitizenAlertsPage() {
  const { demo } = useAuth();
  const [districtId, setDistrictId] = useState("");
  const ds = useAsync(() => districts.list(), [], "districts");
  const list = useAsync(() => alerts.list(districtId ? { district_id: Number(districtId) } : {}), [districtId]);

  const activeAlerts = useMemo(() => list.data ?? [], [list.data]);

  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;

  return (
    <>
      <PageHeader
        title="Emergency alerts & advisories"
        subtitle="Verified public alerts published by platform administrators. Unverified citizen reports never appear as official alerts."
        actions={
          <Select
            className="w-52"
            value={districtId}
            onChange={(e) => setDistrictId(e.target.value)}
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
        <div className="mb-5">
          <Notice>
            Demo mode does not connect to live alert streams. Sign in with an account to receive administrator-published district advisories.
          </Notice>
        </div>
      )}

      {list.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : activeAlerts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No active public alerts"
            text="No official advisories, watches, or emergency warnings are currently published for the selected filter. Always follow local PDMA and district administration channels."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {activeAlerts.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-300" />
                  <h2 className="text-base font-bold text-white">{a.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={SEV_TONE[a.severity]}>{a.severity.toUpperCase()}</Badge>
                  <span className="text-xs capitalize text-slate-400">{a.hazard_type.replace(/_/g, " ")}</span>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{a.message}</p>
              <div className="mt-3 rounded-xl border border-line bg-ink-900/80 p-3 text-xs text-slate-300">
                <p className="font-semibold text-cyan-200">Safety guidance</p>
                <p className="mt-1">{a.safety_instructions}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>
                  Area: {a.district_names?.length ? a.district_names.join(", ") : "Province-wide (Balochistan)"}
                </span>
                <span aria-hidden="true">·</span>
                <span>Source: {a.source}</span>
                {a.published_at && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Published {fmtDate(a.published_at)}</span>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
