"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, MapPin, ShieldAlert } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatCard } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { useMapData } from "@/lib/mapData";
import { alerts, incidents } from "@/lib/services";
import { INCIDENT_TYPES, SEVERITY, STATUS_LABEL, type IncidentStatus } from "@/lib/types";
import { Activity, AlertTriangle, Megaphone, Siren } from "lucide-react";

const TONE: Record<IncidentStatus, "amber" | "green" | "red" | "cyan"> = {
  pending: "amber",
  under_review: "cyan",
  verified: "green",
  response_assigned: "cyan",
  resolved: "green",
  rejected: "red",
};

export default function AdminMonitoringPage() {
  const m = useMapData();
  const incQ = useAsync(() => incidents.list(), [], "admin-monitoring-incidents");
  const alertQ = useAsync(() => alerts.list({ all: true }), [], "admin-monitoring-alerts");

  const [districtId, setDistrictId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const filteredIncidents = useMemo(
    () =>
      (incQ.data ?? []).filter(
        (i) =>
          (!districtId || String(i.district_id) === districtId) &&
          (!statusFilter || i.status === statusFilter) &&
          (!typeFilter || i.type === typeFilter)
      ),
    [incQ.data, districtId, statusFilter, typeFilter]
  );

  const filteredResources = useMemo(
    () => (m.data?.resources ?? []).filter((r) => !districtId || String(r.district_id) === districtId),
    [m.data?.resources, districtId]
  );

  const publishedAlerts = useMemo(
    () =>
      (alertQ.data ?? []).filter(
        (a) => a.status === "published" && (!districtId || a.district_ids.length === 0 || a.district_ids.includes(Number(districtId)))
      ),
    [alertQ.data, districtId]
  );

  if (m.error) return <ErrorState message={m.error} onRetry={m.reload} />;

  return (
    <>
      <PageHeader
        title="Disaster monitoring"
        subtitle="Operational GIS overlay of all reported incidents (including pending/historical), district risk categories, drainage corridors, and emergency resources."
        actions={
          <div className="flex gap-2">
            <Link href="/admin/alerts">
              <Button variant="outline" size="sm">
                <ShieldAlert className="h-3.5 w-3.5" /> Manage alerts
              </Button>
            </Link>
            <Link href="/admin/incidents">
              <Button size="sm">
                Review incidents <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Incidents (filtered)" value={filteredIncidents.length} hint={`${(incQ.data ?? []).filter((x) => x.status === "pending" || x.status === "under_review").length} awaiting triage`} icon={<Megaphone className="h-4 w-4" />} accent="#fb923c" />
        <StatCard label="Active published alerts" value={publishedAlerts.length} icon={<AlertTriangle className="h-4 w-4" />} accent="#ef4444" />
        <StatCard label="Resources shown" value={filteredResources.length} icon={<Siren className="h-4 w-4" />} accent="#22d3ee" />
        <StatCard label="Districts with risk score" value={Object.keys(m.riskByName).length} icon={<Activity className="h-4 w-4" />} accent="#34d399" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="w-48" value={districtId} onChange={(e) => {
          setDistrictId(e.target.value);
          const d = m.data?.districts.find((x) => String(x.id) === e.target.value);
          setSelectedName(d ? d.name : null);
        }} aria-label="Filter by district">
          <option value="">All districts</option>
          {(m.data?.districts ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select className="w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as IncidentStatus[]).map((st) => (
            <option key={st} value={st}>
              {STATUS_LABEL[st]}
            </option>
          ))}
        </Select>
        <Select className="w-48" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by hazard type">
          <option value="">All hazard types</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden p-3">
          {m.loading || !m.data ? (
            <Skeleton className="h-[520px]" />
          ) : (
            <MapView
              boundaries={m.data.boundaries}
              riskByName={m.riskByName}
              resources={filteredResources}
              incidents={filteredIncidents}
              selectedName={selectedName}
              onSelect={setSelectedName}
              height="520px"
            />
          )}
        </Card>

        <Card className="flex max-h-[546px] flex-col">
          <CardHeader title="Incident stream" subtitle={`${filteredIncidents.length} matching report(s)`} />
          {incQ.loading ? (
            <Skeleton className="m-4 h-32" />
          ) : !filteredIncidents.length ? (
            <EmptyState title="No incidents in view" text="Adjust district or status filters." />
          ) : (
            <ul className="flex-1 divide-y divide-line/60 overflow-auto">
              {filteredIncidents.slice(0, 30).map((i) => (
                <li key={i.id} className="space-y-1 p-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-cyan-300">{i.code}</span>
                    <Badge tone={TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                  </div>
                  <p className="text-sm font-medium text-white">
                    {INCIDENT_TYPES.find((t) => t.value === i.type)?.emoji} {INCIDENT_TYPES.find((t) => t.value === i.type)?.label} ·{" "}
                    <span style={{ color: SEVERITY[i.severity].color }}>{SEVERITY[i.severity].label}</span>
                  </p>
                  <p className="line-clamp-2 text-slate-400">{i.description}</p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-500">
                    <MapPin className="h-3 w-3" /> {i.district_name ?? `${i.latitude.toFixed(3)}, ${i.longitude.toFixed(3)}`} · {fmtDate(i.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
