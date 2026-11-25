"use client";
import { useEffect, useMemo, useState } from "react";
import { loadOpenBoundaries, type OpenCollection } from "@/lib/services";

type Ring = number[][];
const rings = (g: GeoJSON.Geometry): Ring[] => (g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : []);

/** Static SVG of the real district boundaries (no tiles needed). Used on the landing page. */
export function BoundaryPreview({ className }: { className?: string }) {
  const [fc, setFc] = useState<OpenCollection | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { loadOpenBoundaries().then(setFc).catch(() => setFc(null)); }, []);
  const paths = useMemo(() => {
    if (!fc) return null;
    const all = fc.features.flatMap((f) => rings(f.geometry).flat());
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = 560 / (x1 - x0), w = 560, h = (y1 - y0) * k;
    const P = (p: number[]) => `${((p[0] - x0) * k).toFixed(1)},${((y1 - p[1]) * k).toFixed(1)}`;
    return { w, h, items: fc.features.map((f) => ({ name: f.properties.name, d: rings(f.geometry).map((r) => "M" + r.map(P).join("L") + "Z").join("") })) };
  }, [fc]);
  if (!paths) return <div className={className} />;
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${paths.w} ${paths.h}`} className="h-full w-full" role="img" aria-label="Map of Balochistan districts">
        {paths.items.map((p, i) => (
          <path key={p.name} d={p.d} onMouseEnter={() => setHover(p.name)} onMouseLeave={() => setHover(null)}
            fill={hover === p.name ? "#22d3ee" : `hsl(${200 + (i % 5) * 6} 70% ${18 + (i % 4) * 3}%)`} fillOpacity={hover === p.name ? 0.55 : 0.9} stroke="#38bdf8" strokeOpacity=".55" strokeWidth=".8" style={{ transition: "fill .2s" }} />
        ))}
      </svg>
      <p className="mt-2 text-center text-xs text-cyan-300">{hover ?? "Hover a district"}</p>
    </div>
  );
}
