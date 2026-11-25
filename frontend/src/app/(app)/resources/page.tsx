"use client";
import { useMemo, useState } from "react";
import { Crosshair, ExternalLink, MapPin, Navigation, Phone, RotateCcw, Search, Siren } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { TYPE_META } from "@/components/map/CrisisMap";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Notice, PageHeader, Select, Skeleton, VerifiedBadge, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import { useMapData } from "@/lib/mapData";
import { resources } from "@/lib/services";
import type { AvailabilityStatus } from "@/lib/types";

const AVAIL_TONE: Record<AvailabilityStatus, "green" | "amber" | "orange" | "red"> = {
  available: "green",
  limited: "amber",
  full: "orange",
  offline: "red",
};

export default function ResourcesPage() {
  const { demo } = useAuth();
  const toast = useToast();
  const m = useMapData();
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [myPos, setMyPos] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const sorted = useAsync(
    () => (myPos && !demo ? resources.list({ lat: myPos.lat, lon: myPos.lon }) : Promise.resolve(null)),
    [myPos?.lat, myPos?.lon, demo],
    "sorted-res"
  );

  const all = sorted.data ?? m.data?.resources ?? [];
  const list = useMemo(
    () =>
      all.filter(
        (r) =>
          (type === "all" || r.type === type) &&
          (!district || String(r.district_id) === district) &&
          (!onlyVerified || r.verified) &&
          `${r.name} ${r.address ?? ""}`.toLowerCase().includes(q.toLowerCase())
      ),
    [all, type, q, district, onlyVerified]
  );
  const dn = new Map((m.data?.districts ?? []).map((d) => [d.id, d.name]));

  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("err", "Geolocation is not supported in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
        toast("ok", "Resources sorted nearest to your location.");
      },
      (err) => {
        setLocating(false);
        toast("err", err.message || "Could not read your GPS position.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (m.error) return <ErrorState message={m.error} onRetry={m.reload} />;
  return (
    <>
      <PageHeader
        title="Emergency resources"
        subtitle="Hospitals, shelters, fire services, ambulances and rescue centres. Only records added by administrators are shown, each labelled verified or unverified."
        actions={
          !demo && (
            <div className="flex items-center gap-2">
              {myPos && (
                <Button variant="ghost" size="sm" onClick={() => setMyPos(null)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset order
                </Button>
              )}
              <Button variant="outline" size="sm" loading={locating} onClick={locateMe}>
                <Crosshair className="h-3.5 w-3.5" /> {myPos ? "Update my location" : "Sort nearest to me"}
              </Button>
            </div>
          )
        }
      />
      {demo && (
        <div className="mb-4">
          <Notice>Demo mode has no resource records. No facilities or coordinates are invented. Sign in to a connected backend to see stored records.</Notice>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[["all", "All"], ...Object.entries(TYPE_META).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setType(k)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              type === k ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-line text-slate-300 hover:border-cyan-400/50"
            )}
          >
            {l}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} className="accent-cyan-400" />
          Verified only
        </label>
      </div>
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card className="flex max-h-[calc(100vh-240px)] min-h-[420px] flex-col">
          <div className="grid grid-cols-[1fr_135px] gap-2 border-b border-line p-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input className="pl-9" placeholder="Search name or address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search resources" />
            </div>
            <Select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Filter by district">
              <option value="">All districts</option>
              {(m.data?.districts ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <ul className="flex-1 divide-y divide-line/60 overflow-auto">
            {m.loading || sorted.loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="m-3 h-20" />)
            ) : list.length === 0 ? (
              <EmptyState
                icon={<Siren className="h-5 w-5" />}
                title={all.length ? "No resources match your filters" : "No resource records yet"}
                text={all.length ? "Try clearing the search or filters." : "Administrators add verified hospitals, shelters and rescue centres in Admin → Resources."}
              />
            ) : (
              list.map((r) => (
                <li key={r.id} className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-white">{r.name}</p>
                    <VerifiedBadge ok={r.verified} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex items-center gap-1.5" style={{ color: TYPE_META[r.type]?.color }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: TYPE_META[r.type]?.color }} />
                      {TYPE_META[r.type]?.label}
                    </span>
                    {r.district_id && <span className="text-slate-500">· {dn.get(r.district_id)}</span>}
                    {r.availability_status && (
                      <Badge tone={AVAIL_TONE[r.availability_status] ?? "neutral"} className="capitalize">
                        {r.availability_status}
                      </Badge>
                    )}
                    {r.capacity !== undefined && r.capacity !== null && <span className="text-slate-400">Cap: {r.capacity}</span>}
                    {r.distance_km !== undefined && <Badge tone="cyan">{r.distance_km.toFixed(1)} km away</Badge>}
                  </div>
                  <p className="flex items-center gap-2 text-sm text-slate-300">
                    <Phone className="h-3.5 w-3.5 text-slate-500" />
                    {r.phone ? (
                      <a className="text-cyan-300 hover:underline" href={`tel:${r.phone}`}>
                        {r.phone}
                      </a>
                    ) : (
                      "No phone on record"
                    )}
                  </p>
                  {r.address && (
                    <p className="flex items-start gap-2 text-sm text-slate-400">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                      {r.address}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                    <span>Source: {r.source}</span>
                    <div className="flex items-center gap-3">
                      <a
                        className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.openstreetmap.org/directions?to=${r.latitude}%2C${r.longitude}`}
                      >
                        <Navigation className="h-3 w-3" /> Directions
                      </a>
                      <a
                        className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=15/${r.latitude}/${r.longitude}`}
                      >
                        Map <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-line px-4 py-2 text-xs text-slate-500">
            {list.length} of {all.length} shown{myPos ? " · ordered by distance" : ""}
          </div>
        </Card>
        <div>
          {m.data ? (
            <MapView
              boundaries={m.data.boundaries}
              riskByName={{}}
              resources={list}
              focus={myPos ? { lat: myPos.lat, lon: myPos.lon, label: "Your location" } : null}
              height="calc(100vh - 240px)"
              className="min-h-[420px]"
            />
          ) : (
            <Skeleton className="h-[60vh]" />
          )}
        </div>
      </div>
    </>
  );
}
