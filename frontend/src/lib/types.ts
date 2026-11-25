export type Role = "user" | "admin";
export type InputStatus = "measured" | "estimate" | "assumption";
export type RiskCategory = "Low" | "Moderate" | "High" | "Severe" | "Insufficient data";

export interface User { id: number; email: string; full_name: string | null; role: Role; is_active: boolean }
export interface District { id: number; name: string; province: string; area_km2: number | null; population: number | null; data_source: string | null; verified: boolean; has_boundary: boolean }
export type ResourceType = "hospital" | "shelter" | "rescue_center" | "other";
export interface Resource { id: number; name: string; type: ResourceType; district_id: number | null; latitude: number; longitude: number; phone: string | null; address: string | null; source: string; verified: boolean }
export interface ResourceInput extends Omit<Resource, "id"> {}

export interface RiskFactor { name: string; value: number | null; normalised: number | null; weight: number; status: string }
export interface RiskResult { score: number | null; category: RiskCategory; coverage: number; factors: RiskFactor[]; missing: string[]; explanation: string; disclaimer: string }
export interface RiskInputs { district_id: number; rainfall_mm_24h?: number | null; elevation_m?: number | null; slope_deg?: number | null; flood_history_index?: number | null; exposure_index?: number | null; input_status: Record<string, InputStatus> }
export interface RiskAssessment { id: number; district_id: number; inputs: Record<string, number | null>; result: RiskResult; score: number | null; category: RiskCategory; created_at: string }

export interface SimulationInput { district_id: number; rainfall_intensity_mm_h: number; duration_h: number; elevation_m?: number | null; slope_deg?: number | null; flood_history_index?: number | null; exposure_index?: number | null; input_status: Record<string, InputStatus> }
export interface SimulationResults { total_rainfall_mm: number; risk_indicators: RiskResult; visualization: GeoJSON.Feature | null; visualization_note: string | null; assumptions: string[]; limitations: string[]; processing_status: string }
export interface Simulation { id: number; district_id: number; params: Record<string, unknown>; status: string; created_at: string; results?: SimulationResults | null }

export interface Dataset { id: number; name: string; kind: string; source: string; description: string | null; verified: boolean; created_at: string }
export interface AuditLog { id: number; user_id: number | null; action: string; entity: string; entity_id: number | null; detail: Record<string, unknown> | null; created_at: string }
export interface AdminStats {
  users: number; active_users: number; admins: number; districts: number; districts_verified: number; districts_with_boundary: number;
  resources: number; resources_verified: number; resources_by_type: Record<string, number>; datasets: number; datasets_verified: number;
  assessments: number; assessments_by_category: Record<string, number>; simulations: number; simulations_failed: number;
}
export interface Overview { districts: number; risk_assessments: number; simulations: number; emergency_resources: number; verified_resources: number; data_note: string }
export interface ChatReply { reply: string; language: string; context_used: Record<string, unknown>; disclaimer: string }

export const RISK_COLORS: Record<string, string> = {
  Low: "#34d399", Moderate: "#fbbf24", High: "#fb923c", Severe: "#ef4444", "Insufficient data": "#64748b", None: "#334766",
};
export const FACTOR_LABELS: Record<string, string> = {
  rainfall_mm_24h: "Rainfall (24 h)", elevation_m: "Elevation", slope_deg: "Slope", flood_history_index: "Flood history", exposure_index: "Exposure",
};

export type IncidentType = "flood" | "heavy_rain" | "earthquake" | "landslide" | "drought" | "fire" | "road_blocked" | "medical" | "missing_person" | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "pending" | "verified" | "rejected" | "resolved";
export interface IncidentMediaMeta { id: number; width: number; height: number; size: number; sha256: string; local?: string }
export interface Incident {
  id: number; code: string; type: IncidentType; severity: IncidentSeverity; description: string; latitude: number; longitude: number;
  place_text: string | null; district_id: number | null; district_name: string | null; status: IncidentStatus; created_at: string; observed_at: string | null;
  photo_count: number; accuracy_m?: number | null; location_source?: string; contact_phone?: string | null; people_affected?: number | null;
  admin_note?: string | null; reviewed_at?: string | null; user_id?: number; media?: IncidentMediaMeta[]; similar_nearby?: number;
}
export const INCIDENT_TYPES: { value: IncidentType; label: string; emoji: string }[] = [
  { value: "flood", label: "Flood / flash flood", emoji: "🌊" }, { value: "heavy_rain", label: "Heavy rain / storm", emoji: "⛈️" },
  { value: "earthquake", label: "Earthquake damage", emoji: "🏚️" }, { value: "landslide", label: "Landslide / rockfall", emoji: "⛰️" },
  { value: "drought", label: "Drought / water shortage", emoji: "🏜️" }, { value: "fire", label: "Fire", emoji: "🔥" },
  { value: "road_blocked", label: "Road blocked / bridge damaged", emoji: "🚧" }, { value: "medical", label: "Medical emergency", emoji: "🚑" },
  { value: "missing_person", label: "Missing person", emoji: "🔎" }, { value: "other", label: "Other", emoji: "⚠️" },
];
export const SEVERITY: Record<IncidentSeverity, { label: string; color: string }> = {
  low: { label: "Low", color: "#34d399" }, medium: { label: "Medium", color: "#fbbf24" }, high: { label: "High", color: "#fb923c" }, critical: { label: "Critical", color: "#ef4444" },
};
export const STATUS_LABEL: Record<IncidentStatus, string> = { pending: "Awaiting review", verified: "Verified by admin", rejected: "Rejected", resolved: "Resolved" };
