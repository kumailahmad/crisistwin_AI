import type { AlertItem, AnalyticsReport, Incident, Resource, RiskAssessment, Simulation } from "../types";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Neutralize spreadsheet CSV injection and format RFC-4180 cell safely. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v).replace(/\r?\n/g, " ");
  if (FORMULA_PREFIX.test(s)) s = "'" + s;
  if (s.includes(",") || s.includes('"')) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

export function computeAnalytics(params: {
  incidents: Incident[];
  resources: Resource[];
  assessments: RiskAssessment[];
  alerts: AlertItem[];
}): AnalyticsReport {
  const { incidents, resources, assessments, alerts } = params;
  const byStatus: Record<string, number> = {};
  const byCategoryMap = new Map<string, number>();
  const byDistrictMap = new Map<string, number>();
  const monthMap = new Map<string, { submitted: number; verified: number }>();

  for (const inc of incidents) {
    byStatus[inc.status] = (byStatus[inc.status] ?? 0) + 1;
    byCategoryMap.set(inc.type, (byCategoryMap.get(inc.type) ?? 0) + 1);
    const dName = inc.district_name || "Unassigned";
    byDistrictMap.set(dName, (byDistrictMap.get(dName) ?? 0) + 1);
    const month = (inc.created_at || "").slice(0, 7) || "Unknown";
    const cur = monthMap.get(month) ?? { submitted: 0, verified: 0 };
    cur.submitted += 1;
    if (inc.status === "verified" || inc.status === "response_assigned" || inc.status === "resolved") {
      cur.verified += 1;
    }
    monthMap.set(month, cur);
  }

  const resMap = new Map<string, { value: number; verified: number }>();
  for (const r of resources) {
    const cur = resMap.get(r.type) ?? { value: 0, verified: 0 };
    cur.value += 1;
    if (r.verified) cur.verified += 1;
    resMap.set(r.type, cur);
  }

  const riskMap = new Map<string, number>();
  for (const a of assessments) {
    riskMap.set(a.category, (riskMap.get(a.category) ?? 0) + 1);
  }

  return {
    incidents_total: incidents.length,
    incidents_by_status: byStatus,
    incidents_by_category: [...byCategoryMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    incidents_by_district: [...byDistrictMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    monthly_incident_trends: [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v })),
    resources_by_type: [...resMap.entries()].map(([name, v]) => ({ name, ...v })),
    risk_by_category: [...riskMap.entries()].map(([name, value]) => ({ name, value })),
    alerts_summary: {
      total: alerts.length,
      published: alerts.filter((a) => a.status === "published").length,
      expired: alerts.filter((a) => a.status === "expired").length,
      draft: alerts.filter((a) => a.status === "draft").length,
    },
  };
}

export interface SimulationComparison {
  leftId: number;
  rightId: number;
  totalRainfallDiffMm: number | null;
  scoreDiff: number | null;
  higherRiskSide: "left" | "right" | "equal" | "incomplete";
}

export function compareSimulations(left: Simulation, right: Simulation): SimulationComparison {
  const lr = left.results?.total_rainfall_mm ?? null;
  const rr = right.results?.total_rainfall_mm ?? null;
  const ls = left.results?.risk_indicators.score ?? null;
  const rs = right.results?.risk_indicators.score ?? null;

  const totalRainfallDiffMm = lr !== null && rr !== null ? Math.round((rr - lr) * 10) / 10 : null;
  const scoreDiff = ls !== null && rs !== null ? Math.round((rs - ls) * 10) / 10 : null;
  let higherRiskSide: SimulationComparison["higherRiskSide"] = "incomplete";
  if (ls !== null && rs !== null) {
    higherRiskSide = rs > ls ? "right" : ls > rs ? "left" : "equal";
  }

  return {
    leftId: left.id,
    rightId: right.id,
    totalRainfallDiffMm,
    scoreDiff,
    higherRiskSide,
  };
}
