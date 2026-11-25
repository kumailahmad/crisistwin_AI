import type { RiskFactor, RiskResult } from "../types";

export const WEIGHTS: Record<string, number> = {
  rainfall_mm_24h: 0.35,
  elevation_m: 0.15,
  slope_deg: 0.15,
  flood_history_index: 0.2,
  exposure_index: 0.15,
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));

const norm = (n: string, v: number) =>
  n === "rainfall_mm_24h"
    ? clamp(v / 200)
    : n === "elevation_m"
      ? 1 - clamp(v / 3000)
      : n === "slope_deg"
        ? 1 - clamp(v / 30)
        : clamp(v);

export const DISCLAIMER = "Prototype heuristic score. Not a verified flood prediction.";

export function assess(
  inputs: Record<string, number | null | undefined>,
  statuses: Record<string, string> = {}
): RiskResult {
  const factors: RiskFactor[] = [];
  let used = 0;
  for (const [name, w] of Object.entries(WEIGHTS)) {
    const v = inputs[name];
    if (v === null || v === undefined || Number.isNaN(v)) {
      factors.push({ name, value: null, normalised: null, weight: w, status: "missing" });
      continue;
    }
    used += w;
    factors.push({
      name,
      value: v,
      normalised: Math.round(norm(name, v) * 1000) / 1000,
      weight: w,
      status: statuses[name] ?? "unspecified",
    });
  }

  const coverage = Math.round((used / 1) * 1000) / 1000;
  const missing = factors.filter((f) => f.status === "missing").map((f) => f.name);
  if (coverage < 0.5) {
    return {
      score: null,
      category: "Insufficient data",
      coverage,
      factors,
      missing,
      explanation: "Too many inputs are missing to produce a score.",
      disclaimer: DISCLAIMER,
    };
  }

  let rawScore = (factors.reduce((s, f) => s + (f.normalised ?? 0) * f.weight, 0) / used) * 100;
  let durationNote: string | null = null;
  const durationH = inputs.duration_h;
  if (typeof durationH === "number" && Number.isFinite(durationH) && durationH > 0) {
    // Persistent rainfall (>24h) elevates saturation pressure up to +8 heuristic points (capped at 100)
    if (durationH > 24) {
      const extra = Math.min(8, ((durationH - 24) / 48) * 8);
      rawScore = Math.min(100, rawScore + extra);
      durationNote = `Includes +${extra.toFixed(1)} saturation adjustment for ${durationH} h duration.`;
    } else {
      durationNote = `Duration noted (${durationH} h within 24 h window).`;
    }
  }

  const score = Math.round(rawScore * 10) / 10;
  const category = score < 25 ? "Low" : score < 50 ? "Moderate" : score < 75 ? "High" : "Severe";
  const note = missing.length
    ? ` Score is based on ${Math.floor(coverage * 100)}% of factor weight; missing: ${missing.join(", ")}.`
    : "";
  return {
    score,
    category,
    coverage,
    factors,
    missing,
    explanation: "Weighted average of normalised factors." + note + (durationNote ? ` ${durationNote}` : ""),
    disclaimer: DISCLAIMER,
    duration_note: durationNote,
  };
}
