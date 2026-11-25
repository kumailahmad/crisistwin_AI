"use client";
import { Field, Input, Select } from "@/components/ui";
import type { InputStatus } from "@/lib/types";

export type FactorDef = { key: string; label: string; unit: string; min: number; max: number; step: number; hint: string };
export const FACTORS: FactorDef[] = [
  { key: "rainfall_mm_24h", label: "Rainfall (24 h)", unit: "mm", min: 0, max: 1000, step: 1, hint: "Accumulated rainfall in 24 hours." },
  { key: "elevation_m", label: "Elevation", unit: "m", min: -100, max: 9000, step: 1, hint: "Mean district elevation. Lower ground scores higher." },
  { key: "slope_deg", label: "Slope", unit: "°", min: 0, max: 90, step: 0.1, hint: "Mean slope. Flatter terrain drains slowly." },
  { key: "flood_history_index", label: "Flood history index", unit: "0–1", min: 0, max: 1, step: 0.01, hint: "0 = no recorded floods, 1 = very frequent." },
  { key: "exposure_index", label: "Exposure index", unit: "0–1", min: 0, max: 1, step: 0.01, hint: "Share of population / assets in flood-prone areas." },
];
export type FactorState = Record<string, { value: string; status: InputStatus }>;
export const emptyFactors = (): FactorState => Object.fromEntries(FACTORS.map((f) => [f.key, { value: "", status: "estimate" as InputStatus }]));

export function validateFactor(f: FactorDef, v: string): string | undefined {
  if (v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) return "Enter a number";
  if (n < f.min || n > f.max) return `Must be between ${f.min} and ${f.max}`;
}

export function FactorInputs({ defs, state, onChange }: { defs: FactorDef[]; state: FactorState; onChange: (s: FactorState) => void }) {
  return (
    <div className="space-y-4">
      {defs.map((f) => {
        const s = state[f.key]; const err = validateFactor(f, s.value);
        return (
          <div key={f.key} className="grid grid-cols-[1fr_130px] gap-3">
            <Field label={`${f.label} (${f.unit})`} hint={s.value === "" ? "Leave empty if unknown. It will be excluded, not scored as zero." : f.hint} error={err}>
              <Input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={s.value} onChange={(e) => onChange({ ...state, [f.key]: { ...s, value: e.target.value } })} placeholder="Unknown" />
            </Field>
            <Field label="Input type"><Select value={s.status} disabled={s.value === ""} onChange={(e) => onChange({ ...state, [f.key]: { ...s, status: e.target.value as InputStatus } })}><option value="measured">Measured</option><option value="estimate">Estimate</option><option value="assumption">Assumption</option></Select></Field>
          </div>
        );
      })}
    </div>
  );
}

export function toPayload(state: FactorState) {
  const values: Record<string, number | null> = {}; const status: Record<string, InputStatus> = {};
  for (const f of FACTORS) { const s = state[f.key]; values[f.key] = s?.value === "" || s === undefined ? null : Number(s.value); if (values[f.key] !== null) status[f.key] = s.status; }
  return { values, status };
}

const WEIGHT: Record<string, number> = { rainfall_mm_24h: 0.35, elevation_m: 0.15, slope_deg: 0.15, flood_history_index: 0.2, exposure_index: 0.15 };
/** Share of total factor weight provided (the backend needs >= 50% to produce a score). */
export const coverage = (state: FactorState, rainfallProvided = false) =>
  (rainfallProvided ? WEIGHT.rainfall_mm_24h : 0) + FACTORS.filter((f) => state[f.key].value !== "" && f.key in WEIGHT && (f.key !== "rainfall_mm_24h" || !rainfallProvided)).reduce((a, f) => a + WEIGHT[f.key], 0);

export function CoverageMeter({ value }: { value: number }) {
  const ok = value >= 0.5;
  return (
    <div className="rounded-xl border border-line bg-ink-900 p-3">
      <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-slate-300">Data coverage</span><b className={ok ? "text-emerald-300" : "text-amber-300"}>{Math.round(value * 100)}%</b></div>
      <div className="relative h-2 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full transition-all ${ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${value * 100}%` }} /><span className="absolute inset-y-0 left-1/2 w-px bg-white/50" /></div>
      <p className="mt-1.5 text-[11px] text-slate-400">{ok ? "Enough data to produce a score." : "A score needs at least 50% of factor weight. Add more known values below."}</p>
    </div>
  );
}
