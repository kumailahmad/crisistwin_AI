"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Crosshair,
  ExternalLink,
  Map as MapIcon,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
  Search,
  Siren,
} from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { TYPE_META } from "@/components/map/CrisisMap";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  VerifiedBadge,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import { useMapData } from "@/lib/mapData";
import { resources } from "@/lib/services";
import type { AvailabilityStatus } from "@/lib/types";

type Helpline = {
  id: string;
  name: string;
  number: string;
  category: string;
  scope: string;
  confidence: "official" | "secondary" | "unconfirmed" | "outdated";
  note: string;
  source: { title: string; url: string };
};

type ContactsDirectory = {
  retrieved: string;
  disclaimer: string;
  helplines: Helpline[];
  hospitals_source: { title: string; url: string };
  hospitals: { name: string; district: string; phone: string | null }[];
};

const AVAIL_TONE: Record<AvailabilityStatus, "green" | "amber" | "orange" | "red"> = {
  available: "green",
  limited: "amber",
  full: "orange",
  offline: "red",
};

const CONF_META = {
  official: { tone: "green", label: "Official source" },
  secondary: { tone: "cyan", label: "Secondary source" },
  unconfirmed: { tone: "amber", label: "Unconfirmed" },
  outdated: { tone: "amber", label: "Outdated source" },
} as const;

const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

function GetHelpContent() {
  const { demo } = useAuth();
  const toast = useToast();
  const sp = useSearchParams();
  const m = useMapData();

  const initialTab = sp.get("tab") === "contacts" ? "contacts" : "facilities";
  const initialType = sp.get("type") === "rescue" ? "rescue_center" : sp.get("type") || "all";

  const [tab, setTab] = useState<"facilities" | "contacts">(initialTab);
  const [type, setType] = useState(initialType);
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [myPos, setMyPos] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const t = sp.get("tab");
    const tp = sp.get("type");
    if (t === "contacts") setTab("contacts");
    if (tp) {
      setTab("facilities");
      setType(tp === "rescue" ? "rescue_center" : tp);
    }
  }, [sp]);

  const contactsQuery = useAsync(
    () =>
      fetch("/data/emergency_contacts.json").then((r) => {
        if (!r.ok) throw new Error("Could not load emergency contacts directory");
        return r.json() as Promise<ContactsDirectory>;
      }),
    [],
    "help-contacts"
  );

  const sorted = useAsync(
    () =>
      myPos && !demo ? resources.list({ lat: myPos.lat, lon: myPos.lon }) : Promise.resolve(null),
    [myPos?.lat, myPos?.lon, demo],
    "sorted-res"
  );

  const allFacilities = sorted.data ?? m.data?.resources ?? [];
  const filteredFacilities = useMemo(
    () =>
      allFacilities.filter(
        (r) =>
          (type === "all" || r.type === type) &&
          (!district || String(r.district_id) === district) &&
          (!onlyVerified || r.verified) &&
          `${r.name} ${r.address ?? ""}`.toLowerCase().includes(q.toLowerCase())
      ),
    [allFacilities, type, q, district, onlyVerified]
  );

  const dn = useMemo(
    () => new Map((m.data?.districts ?? []).map((d) => [d.id, d.name])),
    [m.data?.districts]
  );

  const contactDistricts = useMemo(
    () => [...new Set((contactsQuery.data?.hospitals ?? []).map((h) => h.district))].sort(),
    [contactsQuery.data]
  );

  const filteredHospitals = useMemo(
    () =>
      (contactsQuery.data?.hospitals ?? []).filter(
        (h) =>
          (!district || h.district === district) &&
          h.name.toLowerCase().includes(q.toLowerCase())
      ),
    [contactsQuery.data, district, q]
  );

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
        toast("ok", "Facilities sorted nearest to your location.");
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
    <div className="space-y-6">
      <PageHeader
        title="Get Emergency Help"
        subtitle="Verified hospitals, rescue centres, ambulance & fire services, shelters, and official helplines."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!demo && tab === "facilities" && (
              <>
                {myPos && (
                  <Button variant="ghost" size="sm" onClick={() => setMyPos(null)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reset distance
                  </Button>
                )}
                <Button variant="outline" size="sm" loading={locating} onClick={locateMe}>
                  <Crosshair className="h-3.5 w-3.5" />
                  {myPos ? "Update GPS" : "Find Nearby"}
                </Button>
              </>
            )}
            <Link href="/assistant">
              <Button variant="navy" size="sm">
                <Bot className="h-4 w-4" /> AI Safety Assistant
              </Button>
            </Link>
          </div>
        }
      />

      {/* Top Mode Tabs: Facilities vs Emergency Contacts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Help sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "facilities"}
            onClick={() => {
              setTab("facilities");
              setDistrict("");
            }}
            className={cn(
              "min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold transition",
              tab === "facilities"
                ? "border-[#21C7D9] bg-[#21C7D9]/15 text-[#0b7280] dark:text-[#21C7D9]"
                : "border-ct-border bg-ct-surface text-ct-secondary hover:text-ct-text"
            )}
          >
            Hospitals &amp; Rescue Facilities
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "contacts"}
            onClick={() => {
              setTab("contacts");
              setDistrict("");
            }}
            className={cn(
              "min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold transition",
              tab === "contacts"
                ? "border-[#21C7D9] bg-[#21C7D9]/15 text-[#0b7280] dark:text-[#21C7D9]"
                : "border-ct-border bg-ct-surface text-ct-secondary hover:text-ct-text"
            )}
          >
            Emergency Contacts &amp; Helplines
          </button>
        </div>

        {tab === "facilities" && (
          <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
            <MapIcon className="h-4 w-4" />
            {showMap ? "Hide Map" : "View on Map"}
          </Button>
        )}
      </div>

      {tab === "facilities" ? (
        <>
          {demo && (
            <Notice>
              Preview mode does not include live administrator facility records. View the Emergency Contacts tab for bundled official helplines and hospital numbers, or sign in to view managed facilities.
            </Notice>
          )}

          {/* Category Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["all", "All"],
              ["hospital", "Hospitals"],
              ["ambulance", "Ambulance"],
              ["rescue_center", "Rescue Services"],
              ["fire_service", "Fire Services"],
              ["shelter", "Shelters"],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                className={cn(
                  "min-h-[40px] rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition",
                  type === k
                    ? "border-[#21C7D9] bg-[#21C7D9]/15 text-[#0b7280] dark:text-[#21C7D9]"
                    : "border-ct-border bg-ct-surface text-ct-secondary hover:border-[#21C7D9]/50"
                )}
              >
                {label}
              </button>
            ))}

            <label className="ml-auto flex min-h-[40px] items-center gap-2 text-xs font-medium text-ct-secondary">
              <input
                type="checkbox"
                checked={onlyVerified}
                onChange={(e) => setOnlyVerified(e.target.checked)}
                className="accent-[#21C7D9]"
              />
              Verified only
            </label>
          </div>

          <div className={cn("grid gap-5", showMap ? "xl:grid-cols-[440px_1fr]" : "")}>
            <Card className="flex flex-col">
              <div className="grid gap-2 border-b border-ct-border p-3.5 sm:grid-cols-[1fr_180px]">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-ct-muted" />
                  <Input
                    className="pl-9"
                    placeholder="Search hospital, shelter, or address"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Search facilities"
                  />
                </div>
                <Select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  aria-label="Filter by district"
                >
                  <option value="">All districts</option>
                  {(m.data?.districts ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              {m.loading || sorted.loading ? (
                <div className="space-y-3 p-4">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : filteredFacilities.length === 0 ? (
                <EmptyState
                  icon={<Siren className="h-5 w-5" />}
                  title={allFacilities.length ? "No facilities match your filter" : "No facility records added yet"}
                  text={
                    allFacilities.length
                      ? "Try clearing the search box or choosing All categories."
                      : "Verified hospitals, rescue centres, and shelters added by administrators appear here. Check Emergency Contacts for official directory numbers."
                  }
                  action={
                    <Button variant="outline" size="sm" onClick={() => setTab("contacts")}>
                      Open Emergency Contacts
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-ct-border">
                  {filteredFacilities.map((r) => (
                    <li key={r.id} className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-ct-text">{r.name}</p>
                          <p className="mt-0.5 text-xs text-ct-muted">
                            {TYPE_META[r.type]?.label ?? r.type}
                            {r.district_id ? ` · ${dn.get(r.district_id)}` : ""}
                            {r.capacity !== undefined && r.capacity !== null
                              ? ` · Capacity: ${r.capacity}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.distance_km !== undefined && (
                            <Badge tone="cyan" className="tabular-nums">
                              {r.distance_km.toFixed(1)} km
                            </Badge>
                          )}
                          <VerifiedBadge ok={r.verified} />
                        </div>
                      </div>

                      {r.availability_status && (
                        <div className="flex items-center gap-2 text-xs">
                          <Badge tone={AVAIL_TONE[r.availability_status] ?? "neutral"} className="capitalize">
                            Status: {r.availability_status}
                          </Badge>
                        </div>
                      )}

                      {r.address && (
                        <p className="flex items-start gap-2 text-xs text-ct-secondary">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ct-muted" />
                          {r.address}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {r.phone && (
                          <a
                            href={telHref(r.phone)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Call {r.phone}
                          </a>
                        )}
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`https://www.openstreetmap.org/directions?to=${r.latitude}%2C${r.longitude}`}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-ct-border px-3 py-1.5 text-xs font-semibold text-ct-text hover:border-[#21C7D9]"
                        >
                          <Navigation className="h-3.5 w-3.5 text-[#0b8a99] dark:text-[#21C7D9]" />
                          Get Directions
                        </a>
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=15/${r.latitude}/${r.longitude}`}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-ct-border px-3 py-1.5 text-xs font-semibold text-ct-secondary hover:border-[#21C7D9] hover:text-ct-text"
                        >
                          View on Map <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <p className="text-[11px] text-ct-muted">Source: {r.source}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {showMap && (
              <div>
                {m.data ? (
                  <MapView
                    boundaries={m.data.boundaries}
                    riskByName={{}}
                    resources={filteredFacilities}
                    focus={myPos ? { lat: myPos.lat, lon: myPos.lon, label: "Your location" } : null}
                    height="560px"
                  />
                ) : (
                  <Skeleton className="h-[560px]" />
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-2xl border border-[#DC454D]/40 bg-[#DC454D]/10 p-4 text-sm text-ct-text">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC454D]" />
            <p>
              <strong>In an emergency call the numbers directly.</strong>{" "}
              {contactsQuery.data?.disclaimer ??
                "Numbers below are copied from published official and public sources."}
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-ct-text">National &amp; Provincial Helplines</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {!contactsQuery.data
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)
                : contactsQuery.data.helplines.map((h) => (
                    <Card key={h.id} className="flex flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-ct-text">{h.name}</p>
                        <Badge tone={CONF_META[h.confidence].tone}>
                          {CONF_META[h.confidence].label}
                        </Badge>
                      </div>
                      <a
                        href={telHref(h.number)}
                        className="mt-3 inline-flex items-center gap-2 font-mono text-2xl font-extrabold tracking-wide text-[#0b8a99] hover:underline dark:text-[#21C7D9] tabular-nums"
                      >
                        <Phone className="h-5 w-5" />
                        {h.number}
                      </a>
                      <p className="mt-1 text-xs text-ct-muted">{h.scope}</p>
                      <p className="mt-3 flex-1 text-xs leading-relaxed text-ct-secondary">{h.note}</p>
                      <a
                        href={h.source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
                      >
                        Source: {h.source.title}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </Card>
                  ))}
            </div>
          </div>

          <Card>
            <CardHeader
              title="Government Hospitals Directory"
              subtitle={
                contactsQuery.data
                  ? `${contactsQuery.data.hospitals.length} listed facilities · ${contactsQuery.data.hospitals_source.title}`
                  : ""
              }
              action={
                contactsQuery.data && (
                  <a
                    href={contactsQuery.data.hospitals_source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]"
                  >
                    Source PDF <ExternalLink className="h-3 w-3" />
                  </a>
                )
              }
            />
            <div className="grid gap-2 border-b border-ct-border p-3.5 sm:grid-cols-[1fr_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-ct-muted" />
                <Input
                  className="pl-9"
                  placeholder="Search hospital name"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search hospitals"
                />
              </div>
              <Select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                aria-label="Filter hospitals by district"
              >
                <option value="">All districts</option>
                {contactDistricts.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </div>
            {!contactsQuery.data ? (
              <Skeleton className="m-5 h-40" />
            ) : filteredHospitals.length === 0 ? (
              <EmptyState title="No hospitals match your search" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-ct-border text-left text-xs uppercase tracking-wider text-ct-muted">
                    <tr>
                      <th className="px-5 py-3">Hospital</th>
                      <th className="px-3 py-3">District</th>
                      <th className="px-5 py-3">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ct-border">
                    {filteredHospitals.map((h, i) => (
                      <tr key={h.name + i} className="hover:bg-ct-soft/60">
                        <td className="px-5 py-3 font-medium text-ct-text">{h.name}</td>
                        <td className="px-3 py-3 text-ct-secondary">{h.district}</td>
                        <td className="px-5 py-3">
                          {h.phone ? (
                            <a
                              href={telHref(h.phone)}
                              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9] tabular-nums"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              {h.phone}
                            </a>
                          ) : (
                            <span className="text-xs text-ct-muted">Not listed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <Suspense>
      <GetHelpContent />
    </Suspense>
  );
}
