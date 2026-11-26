"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Upload, X } from "lucide-react";
import { shrinkImage } from "@/lib/image";
import { incidents } from "@/lib/services";
import type { Incident, IncidentMediaMeta } from "@/lib/types";
import { Button, Skeleton } from "@/components/ui";

export const MAX_PHOTOS = 4;

/** Camera / upload picker with instant previews; photos are shrunk and stripped of EXIF in the browser. */
export function PhotoPicker({
  files,
  onChange,
  onError,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  onError: (m: string) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [files]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const room = MAX_PHOTOS - files.length;
      if (list.length > room) onError(`You can attach up to ${MAX_PHOTOS} photos.`);
      const out: File[] = [];
      for (const f of Array.from(list).slice(0, room)) {
        out.push(await shrinkImage(f));
      }
      onChange([...files, ...out]);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
      if (cameraInput.current) cameraInput.current.value = "";
      if (galleryInput.current) galleryInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant="outline"
          disabled={busy || files.length >= MAX_PHOTOS}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera className="h-4 w-4 text-[#0b8a99] dark:text-[#21C7D9]" />
          Use Phone Camera
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || files.length >= MAX_PHOTOS}
          onClick={() => galleryInput.current?.click()}
        >
          <Upload className="h-4 w-4 text-[#0b8a99] dark:text-[#21C7D9]" />
          Upload Photograph
        </Button>
      </div>

      {urls.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {urls.map((u, i) => (
            <div key={u} className="group relative aspect-square overflow-hidden rounded-xl border border-ct-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Evidence photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-[#0B1424]/80 text-white hover:bg-[#DC454D]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => galleryInput.current?.click()}
          disabled={busy}
          className="flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ct-border bg-ct-soft/50 p-6 text-xs text-ct-muted transition hover:border-[#21C7D9] hover:text-ct-text"
        >
          <ImagePlus className="h-7 w-7 text-[#0b8a99] dark:text-[#21C7D9]" />
          <span className="font-semibold text-ct-text">Optional: Add up to {MAX_PHOTOS} photos</span>
          <span>Photos are resized on your device and stripped of hidden location metadata.</span>
        </button>
      )}

      <input
        ref={cameraInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      <input
        ref={galleryInput}
        data-testid="photo-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
    </div>
  );
}

/** Authenticated photo thumbnail (blob fetch) – or the local copy when in demo mode. */
export function EvidencePhoto({
  incident,
  media,
  onOpen,
}: {
  incident: Incident;
  media: IncidentMediaMeta;
  onOpen?: (src: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(media.local ?? null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (media.local) return;
    let url: string | null = null;
    let live = true;
    incidents
      .photo(incident.id, media.id)
      .then((u) => {
        url = u;
        if (live) setSrc(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => live && setErr(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [incident.id, media.id, media.local]);

  if (err) {
    return (
      <div className="grid aspect-square place-items-center rounded-lg border border-ct-border text-[11px] text-ct-muted">
        Photo unavailable
      </div>
    );
  }
  if (!src) return <Skeleton className="aspect-square" />;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(src)}
      className="block aspect-square overflow-hidden rounded-lg border border-ct-border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Evidence photo" className="h-full w-full object-cover transition hover:scale-105" />
    </button>
  );
}
