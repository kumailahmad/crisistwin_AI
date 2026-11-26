"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, LayerGroup, LayersControl, MapContainer, Marker, Popup, ScaleControl, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Crosshair, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { INCIDENT_TYPES, RISK_COLORS, SEVERITY, STATUS_LABEL, type Incident, type Resource } from "@/lib/types";
import type { BoundaryCollection } from "@/lib/services";

export type MapProps = {
  boundaries: BoundaryCollection | null;
  riskByName?: Record<string, string>;
  resources?: Resource[];
  incidents?: Incident[];
  selectedName?: string | null;
  onSelect?: (name: string | null) => void;
  height?: string;
  showResources?: boolean;
  className?: string;
  focus?: { lat: number; lon: number; label: string; bbox?: [number, number, number, number] } | null;
};

import { TYPE_META } from "./typeMeta";
export { TYPE_META };

const CENTER: [number, number] = [28.4, 65.6];

const icon = (type: string) => {
  const m = TYPE_META[type] ?? TYPE_META.other;
  return L.divIcon({
    className: "",
    html: `<div class="res-marker" style="background:${m.color}">${m.letter}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

const incIcon = (i: Incident) =>
  L.divIcon({
    className: "",
    html: `<div class="inc-marker" style="background:${SEVERITY[i.severity].color}">${INCIDENT_TYPES.find((t) => t.value === i.type)?.emoji ?? "⚠️"}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });

const ESRI = "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function FitAndFly({ data, selectedName }: { data: BoundaryCollection | null; selectedName?: string | null }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!data?.features.length) return;
    if (selectedName) {
      const f = data.features.find((x) => x.properties.name === selectedName);
      if (f) {
        map.flyToBounds(L.geoJSON(f).getBounds().pad(0.25), { duration: 0.8, maxZoom: 10 });
        return;
      }
    }
    if (!fitted.current || !selectedName) {
      map.fitBounds(L.geoJSON(data).getBounds().pad(0.05));
      fitted.current = true;
    }
  }, [data, selectedName, map]);
  return null;
}

function Labels({ data }: { data: BoundaryCollection | null }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const pts = useMemo(
    () => (data?.features ?? []).map((f) => ({ name: f.properties.name, at: L.geoJSON(f).getBounds().getCenter() })),
    [data]
  );
  if (zoom < 7) return null;
  return (
    <>
      {pts.map((p) => (
        <Marker
          key={p.name}
          position={p.at}
          interactive={false}
          keyboard={false}
          icon={L.divIcon({ className: "dist-label", html: p.name, iconSize: [0, 0] })}
        />
      ))}
    </>
  );
}

function FocusPoint({ focus }: { focus: NonNullable<MapProps["focus"]> }) {
  const map = useMap();
  useEffect(() => {
    if (focus.bbox) map.flyToBounds([[focus.bbox[0], focus.bbox[2]], [focus.bbox[1], focus.bbox[3]]], { maxZoom: 17, duration: 0.9 });
    else map.flyTo([focus.lat, focus.lon], 15, { duration: 0.9 });
  }, [focus, map]);
  return (
    <CircleMarker center={[focus.lat, focus.lon]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#22d3ee", fillOpacity: 1 }}>
      <Popup autoPan={false}>
        <div className="max-w-[220px] text-xs">{focus.label}</div>
      </Popup>
    </CircleMarker>
  );
}

function Resize({ dep }: { dep: unknown }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [dep, map]);
  return null;
}

function Coords() {
  const [p, setP] = useState<L.LatLng | null>(null);
  useMapEvents({ mousemove: (e) => setP(e.latlng), mouseout: () => setP(null) });
  return (
    <div className="pointer-events-none absolute bottom-[52px] left-3 z-[1000] hidden rounded-md border border-line bg-ink-900/90 px-2 py-1 font-mono text-[11px] text-slate-300 tabular-nums sm:block">
      {p ? `${p.lat.toFixed(4)}°N  ${p.lng.toFixed(4)}°E` : "Move cursor over map"}
    </div>
  );
}

function ResetView({ data }: { data: BoundaryCollection | null }) {
  const map = useMap();
  return (
    <button
      title="Reset view to Balochistan"
      aria-label="Reset view"
      onClick={() => (data?.features.length ? map.fitBounds(L.geoJSON(data).getBounds().pad(0.05)) : map.setView(CENTER, 6))}
      className="absolute left-3 top-[88px] z-[1000] grid h-[30px] w-[30px] place-items-center rounded border border-line bg-ink-850 text-slate-200 hover:bg-ink-700"
    >
      <Crosshair className="h-4 w-4" />
    </button>
  );
}

function Legend({ hasRisk, hasRes }: { hasRisk: boolean; hasRes: boolean }) {
  return (
    <div className="absolute bottom-7 right-3 z-[1000] max-w-[210px] rounded-xl border border-line bg-ink-900/90 p-3 text-[11px] text-slate-300 backdrop-blur">
      <p className="mb-1.5 font-semibold uppercase tracking-wider text-slate-400">Legend</p>
      <ul className="space-y-1">
        {["Low", "Moderate", "High", "Severe"].map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-sm" style={{ background: RISK_COLORS[k], opacity: hasRisk ? 1 : 0.35 }} />
            {k} risk
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-sm border border-slate-500" style={{ background: RISK_COLORS.None }} />
          No assessment
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-sky-400" />
          Drainage corridor
        </li>
      </ul>
      {hasRes && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {Object.entries(TYPE_META).map(([k, m]) => (
            <li key={k} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: m.color }} />
              {m.label}
            </li>
          ))}
        </ul>
      )}
      {!hasRisk && <p className="mt-2 border-t border-line pt-2 text-[10px] leading-snug text-slate-500">Run a risk assessment to colour districts.</p>}
    </div>
  );
}

export default function CrisisMap({
  boundaries,
  riskByName = {},
  resources = [],
  incidents = [],
  selectedName,
  onSelect,
  height = "70vh",
  showResources = true,
  className,
  focus,
}: MapProps) {
  const [full, setFull] = useState(false);
  const [radar, setRadar] = useState<{ url: string; time: string } | null>(null);
  const [drainage, setDrainage] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/data/drainage.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDrainage(j))
      .catch(() => setDrainage(null));

    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((j) => {
        const last = j?.radar?.past?.at(-1);
        if (last) setRadar({ url: `${j.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`, time: new Date(last.time * 1000).toLocaleString() });
      })
      .catch(() => setRadar(null));
  }, []);

  const hasRisk = Object.keys(riskByName).length > 0;
  const geoKey = useMemo(
    () => `${boundaries?.features.length ?? 0}|${selectedName}|${JSON.stringify(riskByName)}`,
    [boundaries, selectedName, riskByName]
  );
  const markers = useMemo(() => Object.fromEntries(Object.keys(TYPE_META).map((k) => [k, icon(k)])), []);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-line", full ? "fixed inset-0 z-[2500] rounded-none" : "", className)} style={full ? undefined : { height }}>
      <MapContainer center={CENTER} zoom={6} minZoom={4} maxZoom={18} className="h-full w-full" scrollWheelZoom preferCanvas>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite + labels (Hybrid)">
            <LayerGroup>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution={ESRI} maxZoom={18} />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={18} />
            </LayerGroup>
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite (imagery only)">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution={ESRI} maxZoom={18} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Streets (OpenStreetMap)">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM} maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Terrain (OpenTopoMap)">
            <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution={`${OSM}, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`} maxZoom={17} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark (CARTO)">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution={`${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`} maxZoom={19} />
          </LayersControl.BaseLayer>

          {boundaries && (
            <LayersControl.Overlay checked name="District boundaries & risk">
              <GeoJSON
                key={geoKey}
                data={boundaries}
                style={(f) => {
                  const name = f?.properties?.name as string;
                  const cat = riskByName[name];
                  const sel = name === selectedName;
                  const color = cat ? RISK_COLORS[cat] : RISK_COLORS.None;
                  return { color: sel ? "#ffffff" : "#e2e8f0", weight: sel ? 3 : 1.2, fillColor: color, fillOpacity: sel ? 0.62 : cat ? 0.45 : 0.18, opacity: sel ? 1 : 0.75 };
                }}
                onEachFeature={(f, layer) => {
                  const name = f.properties.name as string;
                  layer.bindTooltip(`${name}${riskByName[name] ? ` · ${riskByName[name]}` : ""}`, { sticky: true });
                  layer.on({
                    click: () => onSelect?.(name === selectedName ? null : name),
                    mouseover: (e) => {
                      if (name !== selectedName) (e.target as L.Path).setStyle({ weight: 2.5, fillOpacity: 0.5 });
                    },
                    mouseout: (e) => {
                      if (name !== selectedName) (e.target as L.Path).setStyle({ weight: 1.2, fillOpacity: riskByName[name] ? 0.45 : 0.18 });
                    },
                  });
                }}
              />
            </LayersControl.Overlay>
          )}

          {drainage && (
            <LayersControl.Overlay checked name="Rivers & drainage basins">
              <GeoJSON
                data={drainage}
                style={() => ({ color: "#38bdf8", weight: 2.5, dashArray: "6 4", opacity: 0.85 })}
                onEachFeature={(f, layer) => {
                  const props = f.properties as { name?: string; basin?: string; regime?: string; note?: string };
                  layer.bindPopup(
                    `<div class="space-y-1"><strong class="text-sm">${props.name ?? "Drainage corridor"}</strong><div class="text-xs text-slate-300">${props.basin ?? ""} · ${props.regime ?? ""}</div><div class="text-[11px] text-slate-400">${props.note ?? ""}</div></div>`
                  );
                }}
              />
            </LayersControl.Overlay>
          )}

          {showResources && (
            <LayersControl.Overlay checked name="Emergency resources">
              <LayerGroup>
                {resources.map((r) => (
                  <Marker key={r.id} position={[r.latitude, r.longitude]} icon={markers[r.type] ?? markers.other}>
                    <Popup>
                      <div className="space-y-0.5">
                        <strong className="text-sm">{r.name}</strong>
                        <div>{TYPE_META[r.type]?.label ?? r.type}</div>
                        <div>{r.phone ?? "No phone on record"}</div>
                        {r.address && <div>{r.address}</div>}
                        {r.availability_status && <div className="text-xs capitalize text-cyan-300">Status: {r.availability_status}</div>}
                        <div className={r.verified ? "text-emerald-300" : "text-amber-300"}>{r.verified ? "Verified record" : "Unverified record"}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>
          )}

          {incidents.length > 0 && (
            <LayersControl.Overlay checked name={`Reported incidents (${incidents.length})`}>
              <LayerGroup>
                {incidents.map((i) => (
                  <Marker key={`inc${i.id}`} position={[i.latitude, i.longitude]} icon={incIcon(i)}>
                    <Popup>
                      <div className="max-w-[230px] space-y-1">
                        <strong className="text-sm">{INCIDENT_TYPES.find((t) => t.value === i.type)?.label}</strong>
                        <div className="text-slate-300">{i.description}</div>
                        <div className="text-emerald-300">
                          {STATUS_LABEL[i.status]} · {SEVERITY[i.severity].label}
                        </div>
                        <div className="text-slate-400">
                          {i.district_name ?? ""} {new Date(i.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>
          )}

          {radar && (
            <LayersControl.Overlay name={`Rain radar (observed, ${radar.time})`}>
              <TileLayer url={radar.url} opacity={0.65} attribution="Radar: RainViewer" />
            </LayersControl.Overlay>
          )}
        </LayersControl>
        <ScaleControl position="bottomleft" />
        <FitAndFly data={boundaries} selectedName={selectedName} />
        <Labels data={boundaries} />
        {focus && <FocusPoint focus={focus} />}
        <Resize dep={full} />
        <Coords />
        <ResetView data={boundaries} />
      </MapContainer>
      <Legend hasRisk={hasRisk} hasRes={showResources && resources.length > 0} />
      <button
        onClick={() => setFull((v) => !v)}
        aria-label={full ? "Exit full screen" : "Full screen"}
        title={full ? "Exit full screen" : "Full screen"}
        className="absolute left-3 top-[122px] z-[1000] grid h-[30px] w-[30px] place-items-center rounded border border-line bg-ink-850 text-slate-200 hover:bg-ink-700"
      >
        {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
