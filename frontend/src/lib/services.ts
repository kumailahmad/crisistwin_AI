import { api } from "@/lib/api/client";
import { isDemo } from "@/lib/auth/token";
import { assess, DISCLAIMER as RISK_DISCLAIMER } from "@/lib/demo/riskEngine";
import { demoStore } from "@/lib/demo/store";
import type {
  AdminStats,
  AgentConfiguration,
  AgentExecutionLog,
  AiConfig,
  AiLogEntry,
  AlertItem,
  AnalyticsReport,
  AppNotification,
  AssistantLanguage,
  AuditLog,
  ChatReply,
  Dataset,
  Department,
  DepartmentAnalytics,
  DepartmentResponseRecord,
  District,
  EscalationLog,
  EscalationRule,
  Incident,
  IncidentAssignment,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  NotificationChannelType,
  NotificationIntegration,
  NotificationLog,
  Overview,
  PlatformSettings,
  Resource,
  ResourceInput,
  RiskAssessment,
  RiskInputs,
  Role,
  RoutingRule,
  Simulation,
  SimulationInput,
  SimulationResults,
  TrackedIncident,
  User,
  WorkflowStatus,
} from "@/lib/types";

export type BoundaryProps = { district_id: number | null; name: string; source: string; verified: boolean };
export type BoundaryCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, BoundaryProps>;
export type BoundaryOrigin = "api" | "open-data";

type OpenFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string; area_km2_approx: number; centroid: [number, number]; source: string }>;
export type OpenCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, OpenFeature["properties"]>;
let openCache: Promise<OpenCollection> | null = null;
export const loadOpenBoundaries = (): Promise<OpenCollection> =>
  (openCache ??= fetch("/data/districts.geojson").then((r) => r.json() as Promise<OpenCollection>));
export const loadProvinceOutline = () => fetch("/data/balochistan.geojson").then((r) => r.json() as Promise<GeoJSON.Feature>);

async function demoDistricts(): Promise<District[]> {
  const fc = await loadOpenBoundaries();
  return fc.features.map((f, i) => ({
    id: i + 1,
    name: f.properties.name,
    province: "Balochistan",
    area_km2: f.properties.area_km2_approx,
    population: null,
    data_source: f.properties.source,
    verified: false,
    has_boundary: true,
  }));
}

export const auth = {
  login: (email: string, password: string) =>
    api<{ access_token: string; user?: User }>("/auth/login", { method: "POST", json: { email, password } }),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  register: (email: string, password: string, full_name?: string, district_id?: number | null) =>
    api<User & { access_token?: string; verification_notice?: string; smtp_configured?: boolean }>("/auth/register", {
      method: "POST",
      json: { email, password, full_name, district_id },
    }),
  me: () => api<User>("/auth/me"),
  session: () => api<{ authenticated: boolean; user: User | null }>("/auth/session"),
  bootstrapStatus: () =>
    api<{ initialized: boolean; env_admin_configured: boolean; allow_public_registration: boolean; smtp_configured: boolean }>(
      "/auth/bootstrap-status"
    ),
  bootstrapAdmin: (b: { email: string; password: string; full_name?: string }) =>
    api<{ access_token: string; user: User }>("/auth/bootstrap-admin", { method: "POST", json: b }),
  verifyEmail: (code: string) => api<User>("/auth/verify-email", { method: "POST", json: { code } }),
  requestPasswordReset: (email: string) =>
    api<{ smtp_configured: boolean; message: string }>("/auth/request-password-reset", { method: "POST", json: { email } }),
  resetPassword: (b: { email: string; code: string; new_password: string }) =>
    api<{ ok: boolean }>("/auth/reset-password", { method: "POST", json: b }),
};

export const users = {
  me: () => api<User>("/users/me"),
  updateMe: (b: {
    full_name?: string | null;
    phone?: string | null;
    district_id?: number | null;
    notification_prefs?: Partial<NonNullable<User["notification_prefs"]>>;
    privacy_prefs?: Partial<NonNullable<User["privacy_prefs"]>>;
  }) => api<User>("/users/me", { method: "PATCH", json: b }),
  changePassword: (b: { current_password: string; new_password: string }) =>
    api<{ ok: boolean }>("/users/me/password", { method: "POST", json: b }),
  deleteMe: () => api<void>("/users/me", { method: "DELETE" }),
};

export const alerts = {
  list: async (p: { district_id?: number; all?: boolean; include_expired?: boolean } = {}): Promise<AlertItem[]> => {
    const qs = new URLSearchParams();
    if (p.district_id) qs.set("district_id", String(p.district_id));
    if (p.all) qs.set("all", "1");
    if (p.include_expired) qs.set("include_expired", "1");
    const q = qs.toString();
    return api<AlertItem[]>(`/alerts${q ? `?${q}` : ""}`);
  },
  create: (b: {
    title: string;
    message: string;
    severity: AlertItem["severity"];
    hazard_type: string;
    district_ids: number[];
    safety_instructions: string;
    status: AlertItem["status"];
    source: string;
    expires_at?: string | null;
  }) => api<AlertItem>("/alerts", { method: "POST", json: b }),
  update: (id: number, b: Partial<AlertItem>) => api<AlertItem>(`/alerts/${id}`, { method: "PATCH", json: b }),
  remove: (id: number) => api<void>(`/alerts/${id}`, { method: "DELETE" }),
};

export const notifications = {
  list: async (): Promise<{ items: AppNotification[]; unread_count: number }> => {
    if (isDemo()) return { items: [], unread_count: 0 };
    return api<{ items: AppNotification[]; unread_count: number }>("/notifications");
  },
  markRead: (id: number) => api<AppNotification>(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => api<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),
};

export const districts = {
  list: async (): Promise<District[]> => api<District[]>("/districts"),
  boundaries: async (list: District[]): Promise<{ fc: BoundaryCollection; origin: BoundaryOrigin }> => {
    try {
      const fc = await api<GeoJSON.FeatureCollection>("/districts/boundaries/all");
      if (fc.features.length) return { fc: fc as unknown as BoundaryCollection, origin: "api" };
    } catch {
      /* fall through to open data */
    }
    const open = await loadOpenBoundaries();
    const byName = new Map(list.map((d) => [d.name.toLowerCase(), d]));
    return {
      origin: "open-data",
      fc: {
        type: "FeatureCollection",
        features: open.features.map((f) => {
          const d = byName.get(f.properties.name.toLowerCase());
          return {
            type: "Feature",
            geometry: f.geometry,
            properties: { district_id: d?.id ?? null, name: f.properties.name, source: f.properties.source, verified: d?.verified ?? false },
          };
        }),
      },
    };
  },
  create: (b: { name: string; area_km2?: number | null; population?: number | null; data_source?: string | null; verified?: boolean }) =>
    api<District>("/districts", { method: "POST", json: b }),
  update: (id: number, b: Partial<Pick<District, "area_km2" | "population" | "data_source" | "verified">>) =>
    api<District>(`/districts/${id}`, { method: "PATCH", json: b }),
  remove: (id: number) => api<void>(`/districts/${id}`, { method: "DELETE" }),
  setBoundary: (id: number, geometry: unknown, source: string) =>
    api<void>(`/districts/${id}/boundary`, { method: "PUT", json: { geometry, source } }),
};

export const resources = {
  list: async (p: { type?: string; q?: string; district_id?: number; lat?: number; lon?: number } = {}): Promise<Resource[]> => {
    const qs = new URLSearchParams(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)])
    );
    return api<Resource[]>(`/resources?${qs}`);
  },
  create: (b: ResourceInput) => api<Resource>("/resources", { method: "POST", json: b }),
  update: (id: number, b: ResourceInput) => api<Resource>(`/resources/${id}`, { method: "PUT", json: b }),
  remove: (id: number) => api<void>(`/resources/${id}`, { method: "DELETE" }),
  bulk: (items: ResourceInput[]) => api<{ created: number }>("/resources/bulk", { method: "POST", json: { items } }),
};

export const risk = {
  assess: async (b: RiskInputs): Promise<RiskAssessment> => {
    if (!isDemo()) return api<RiskAssessment>("/risk/assess", { method: "POST", json: b });
    const { district_id, input_status, ...inputs } = b;
    const result = assess(inputs, input_status);
    return demoStore.add<RiskAssessment>("assessments", {
      district_id,
      inputs: inputs as Record<string, number | null>,
      result,
      score: result.score,
      category: result.category,
      created_at: new Date().toISOString(),
    });
  },
  list: async (): Promise<RiskAssessment[]> => (isDemo() ? demoStore.list<RiskAssessment>("assessments") : api<RiskAssessment[]>("/risk/assessments")),
};

const SIM_ASSUMPTIONS = [
  "Rainfall is treated as uniform over the whole district for the stated duration.",
  "The rainfall factor uses the heaviest 24-hour accumulation of the scenario, compared against a fixed 200 mm reference.",
  "Terrain, history and exposure factors use only the values supplied; absent values are excluded, not zeroed.",
];
const SIM_LIMITS = [
  "This is an indicator-based scenario, not a hydrological or hydraulic flood inundation model.",
  "It does not model drainage networks, soil saturation, upstream inflow, dams or river channels.",
  "Results must not be used for evacuation or operational decisions.",
];

export const simulations = {
  create: async (b: SimulationInput): Promise<Simulation> => {
    if (!isDemo()) return api<Simulation>("/simulations", { method: "POST", json: b });
    const { input_status, district_id, ...p } = b;
    const open = await loadOpenBoundaries();
    const name = (await demoDistricts()).find((d) => d.id === district_id)?.name;
    const geom = open.features.find((f) => f.properties.name === name)?.geometry ?? null;
    const peak = Math.min(p.rainfall_intensity_mm_h * Math.min(p.duration_h, 24), 1000);
    const indicators = assess(
      {
        rainfall_mm_24h: peak,
        duration_h: p.duration_h,
        elevation_m: p.elevation_m,
        slope_deg: p.slope_deg,
        flood_history_index: p.flood_history_index,
        exposure_index: p.exposure_index,
      },
      { rainfall_mm_24h: "assumption", ...input_status }
    );
    const results: SimulationResults = {
      total_rainfall_mm: Math.round(p.rainfall_intensity_mm_h * p.duration_h * 10) / 10,
      risk_indicators: indicators,
      visualization: geom ? { type: "Feature", geometry: geom, properties: { category: indicators.category, score: indicators.score } } : null,
      visualization_note: geom ? null : "No boundary available.",
      assumptions: SIM_ASSUMPTIONS,
      limitations: SIM_LIMITS,
      processing_status: "completed",
    };
    return demoStore.add<Simulation>("simulations", {
      district_id,
      params: b as unknown as Record<string, unknown>,
      status: "completed",
      results,
      created_at: new Date().toISOString(),
    });
  },
  list: async (): Promise<Simulation[]> => (isDemo() ? demoStore.list<Simulation>("simulations") : api<Simulation[]>("/simulations")),
  results: async (id: number): Promise<Simulation> => {
    if (isDemo()) return demoStore.list<Simulation>("simulations").find((s) => s.id === id)!;
    const r = await api<{ simulation_id: number; parameters: Record<string, unknown>; status: string; results: SimulationResults | null }>(
      `/simulations/${id}/results`
    );
    return { id: r.simulation_id, district_id: Number(r.parameters.district_id), params: r.parameters, status: r.status, results: r.results, created_at: "" };
  },
  pdf: (id: number) => api<Blob>(`/reports/simulations/${id}/pdf`),
  csv: () => api<Blob>("/reports/simulations/csv"),
};

export const assistant = {
  chat: (b: {
    message: string;
    language: AssistantLanguage;
    district_id?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    simulation_id?: number | null;
    assessment_id?: number | null;
  }) => api<ChatReply>("/assistant/chat", { method: "POST", json: b }),
};

export const reports = {
  overview: () => api<Overview>("/reports/overview"),
  risk: () => api<{ total: number; by_category: Record<string, number>; disclaimer: string }>("/reports/risk"),
  analytics: () => api<AnalyticsReport>("/reports/analytics"),
  incidentsCsv: () => api<Blob>("/reports/incidents/csv"),
};

export const datasets = {
  list: () => api<Dataset[]>("/datasets"),
  create: (b: Omit<Dataset, "id" | "created_at" | "updated_at">) => api<Dataset>("/datasets", { method: "POST", json: b }),
  update: (id: number, b: Omit<Dataset, "id" | "created_at" | "updated_at">) => api<Dataset>(`/datasets/${id}`, { method: "PUT", json: b }),
  remove: (id: number) => api<void>(`/datasets/${id}`, { method: "DELETE" }),
};

export const admin = {
  users: () => api<User[]>("/admin/users"),
  createUser: (b: { email: string; password: string; full_name?: string; role: Role; department_id?: number | null }) =>
    api<User>("/admin/users", { method: "POST", json: b }),
  updateUser: (id: number, b: { role?: Role; department_id?: number | null; is_active?: boolean }) =>
    api<User>(`/admin/users/${id}`, { method: "PATCH", json: b }),
  issueResetCode: (id: number) => api<{ code: string; expires_in_minutes: number; email: string }>(`/admin/users/${id}/reset-code`, { method: "POST" }),
  audit: (limit = 200) => api<AuditLog[]>(`/admin/audit-logs?limit=${limit}`),
  stats: () => api<AdminStats>("/admin/stats"),
  aiLogs: (limit = 150) =>
    api<{ logs: AiLogEntry[]; summary: { total: number; ok: number; errors: number; avg_latency_ms: number } }>(
      `/admin/ai/logs?limit=${limit}`
    ),
  aiConfig: () => api<AiConfig>("/admin/ai/config"),
  updateAiConfig: (b: Partial<Pick<AiConfig, "enabled" | "provider_preference" | "model" | "rate_limit_per_minute">>) =>
    api<AiConfig>("/admin/ai/config", { method: "PATCH", json: b }),
  settings: () => api<PlatformSettings>("/admin/settings"),
  updateSettings: (
    b: Partial<
      Pick<
        PlatformSettings,
        "platform_name" | "tagline" | "support_email" | "emergency_primary_number" | "default_alert_notifications" | "allow_public_registration"
      >
    >
  ) => api<PlatformSettings>("/admin/settings", { method: "PATCH", json: b }),
};

export { RISK_DISCLAIMER };

export type IncidentForm = {
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  location_source: "gps" | "map_pin" | "search" | "manual";
  place_text?: string;
  contact_phone?: string;
  people_affected?: number | null;
  observed_at?: string;
};

export const incidents = {
  submit: async (f: IncidentForm, photos: File[]): Promise<Incident> => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") fd.append(k, String(v));
    });
    photos.forEach((p) => fd.append("photos", p, p.name));
    return api<Incident>("/incidents", { method: "POST", body: fd });
  },
  mine: async (): Promise<Incident[]> => api<Incident[]>("/incidents/mine"),
  public: async (): Promise<Incident[]> => api<Incident[]>("/incidents/public"),
  track: (b: { code: string; verification_code: string }) =>
    api<TrackedIncident>("/incidents/track", { method: "POST", json: b }),
  list: (status?: IncidentStatus | "") => api<Incident[]>(`/incidents${status ? `?status=${status}` : ""}`),
  stats: () =>
    api<{ total: number; pending: number; under_review: number; verified: number; response_assigned: number; rejected: number; resolved: number }>(
      "/incidents/stats"
    ),
  review: (
    id: number,
    b: { status?: IncidentStatus; severity?: IncidentSeverity; admin_note?: string; assigned_team?: string | null; duplicate_of_id?: number | null }
  ) => api<Incident>(`/incidents/${id}`, { method: "PATCH", json: b }),
  flag: (id: number, reason: string) => api<{ id: number; flag_count: number }>(`/incidents/${id}/flag`, { method: "POST", json: { reason } }),
  remove: (id: number) => api<void>(`/incidents/${id}`, { method: "DELETE" }),
  photo: async (iid: number, mid: number): Promise<string> => URL.createObjectURL(await api<Blob>(`/incidents/${iid}/media/${mid}`)),
};

export interface DepartmentPortalItem {
  assignment: IncidentAssignment;
  incident: {
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
    workflow_status: WorkflowStatus;
    contact_phone: string | null;
    people_affected: number | null;
    ai_image_summary: string | null;
    ai_recommended_category: IncidentType | null;
    ai_recommended_severity: IncidentSeverity | null;
    escalated: boolean;
    photo_count: number;
    created_at: string;
    history: Incident["history"];
  } | null;
  responses: DepartmentResponseRecord[];
}

export const departmentManager = {
  // A. Departments
  listDepartments: () => api<Department[]>("/department-manager/departments"),
  createDepartment: (b: Partial<Department>) => api<Department>("/department-manager/departments", { method: "POST", json: b }),
  updateDepartment: (id: number, b: Partial<Department>) =>
    api<Department>(`/department-manager/departments/${id}`, { method: "PATCH", json: b }),
  deleteDepartment: (id: number) => api<void>(`/department-manager/departments/${id}`, { method: "DELETE" }),

  // B. Routing Rules
  listRules: () => api<RoutingRule[]>("/department-manager/rules"),
  createRule: (b: Partial<RoutingRule>) => api<RoutingRule>("/department-manager/rules", { method: "POST", json: b }),
  updateRule: (id: number, b: Partial<RoutingRule>) =>
    api<RoutingRule>(`/department-manager/rules/${id}`, { method: "PATCH", json: b }),
  duplicateRule: (id: number) => api<RoutingRule>(`/department-manager/rules/${id}/duplicate`, { method: "POST" }),
  deleteRule: (id: number) => api<void>(`/department-manager/rules/${id}`, { method: "DELETE" }),
  testRules: (b: {
    category?: IncidentType;
    district_id?: number | null;
    severity?: IncidentSeverity;
    people_affected?: number | null;
    photo_count?: number;
    description?: string;
  }) =>
    api<{
      matched: boolean;
      matched_rule: RoutingRule | null;
      assigned_department: Department | null;
      backup_department: Department | null;
      effective_priority: IncidentSeverity;
      escalation_minutes: number | null;
      specificity: number;
      reasons: string[];
      evaluated: {
        rule_id: number;
        rule_name: string;
        is_fallback: boolean;
        priority_order: number;
        department_name: string;
        matched: boolean;
        specificity: number;
        reasons: string[];
      }[];
    }>("/department-manager/rules/test", { method: "POST", json: b }),

  // C. Notification Integrations
  listIntegrations: () => api<NotificationIntegration[]>("/department-manager/integrations"),
  createIntegration: (b: {
    name: string;
    channel: NotificationChannelType;
    provider_name?: string;
    enabled?: boolean;
    endpoint_url?: string | null;
    sender_identity?: string | null;
    default_recipients?: string[];
    event_triggers?: string[];
    department_ids?: number[];
    api_key?: string;
    auth_token?: string;
    account_sid?: string | null;
  }) => api<NotificationIntegration>("/department-manager/integrations", { method: "POST", json: b }),
  updateIntegration: (
    id: number,
    b: {
      name?: string;
      provider_name?: string;
      enabled?: boolean;
      endpoint_url?: string | null;
      sender_identity?: string | null;
      default_recipients?: string[];
      event_triggers?: string[];
      department_ids?: number[];
      api_key?: string;
      auth_token?: string;
      account_sid?: string | null;
    }
  ) => api<NotificationIntegration>(`/department-manager/integrations/${id}`, { method: "PATCH", json: b }),
  deleteIntegration: (id: number) => api<void>(`/department-manager/integrations/${id}`, { method: "DELETE" }),
  testIntegration: (id: number, test_recipient?: string) =>
    api<{ ok: boolean; error: string | null; response: string | null; integration: NotificationIntegration }>(
      `/department-manager/integrations/${id}/test`,
      { method: "POST", json: { test_recipient } }
    ),

  // D. AI Agent Settings & Execution Logs
  getAgentConfig: () =>
    api<{ config: AgentConfiguration; groq_configured: boolean; execution_logs: AgentExecutionLog[] }>(
      "/department-manager/agent-config"
    ),
  updateAgentConfig: (b: Partial<AgentConfiguration>) =>
    api<{ config: AgentConfiguration; groq_configured: boolean; execution_logs: AgentExecutionLog[] }>(
      "/department-manager/agent-config",
      { method: "PATCH", json: b }
    ),

  // E. Assignment Monitoring & Manual/Re-run actions
  getAssignments: (p: { district_id?: number; department_id?: number; type?: string; severity?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (p.district_id) qs.set("district_id", String(p.district_id));
    if (p.department_id) qs.set("department_id", String(p.department_id));
    if (p.type) qs.set("type", p.type);
    if (p.severity) qs.set("severity", p.severity);
    if (p.from) qs.set("from", p.from);
    if (p.to) qs.set("to", p.to);
    const q = qs.toString();
    return api<{
      analytics: DepartmentAnalytics;
      assignments: IncidentAssignment[];
      unassigned_incidents: {
        id: number;
        code: string;
        type: IncidentType;
        severity: IncidentSeverity;
        district_name: string | null;
        status: IncidentStatus;
        workflow_status: WorkflowStatus;
        ai_analysis_status: string;
        ai_recommended_category: IncidentType | null;
        ai_recommended_severity: IncidentSeverity | null;
        ai_confidence: number | null;
        ai_image_summary: string | null;
        created_at: string;
      }[];
      responses: DepartmentResponseRecord[];
    }>(`/department-manager/assignments${q ? `?${q}` : ""}`);
  },
  reprocessIncident: (incidentId: number) =>
    api<{
      incident_id: number;
      workflow_status: WorkflowStatus;
      ai_analysis_status: string;
      assigned_department_id: number | null;
      assigned_department_name: string | null;
    }>(`/department-manager/incidents/${incidentId}/process`, { method: "POST" }),
  manualAssignIncident: (
    incidentId: number,
    b: { department_id: number; priority?: IncidentSeverity; send_notification?: boolean; escalation_minutes?: number | null }
  ) => api<IncidentAssignment>(`/department-manager/incidents/${incidentId}/assign`, { method: "POST", json: b }),

  // F. Escalations
  getEscalations: () => api<{ rules: EscalationRule[]; logs: EscalationLog[] }>("/department-manager/escalations"),
  createEscalationRule: (b: Partial<EscalationRule>) =>
    api<EscalationRule>("/department-manager/escalations/rules", { method: "POST", json: b }),
  updateEscalationRule: (id: number, b: Partial<EscalationRule>) =>
    api<EscalationRule>(`/department-manager/escalations/rules/${id}`, { method: "PATCH", json: b }),
  deleteEscalationRule: (id: number) => api<void>(`/department-manager/escalations/rules/${id}`, { method: "DELETE" }),
  runEscalations: () => api<{ triggered: number; logs: EscalationLog[] }>("/department-manager/escalations/run", { method: "POST" }),

  // G. Delivery Logs
  listDeliveryLogs: (p: { channel?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (p.channel) qs.set("channel", p.channel);
    if (p.status) qs.set("status", p.status);
    const q = qs.toString();
    return api<NotificationLog[]>(`/department-manager/delivery-logs${q ? `?${q}` : ""}`);
  },
  retryDeliveryLog: (id: number) => api<NotificationLog>(`/department-manager/delivery-logs/${id}/retry`, { method: "POST" }),
};

export const departmentPortal = {
  listAssignments: (departmentId?: number) =>
    api<{ department: Department | null; departments: Department[]; items: DepartmentPortalItem[] }>(
      `/department-portal/assignments${departmentId ? `?department_id=${departmentId}` : ""}`
    ),
  respond: (
    assignmentId: number,
    b: {
      action: DepartmentResponseRecord["action"];
      status?: WorkflowStatus;
      assigned_personnel?: string | null;
      note?: string | null;
    }
  ) =>
    api<{
      assignment: IncidentAssignment;
      incident: DepartmentPortalItem["incident"];
      response: DepartmentResponseRecord;
    }>(`/department-portal/assignments/${assignmentId}/respond`, { method: "POST", json: b }),
};

