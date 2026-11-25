"use client";
import { Select } from "@/components/ui";
import type { District } from "@/lib/types";
export function DistrictSelect({ districts, value, onChange, id }: { districts: District[]; value: number | ""; onChange: (v: number | "") => void; id?: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} aria-label="District">
      <option value="">Select a district…</option>
      {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </Select>
  );
}
