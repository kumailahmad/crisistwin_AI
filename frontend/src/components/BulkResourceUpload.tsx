"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileUp, XCircle } from "lucide-react";
import { Button, Modal, Notice, useToast } from "@/components/ui";
import { RESOURCE_CSV_HEADER, RESOURCE_CSV_TEMPLATE, parseCsv } from "@/lib/csv";
import { resources } from "@/lib/services";
import type { AvailabilityStatus, ResourceInput, ResourceType } from "@/lib/types";

const TYPES = ["hospital", "shelter", "rescue_center", "fire_service", "ambulance", "other"];
const AVAIL = new Set<string>(["available", "limited", "full", "offline"]);
type Parsed = { line: number; item?: ResourceInput; errors: string[]; raw: string[] };

export function BulkResourceUpload({ districts, onClose, onDone }: { districts: { id: number; name: string }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Parsed[] | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byName = useMemo(() => new Map(districts.map((d) => [d.name.toLowerCase(), d.id])), [districts]);

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([RESOURCE_CSV_TEMPLATE], { type: "text/csv" }));
    a.download = "resources-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function load(file: File) {
    setFileErr(null);
    setRows(null);
    if (file.size > 1_000_000) return setFileErr("File is larger than 1 MB.");
    const all = parseCsv(await file.text());
    if (all.length < 2) return setFileErr("The file has no data rows.");
    const head = all[0].map((h) => h.trim().toLowerCase());
    const missing = ["name", "type", "latitude", "longitude", "source"].filter((h) => !head.includes(h));
    if (missing.length) return setFileErr(`Missing required column(s): ${missing.join(", ")}. Download the template for the expected format.`);
    if (all.length - 1 > 500) return setFileErr("A maximum of 500 rows can be imported at once.");
    const col = (r: string[], k: string) => {
      const idx = head.indexOf(k);
      return idx >= 0 ? (r[idx] ?? "").trim() : "";
    };
    setRows(
      all.slice(1).map((r, i) => {
        const errors: string[] = [];
        const name = col(r, "name");
        const type = col(r, "type").toLowerCase().replace(/[ -]/g, "_");
        const dname = col(r, "district");
        const source = col(r, "source");
        const lat = Number(col(r, "latitude"));
        const lon = Number(col(r, "longitude"));
        const ver = ["true", "yes", "1"].includes(col(r, "verified").toLowerCase());
        const capStr = col(r, "capacity");
        const cap = capStr ? Number(capStr) : null;
        const availRaw = col(r, "availability_status").toLowerCase();
        const avail = availRaw && AVAIL.has(availRaw) ? (availRaw as AvailabilityStatus) : "available";

        if (name.length < 2) errors.push("name is required");
        if (!TYPES.includes(type)) errors.push(`type must be one of ${TYPES.join(", ")}`);
        if (dname && !byName.has(dname.toLowerCase())) errors.push(`unknown district “${dname}”`);
        if (!(col(r, "latitude") !== "" && lat >= 24 && lat <= 32.2)) errors.push("latitude must be 24 to 32.2");
        if (!(col(r, "longitude") !== "" && lon >= 60.8 && lon <= 70.6)) errors.push("longitude must be 60.8 to 70.6");
        if (source.length < 3) errors.push("source is required");
        if (capStr && !(Number.isFinite(cap) && cap! >= 0)) errors.push("capacity must be >= 0");
        if (availRaw && !AVAIL.has(availRaw)) errors.push("availability_status must be available, limited, full, or offline");

        const item: ResourceInput | undefined = errors.length
          ? undefined
          : {
              name,
              type: type as ResourceType,
              district_id: dname ? byName.get(dname.toLowerCase())! : null,
              latitude: lat,
              longitude: lon,
              phone: col(r, "phone") || null,
              address: col(r, "address") || null,
              source,
              verified: ver,
              capacity: cap,
              availability_status: avail,
            };
        return { line: i + 2, item, errors, raw: [name, type, dname] };
      })
    );
  }

  const bad = rows?.filter((r) => r.errors.length).length ?? 0;
  async function save() {
    setBusy(true);
    try {
      const r = await resources.bulk(rows!.map((x) => x.item!));
      toast("ok", `${r.created} resources imported`);
      onDone();
    } catch (e) {
      toast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Bulk import from CSV" wide>
      <div className="space-y-4">
        <Notice tone="cyan">
          Columns: <code>{RESOURCE_CSV_HEADER.join(", ")}</code> (optional: <code>capacity, availability_status</code>). Required: name, type, latitude, longitude, source.
        </Notice>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="h-3.5 w-3.5" />
            Download template
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20">
            <FileUp className="h-3.5 w-3.5" />
            Choose CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
        </div>
        {fileErr && (
          <p role="alert" className="text-sm text-red-300">
            {fileErr}
          </p>
        )}
        {rows && (
          <>
            <p className="text-sm text-slate-300">
              <b className="text-emerald-300">{rows.length - bad} valid</b> · <b className={bad ? "text-red-300" : "text-slate-400"}>{bad} with errors</b>
            </p>
            <div className="max-h-64 overflow-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ink-900 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {rows.map((r) => (
                    <tr key={r.line} className="text-slate-300">
                      <td className="px-3 py-1.5">{r.line}</td>
                      <td>{r.raw[0]}</td>
                      <td>{r.raw[1]}</td>
                      <td>
                        {r.errors.length ? (
                          <span className="flex gap-1 text-red-300">
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {r.errors.join("; ")}
                          </span>
                        ) : (
                          <span className="flex gap-1 text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!rows || bad > 0 || rows.length === 0} onClick={save}>
            Import {rows && bad === 0 ? rows.length : ""} resources
          </Button>
        </div>
      </div>
    </Modal>
  );
}
