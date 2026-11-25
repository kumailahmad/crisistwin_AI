"use client";
import { useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui";

export type Focus = { lat: number; lon: number; label: string; bbox?: [number, number, number, number] };
type Hit = { place_id: number; display_name: string; lat: string; lon: string; boundingbox?: string[]; type?: string; addresstype?: string };

/** Search any city, road or street in Balochistan using OpenStreetMap's Nominatim geocoder (public service, light use only). */
export function GeoSearch({ onPick }: { onPick: (f: Focus) => void }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[] | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const last = useRef(0);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim(); if (term.length < 3) return setErr("Type at least 3 characters.");
    if (Date.now() - last.current < 1100) return; // Nominatim usage policy: max 1 request per second
    last.current = Date.now(); setBusy(true); setErr(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=0&countrycodes=pk&bounded=1&viewbox=60.8,32.2,70.6,24.0&accept-language=en&q=${encodeURIComponent(term)}`;
      const r = await fetch(url); if (!r.ok) throw new Error("The search service is busy. Try again shortly.");
      setHits(await r.json());
    } catch (e) { setErr((e as Error).message || "Search failed. Check your connection."); setHits(null); } finally { setBusy(false); }
  }
  function pick(h: Hit) {
    const b = h.boundingbox?.map(Number); // [south, north, west, east]
    onPick({ lat: Number(h.lat), lon: Number(h.lon), label: h.display_name, bbox: b && b.length === 4 ? [b[0], b[1], b[2], b[3]] : undefined });
    setHits(null);
  }
  return (
    <div className="space-y-2">
      <form onSubmit={search} className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, road or street…  e.g. Zarghoon Road" className="pl-9 pr-10" aria-label="Find a place" />
        <button type="submit" aria-label="Search" className="absolute right-2 top-2 rounded p-1 text-cyan-300 hover:bg-ink-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</button></form>
      {err && <p role="alert" className="text-xs text-red-300">{err}</p>}
      {hits && (hits.length === 0 ? <p className="text-xs text-slate-400">No match inside Balochistan. Try another spelling.</p> : (
        <ul className="max-h-56 overflow-auto rounded-lg border border-line bg-ink-900">{hits.map((h) => (
          <li key={h.place_id}><button onClick={() => pick(h)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-ink-800"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" /><span>{h.display_name}</span></button></li>
        ))}</ul>
      ))}
      <p className="text-[10px] text-slate-500">Place search © OpenStreetMap contributors (Nominatim).</p>
    </div>
  );
}
