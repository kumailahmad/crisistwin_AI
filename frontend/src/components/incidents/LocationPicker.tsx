"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Crosshair, LocateFixed } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { GeoSearch } from "@/components/map/GeoSearch";
import type { Pin } from "./LocationPickerInner";

const Inner = dynamic(() => import("./LocationPickerInner"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });
export type Picked = Pin & { source: "gps" | "map_pin" | "search" };
const IN_BALOCHISTAN = (lat: number, lon: number) => lat >= 24 && lat <= 32.2 && lon >= 60.8 && lon <= 70.6;

/** Live GPS (improves for up to 12 s and keeps the most accurate fix), tap/drag the pin, or search a place. */
export function LocationPicker({ value, onChange }: { value: Picked | null; onChange: (p: Picked | null) => void }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [nonce, setNonce] = useState(0);
  const watch = useRef<number | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); if (timer.current) clearTimeout(timer.current); watch.current = null; setBusy(false); };
  useEffect(() => stop, []);

  function locate() {
    if (!("geolocation" in navigator)) return setMsg("This browser has no location support. Tap the map or search for the place instead.");
    if (!window.isSecureContext) return setMsg("Live location needs a secure (https) page. Tap the map or search for the place instead.");
    setBusy(true); setMsg("Getting your location… keep this page open.");
    let best: GeolocationPosition | null = null;
    const done = () => {
      stop();
      if (!best) return setMsg("Could not get a location fix. Tap the map or search for the place.");
      const { latitude: lat, longitude: lon, accuracy } = best.coords;
      if (!IN_BALOCHISTAN(lat, lon)) return setMsg("Your device location is outside Balochistan. Tap the map where the incident is.");
      onChange({ lat, lon, accuracy, source: "gps" }); setNonce((n) => n + 1);
      setMsg(accuracy > 100 ? `Location found (±${Math.round(accuracy)} m). Drag the pin to make it more exact.` : `Location found (±${Math.round(accuracy)} m).`);
    };
    watch.current = navigator.geolocation.watchPosition(
      (p) => { if (!best || p.coords.accuracy < best.coords.accuracy) best = p; if (p.coords.accuracy <= 25) done(); },
      (e) => { stop(); setMsg(e.code === 1 ? "Location permission was denied. Allow it in the browser, or tap the map instead." : "Could not get your location. Tap the map or search for the place."); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
    timer.current = setTimeout(done, 12000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={locate} loading={busy}><LocateFixed className="h-4 w-4" />Use my live location</Button>
        {value && <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); setMsg(null); }}>Clear pin</Button>}
      </div>
      {msg && <p className="text-xs text-slate-300" role="status">{msg}</p>}
      <GeoSearch onPick={(f) => { if (!IN_BALOCHISTAN(f.lat, f.lon)) return setMsg("That place is outside Balochistan."); onChange({ lat: f.lat, lon: f.lon, source: "search" }); setNonce((n) => n + 1); setMsg(f.label); }} />
      <div className="relative h-[340px] overflow-hidden rounded-xl border border-line" data-testid="location-map">
        <Inner pin={value} flyNonce={nonce} onChange={(p) => { if (!IN_BALOCHISTAN(p.lat, p.lon)) return setMsg("Pick a point inside Balochistan."); onChange({ ...p, source: "map_pin" }); }} />
        {!value && <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1000] mx-auto w-fit rounded-full border border-line bg-ink-900/90 px-3 py-1.5 text-xs text-slate-200 backdrop-blur"><Crosshair className="mr-1 inline h-3.5 w-3.5 text-cyan-300" />Tap the map to drop a pin</div>}
      </div>
      {value && <p className="font-mono text-xs text-slate-400">{value.lat.toFixed(5)}°N, {value.lon.toFixed(5)}°E · {value.source === "gps" ? `GPS${value.accuracy ? ` ±${Math.round(value.accuracy)} m` : ""}` : value.source === "search" ? "from place search" : "pin on map"}</p>}
    </div>
  );
}

