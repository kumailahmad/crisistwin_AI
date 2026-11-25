"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

// Recharts is ~100 kB; load it only on pages that draw a chart.
const fallback = () => <Skeleton className="h-full w-full" />;
export const Donut = dynamic(() => import("./SimpleCharts").then((m) => m.Donut), { ssr: false, loading: fallback });
export const ColorBars = dynamic(() => import("./SimpleCharts").then((m) => m.ColorBars), { ssr: false, loading: fallback });
