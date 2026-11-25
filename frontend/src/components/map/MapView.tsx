"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";
import type { MapProps } from "./CrisisMap";

// Leaflet touches `window`, so the map is client-only.
const Inner = dynamic(() => import("./CrisisMap"), { ssr: false, loading: () => <Skeleton className="h-[60vh] w-full rounded-2xl" /> });
export const MapView = (p: MapProps) => <Inner {...p} />;
