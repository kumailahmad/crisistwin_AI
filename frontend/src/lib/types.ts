export type Role = "user" | "admin";
export type InputStatus = "measured" | "estimate" | "assumption";
export type RiskCategory = "Low" | "Moderate" | "High" | "Severe" | "Insufficient data";

export interface NotificationPrefs {
  district_alerts: boolean;
  incident_updates: boolean;
  public_safety: boolean;
}

export interface PrivacyPrefs {
  share_approximate_only: boolean;
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  email_verified?: boolean;
  phone?: string | null;
  district_id?: number | null;
  notification_prefs?: NotificationPrefs;
  privacy_prefs?: PrivacyPrefs;
  created_at?: string;
}

export interface District {
  id: number;
  name: string;
  province: string;
  area_km2: number | null;
  population: number | null;
  data_source: string | null;
  verified: boolean;
  has_boundary: boolean;
}

export type ResourceType = "hospital" | "shelter" | "rescue_center" | "fire_service" | "ambulance" | "other";
export type AvailabilityStatus = "available" | "limited" | "full" | "offline";

export interface Resource {
  id: number;
  name: string;
  type: ResourceType;
  district_id: number | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  address: string | null;
  source: string;
  verified: boolean;
  capacity?: number | null;
  availability_status?: AvailabilityStatus;
  distance_km?: number;
}
export type ResourceInput = Omit<Resource, "id" | "distance_km">;

export interface RiskFactor {
  name: string;
  value: number | null;
  normalised: number | null;
  weight: number;
  status: string;
}
export interface RiskResult {
  score: number | null;
  category: RiskCategory;
  coverage: number;
  factors: RiskFactor[];
  missing: string[];
  explanation: string;
  disclaimer: string;
  duration_note?: string | null;
}
export interface RiskInputs {
  district_id: number;
  rainfall_mm_24h?: number | null;
  duration_h?: number | null;
  elevation_m?: number | null;
  slope_deg?: number | null;
  flood_history_index?: number | null;
  exposure_index?: number | null;
  input_status: Record<string, InputStatus>;
}
export interface RiskAssessment {
  id: number;
  district_id: number;
  inputs: Record<string, number | null>;
  result: RiskResult;
  score: number | null;
  category: RiskCategory;
  created_at: string;
}

export interface SimulationInput {
  district_id: number;
  rainfall_intensity_mm_h: number;
  duration_h: number;
  elevation_m?: number | null;
  slope_deg?: number | null;
  flood_history_index?: number | null;
  exposure_index?: number | null;
  input_status: Record<string, InputStatus>;
}
export interface SimulationResults {
  total_rainfall_mm: number;
  risk_indicators: RiskResult;
  visualization: GeoJSON.Feature | null;
  visualization_note: string | null;
  assumptions: string[];
  limitations: string[];
  processing_status: string;
}
export interface Simulation {
  id: number;
  district_id: number;
  params: Record<string, unknown>;
  status: string;
  created_at: string;
  results?: SimulationResults | null;
}

export interface Dataset {
  id: number;
  name: string;
  kind: string;
  source: string;
  description: string | null;
  verified: boolean;
  created_at: string;
  updated_at?: string;
}
export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AlertItem {
  id: number;
  title: string;
  message: string;
  severity: "advisory" | "watch" | "warning" | "emergency";
  hazard_type: string;
  district_ids: number[];
  district_names?: string[];
  safety_instructions: string;
  status: "draft" | "published" | "expired";
  source: string;
  created_by: number | null;
  created_at: string;
  published_at: string | null;
  expires_at: string | null;
  delivery_count: number;
}

export interface AppNotification {
  id: number;
  user_id: number;
  kind: "alert" | "incident" | "system";
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface AiLogEntry {
  id: number;
  user_id: number | null;
  language: string;
  provider: string;
  model: string;
  district_id: number | null;
  status: "ok" | "error";
  latency_ms: number;
  prompt_chars: number;
  reply_chars: number;
  error_message: string | null;
  created_at: string;
}

export interface AiConfig {
  enabled: boolean;
  provider_active: "groq" | "gemini" | null;
  provider_preference: "auto" | "groq" | "gemini";
  model: string;
  rate_limit_per_minute: number;
  groq_configured: boolean;
  gemini_configured: boolean;
}

export interface PlatformSettings {
  platform_name: string;
  tagline: string;
  support_email: string;
  emergency_primary_number: string;
  default_alert_notifications: boolean;
  allow_public_registration: boolean;
  smtp_configured: boolean;
  ai_provider_configured: boolean;
  persistence_mode: string;
  database_connected?: boolean;
  database_provider?: string;
  database_error?: string | null;
  admin_notify_configured?: boolean;
  updated_at: string;
}

export interface AdminStats {
  users: number;
  active_users: number;
  admins: number;
  districts: number;
  districts_verified: number;
  districts_with_boundary: number;
  resources: number;
  resources_verified: number;
  resources_by_type: Record<string, number>;
  datasets: number;
  datasets_verified: number;
  assessments: number;
  assessments_by_category: Record<string, number>;
  simulations: number;
  simulations_failed: number;
  incidents_total: number;
  incidents_pending: number;
  incidents_verified: number;
  alerts_active: number;
  ai_requests_total: number;
  ai_errors_total: number;
  persistence_mode?: string;
  database_connected?: boolean;
  database_provider?: string;
  database_error?: string | null;
}

export interface Overview {
  districts: number;
  risk_assessments: number;
  simulations: number;
  emergency_resources: number;
  verified_resources: number;
  verified_incidents?: number;
  active_alerts?: number;
  data_note: string;
}

export type AssistantLanguage = "en" | "ur" | "bal";

export interface ChatReply {
  reply: string;
  language: AssistantLanguage;
  context_used: Record<string, unknown>;
  disclaimer: string;
}

export const RISK_COLORS: Record<string, string> = {
  Low: "#34d399",
  Moderate: "#fbbf24",
  High: "#fb923c",
  Severe: "#ef4444",
  "Insufficient data": "#64748b",
  None: "#334766",
};

export const FACTOR_LABELS: Record<string, string> = {
  rainfall_mm_24h: "Rainfall (24 h)",
  elevation_m: "Elevation",
  slope_deg: "Slope",
  flood_history_index: "Flood history",
  exposure_index: "Exposure",
};

export type IncidentType =
  | "flood"
  | "fire"
  | "earthquake"
  | "landslide"
  | "building_collapse"
  | "road_accident"
  | "road_blocked"
  | "infrastructure_damage"
  | "flash_flood"
  | "heavy_rain"
  | "drought"
  | "medical"
  | "missing_person"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "pending" | "under_review" | "verified" | "response_assigned" | "resolved" | "rejected";

export interface IncidentMediaMeta {
  id: number;
  width: number;
  height: number;
  size: number;
  sha256: string;
  local?: string;
}

export interface IncidentHistoryEntry {
  status: IncidentStatus;
  by_role: string;
  note: string | null;
  assigned_team?: string | null;
  at: string;
}

export interface Incident {
  id: number;
  code: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  latitude: number;
  longitude: number;
  place_text: string | null;
  district_id: number | null;
  district_name: string | null;
  status: IncidentStatus;
  created_at: string;
  observed_at: string | null;
  photo_count: number;
  accuracy_m?: number | null;
  location_source?: string;
  contact_phone?: string | null;
  people_affected?: number | null;
  admin_note?: string | null;
  assigned_team?: string | null;
  duplicate_of_id?: number | null;
  flag_count?: number;
  reviewed_at?: string | null;
  user_id?: number | null;
  reporter_type?: "citizen" | "guest" | "admin";
  guest_tracking_code?: string;
  media?: IncidentMediaMeta[];
  history?: IncidentHistoryEntry[];
  similar_nearby?: number;
}

export interface TrackedIncident {
  code: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  district_name: string | null;
  assigned_team: string | null;
  admin_note: string | null;
  created_at: string;
  observed_at: string | null;
  photo_count: number;
  history: IncidentHistoryEntry[];
}

export const INCIDENT_TYPES: { value: IncidentType; label: string; emoji: string; citizenPrimary?: boolean }[] = [
  { value: "flood", label: "Flood", emoji: "🌊", citizenPrimary: true },
  { value: "fire", label: "Fire", emoji: "🔥", citizenPrimary: true },
  { value: "earthquake", label: "Earthquake", emoji: "🏚️", citizenPrimary: true },
  { value: "landslide", label: "Landslide", emoji: "⛰️", citizenPrimary: true },
  { value: "building_collapse", label: "Building Collapse", emoji: "🧱", citizenPrimary: true },
  { value: "road_accident", label: "Road Accident", emoji: "🚑", citizenPrimary: true },
  { value: "road_blocked", label: "Road Blockage", emoji: "🚧", citizenPrimary: true },
  { value: "infrastructure_damage", label: "Infrastructure Damage", emoji: "🏗️", citizenPrimary: true },
  { value: "other", label: "Other", emoji: "⚠️", citizenPrimary: true },
  { value: "flash_flood", label: "Flash flood", emoji: "💦" },
  { value: "heavy_rain", label: "Heavy rain / storm", emoji: "⛈️" },
  { value: "drought", label: "Drought / water shortage", emoji: "🏜️" },
  { value: "medical", label: "Medical emergency", emoji: "🏥" },
  { value: "missing_person", label: "Missing person", emoji: "🔎" },
];

export const SEVERITY: Record<IncidentSeverity, { label: string; color: string }> = {
  low: { label: "Low", color: "#34d399" },
  medium: { label: "Medium", color: "#fbbf24" },
  high: { label: "High", color: "#fb923c" },
  critical: { label: "Critical", color: "#ef4444" },
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  pending: "Submitted",
  under_review: "Under review",
  verified: "Verified",
  response_assigned: "Response assigned",
  resolved: "Resolved",
  rejected: "Rejected",
};

export interface AnalyticsReport {
  incidents_total: number;
  incidents_by_status: Record<string, number>;
  incidents_by_category: { name: string; value: number }[];
  incidents_by_district: { name: string; value: number }[];
  monthly_incident_trends: { month: string; submitted: number; verified: number }[];
  resources_by_type: { name: string; value: number; verified: number }[];
  risk_by_category: { name: string; value: number }[];
  alerts_summary: { total: number; published: number; expired: number; draft: number };
}
