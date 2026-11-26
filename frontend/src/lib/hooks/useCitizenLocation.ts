"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { kmBetween } from "@/lib/server/geo";
import type { District } from "@/lib/types";

export type GeoPermState = "granted" | "prompt" | "denied" | "unsupported";

export interface CitizenLocationState {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  permission: GeoPermState;
  locating: boolean;
  error: string | null;
  selectedDistrictId: number | null;
  setSelectedDistrictId: (id: number | null) => void;
  requestGps: () => Promise<{ lat: number; lon: number; accuracy: number } | null>;
}

const GEO_CACHE_KEY = "ct_citizen_geo";
const DIST_CACHE_KEY = "ct_citizen_district";

export function useCitizenLocation(districtsList: District[] = []): CitizenLocationState {
  const { user } = useAuth();
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permission, setPermission] = useState<GeoPermState>("prompt");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localDistrictId, setLocalDistrictId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setPermission("unsupported");
    } else if ("permissions" in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          setPermission(status.state as GeoPermState);
          status.onchange = () => setPermission(status.state as GeoPermState);
        })
        .catch(() => {});
    }

    try {
      const cachedGeo = sessionStorage.getItem(GEO_CACHE_KEY);
      if (cachedGeo) {
        const g = JSON.parse(cachedGeo) as { lat?: number; lon?: number; accuracy?: number };
        if (typeof g.lat === "number" && typeof g.lon === "number") {
          setLat(g.lat);
          setLon(g.lon);
          setAccuracy(typeof g.accuracy === "number" ? g.accuracy : null);
        }
      }
      const cachedDist = localStorage.getItem(DIST_CACHE_KEY);
      if (cachedDist) {
        const n = Number(cachedDist);
        if (Number.isFinite(n) && n > 0) setLocalDistrictId(n);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setSelectedDistrictId = useCallback((id: number | null) => {
    setLocalDistrictId(id);
    try {
      if (id) localStorage.setItem(DIST_CACHE_KEY, String(id));
      else localStorage.removeItem(DIST_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const requestGps = useCallback(() => {
    return new Promise<{ lat: number; lon: number; accuracy: number } | null>((resolve) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setPermission("unsupported");
        setError("Location services are unavailable in this browser.");
        resolve(null);
        return;
      }
      setLocating(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setLat(fix.lat);
          setLon(fix.lon);
          setAccuracy(fix.accuracy);
          setPermission("granted");
          setLocating(false);
          try {
            sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(fix));
          } catch {
            /* ignore */
          }
          resolve(fix);
        },
        (err) => {
          setLocating(false);
          if (err.code === 1) {
            setPermission("denied");
            setError("Location permission denied. Select your district manually.");
          } else {
            setError(err.message || "Could not determine your GPS position.");
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  const selectedDistrictId = localDistrictId ?? user?.district_id ?? null;

  useEffect(() => {
    if (user?.district_id && !localDistrictId) {
      setLocalDistrictId(user.district_id);
    }
  }, [user?.district_id, localDistrictId]);

  // Keep reference to districtsList / kmBetween purely to avoid unused import lint if expanded later
  void districtsList;
  void kmBetween;

  return {
    lat,
    lon,
    accuracy,
    permission,
    locating,
    error,
    selectedDistrictId,
    setSelectedDistrictId,
    requestGps,
  };
}
