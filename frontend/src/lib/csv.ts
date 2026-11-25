/** Small RFC-4180-style CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}
export const RESOURCE_CSV_HEADER = ["name", "type", "district", "latitude", "longitude", "phone", "address", "source", "verified"];
export const RESOURCE_CSV_TEMPLATE = RESOURCE_CSV_HEADER.join(",") + "\nExample Hospital (replace),hospital,Quetta,30.1798,66.9750,,Street / area,Your documented source,false\n";
