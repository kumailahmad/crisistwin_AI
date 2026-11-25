"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { shrinkImage } from "@/lib/image";
import { incidents } from "@/lib/services";
import type { Incident, IncidentMediaMeta } from "@/lib/types";
import { Skeleton } from "@/components/ui";

export const MAX_PHOTOS = 4;
/** Camera / gallery picker with instant previews; photos are shrunk in the browser before upload. */
export function PhotoPicker({ files, onChange, onError }: { files: File[]; onChange: (f: File[]) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null); const [urls, setUrls] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setUrls(u); return () => u.forEach(URL.revokeObjectURL); }, [files]);
  async function add(list: FileList | null) {
    if (!list?.length) return; setBusy(true);
    try {
      const room = MAX_PHOTOS - files.length; if (list.length > room) onError(`You can attach up to ${MAX_PHOTOS} photos.`);
      const out: File[] = []; for (const f of Array.from(list).slice(0, room)) out.push(await shrinkImage(f));
      onChange([...files, ...out]);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {urls.map((u, i) => (
          <div key={u} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`Evidence photo ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white hover:bg-red-600"><X className="h-4 w-4" /></button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line text-xs text-slate-400 transition hover:border-cyan-400/60 hover:text-cyan-300 disabled:opacity-50">
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" /> : <><Camera className="h-6 w-6" /><span>Take / add photo</span><span className="text-[10px] text-slate-500"><ImagePlus className="mr-0.5 inline h-3 w-3" />{files.length}/{MAX_PHOTOS}</span></>}
          </button>
        )}
      </div>
      <input ref={input} data-testid="photo-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="hidden" onChange={(e) => add(e.target.files)} />
    </div>
  );
}

/** Authenticated photo thumbnail (blob fetch) – or the local copy when in demo mode. */
export function EvidencePhoto({ incident, media, onOpen }: { incident: Incident; media: IncidentMediaMeta; onOpen?: (src: string) => void }) {
  const [src, setSrc] = useState<string | null>(media.local ?? null); const [err, setErr] = useState(false);
  useEffect(() => {
    if (media.local) return; let url: string | null = null; let live = true;
    incidents.photo(incident.id, media.id).then((u) => { url = u; if (live) setSrc(u); else URL.revokeObjectURL(u); }).catch(() => live && setErr(true));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [incident.id, media.id, media.local]);
  if (err) return <div className="grid aspect-square place-items-center rounded-lg border border-line text-[11px] text-slate-500">Photo unavailable</div>;
  if (!src) return <Skeleton className="aspect-square" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <button type="button" onClick={() => onOpen?.(src)} className="block aspect-square overflow-hidden rounded-lg border border-line"><img src={src} alt="Evidence photo" className="h-full w-full object-cover transition hover:scale-105" /></button>;
}
