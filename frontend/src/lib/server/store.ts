import crypto from "crypto";
import fs from "fs";
import path from "path";
import { hashPassword } from "./auth";
import { getDbStatus, initAndLoadPostgresStore, saveStoreToDatabase, type SyncScope } from "./supabaseDb";
import type {
  AgentConfiguration,
  AgentExecutionLog,
  AiConfig,
  AiLogEntry,
  AlertItem,
  AppNotification,
  AuditLog,
  Dataset,
  Department,
  DepartmentResponseRecord,
  District,
  EscalationLog,
  EscalationRule,
  Incident,
  IncidentAssignment,
  IncidentSeverity,
  IncidentType,
  NotificationIntegration,
  NotificationLog,
  NotificationPrefs,
  PlatformSettings,
  PrivacyPrefs,
  Resource,
  RiskAssessment,
  Role,
  RoutingRule,
  Simulation,
  WorkflowStatus,
} from "@/lib/types";

export interface StoredUser {
  id: number;
  email: string;
  hashed_password: string;
  full_name: string | null;
  role: Role;
  department_id?: number | null;
  is_active: boolean;
  email_verified: boolean;
  email_verify_token_hash: string | null;
  reset_token_hash: string | null;
  reset_expires_at: number | null;
  phone: string | null;
  district_id: number | null;
  notification_prefs: NotificationPrefs;
  privacy_prefs: PrivacyPrefs;
  created_at: string;
}

export interface StoredBoundary {
  district_id: number;
  geometry: GeoJSON.Geometry;
  crs: string;
  source: string;
}

export interface StoredMedia {
  id: number;
  incident_id: number;
  content_type: string;
  sha256: string;
  size: number;
  width: number;
  height: number;
  data: Buffer;
}

export interface StoredIncident extends Incident {
  user_id: number | null;
  reporter_type?: "citizen" | "guest" | "admin";
  guest_secret_hash?: string | null;
  reviewed_by: number | null;
  flagged_by: number[];
  media_blobs: StoredMedia[];
  workflow_status?: WorkflowStatus;
  ai_analysis_status?: "pending" | "processing" | "completed" | "failed" | "skipped";
  ai_recommended_category?: IncidentType | null;
  ai_recommended_severity?: IncidentSeverity | null;
  ai_confidence?: number | null;
  ai_image_summary?: string | null;
  ai_reasoning?: string | null;
  ai_processed_at?: string | null;
  assigned_department_id?: number | null;
  assigned_department_name?: string | null;
  escalated?: boolean;
  processing_lock_at?: number | null;
}

export interface StoredNotificationIntegration extends NotificationIntegration {
  encrypted_api_key?: string | null;
  encrypted_auth_token?: string | null;
}

export interface StoredRiskAssessment extends RiskAssessment {
  user_id: number;
}

export interface StoredSimulation extends Simulation {
  user_id: number;
}

export interface Store {
  users: StoredUser[];
  districts: District[];
  boundaries: Map<number, StoredBoundary>;
  assessments: StoredRiskAssessment[];
  simulations: StoredSimulation[];
  resources: Resource[];
  datasets: Dataset[];
  incidents: StoredIncident[];
  alerts: AlertItem[];
  notifications: AppNotification[];
  aiLogs: AiLogEntry[];
  aiConfig: AiConfig;
  settings: PlatformSettings;
  auditLogs: AuditLog[];
  departments: Department[];
  routingRules: RoutingRule[];
  incidentAssignments: IncidentAssignment[];
  departmentResponses: DepartmentResponseRecord[];
  notificationIntegrations: StoredNotificationIntegration[];
  notificationLogs: NotificationLog[];
  agentConfig: AgentConfiguration;
  escalationRules: EscalationRule[];
  escalationLogs: EscalationLog[];
  agentExecutionLogs: AgentExecutionLog[];
  nextId: {
    user: number;
    district: number;
    assessment: number;
    simulation: number;
    resource: number;
    dataset: number;
    incident: number;
    media: number;
    alert: number;
    notification: number;
    aiLog: number;
    audit: number;
    department: number;
    contact: number;
    routingRule: number;
    assignment: number;
    departmentResponse: number;
    integration: number;
    notificationLog: number;
    escalationRule: number;
    escalationLog: number;
    agentExecutionLog: number;
  };
}

function readPublicJson<T>(relPath: string): T | null {
  const candidates = [
    path.join(process.cwd(), "public", relPath),
    path.join(process.cwd(), "frontend", "public", relPath),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8")) as T;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

type ContactsJson = {
  disclaimer: string;
  helplines: { name: string; number: string; confidence: string; note: string }[];
  hospitals: { name: string; district: string; phone: string | null }[];
};

let contactsCache: ContactsJson | null = null;
export function getContacts(): ContactsJson {
  if (!contactsCache) {
    contactsCache = readPublicJson<ContactsJson>("data/emergency_contacts.json") ?? {
      disclaimer: "Numbers were not loaded.",
      helplines: [],
      hospitals: [],
    };
  }
  return contactsCache;
}

export function defaultAgentConfig(): AgentConfiguration {
  return {
    id: 1,
    enabled: true,
    auto_assign: true,
    require_human_verification: false,
    analyze_images_with_vision: true,
    classification_model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    vision_model: process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
    confidence_threshold: 0.55,
    max_notification_retries: 2,
    notify_admin_on_unassigned: true,
    notify_admin_on_ai_failure: true,
    updated_at: new Date().toISOString(),
  };
}

export function defaultAiConfig(): AiConfig {
  const groq = Boolean(process.env.GROQ_API_KEY?.trim());
  const gemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const prefRaw = (process.env.AI_PROVIDER || "auto").toLowerCase();
  const pref: AiConfig["provider_preference"] = prefRaw === "groq" || prefRaw === "gemini" ? prefRaw : "auto";
  const active: AiConfig["provider_active"] =
    pref === "groq" ? (groq ? "groq" : null) : pref === "gemini" ? (gemini ? "gemini" : null) : groq ? "groq" : gemini ? "gemini" : null;
  const model =
    active === "gemini"
      ? process.env.GEMINI_MODEL || "gemini-2.0-flash"
      : process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  return {
    enabled: true,
    provider_active: active,
    provider_preference: pref,
    model,
    rate_limit_per_minute: Math.max(1, Number(process.env.AI_RATE_LIMIT_PER_MINUTE || "10")),
    groq_configured: groq,
    gemini_configured: gemini,
  };
}

function storeFilePath(): string {
  return process.env.STORE_PATH?.trim() || "/tmp/crisistwin-store.json";
}

type PersistedMedia = Omit<StoredMedia, "data"> & { data_b64: string };
type PersistedIncident = Omit<StoredIncident, "media_blobs"> & { media_blobs: PersistedMedia[] };
type PersistedStore = Omit<Store, "boundaries" | "incidents"> & {
  boundaries: [number, StoredBoundary][];
  incidents: PersistedIncident[];
};

export function saveStore(store: Store): void {
  try {
    const payload: PersistedStore = {
      ...store,
      boundaries: Array.from(store.boundaries.entries()),
      incidents: store.incidents.map((inc) => ({
        ...inc,
        media_blobs: inc.media_blobs.map(({ data, ...rest }) => ({
          ...rest,
          data_b64: data.toString("base64"),
        })),
      })),
    };
    const file = storeFilePath();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, file);
  } catch {
    /* keep in-memory store functional if filesystem is read-only */
  }
}

function loadPersistedStore(): Store | null {
  try {
    const file = storeFilePath();
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as PersistedStore;
    if (!raw || !Array.isArray(raw.users) || !Array.isArray(raw.districts) || !raw.nextId) return null;
    return {
      ...raw,
      boundaries: new Map<number, StoredBoundary>(raw.boundaries ?? []),
      incidents: (raw.incidents ?? []).map((inc) => ({
        ...inc,
        media_blobs: (inc.media_blobs ?? []).map(({ data_b64, ...rest }) => ({
          ...rest,
          data: Buffer.from(data_b64 || "", "base64"),
        })),
      })),
    };
  } catch {
    return null;
  }
}

function syncEnvAdmin(store: Store): void {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPw || adminPw.length < 10) return;

  const existing = store.users.find((u) => u.email === adminEmail);
  if (existing) {
    existing.hashed_password = hashPassword(adminPw);
    existing.role = "admin";
    existing.is_active = true;
    existing.email_verified = true;
    return;
  }

  store.users.push({
    id: store.nextId.user++,
    email: adminEmail,
    hashed_password: hashPassword(adminPw),
    full_name: "Administrator",
    role: "admin",
    is_active: true,
    email_verified: true,
    email_verify_token_hash: null,
    reset_token_hash: null,
    reset_expires_at: null,
    phone: null,
    district_id: null,
    notification_prefs: { district_alerts: true, incident_updates: true, public_safety: true },
    privacy_prefs: { share_approximate_only: false },
    created_at: new Date().toISOString(),
  });
}

function ensureStoreExtensions(s: Store): void {
  if (!Array.isArray(s.departments)) s.departments = [];
  if (!Array.isArray(s.routingRules)) s.routingRules = [];
  if (!Array.isArray(s.incidentAssignments)) s.incidentAssignments = [];
  if (!Array.isArray(s.departmentResponses)) s.departmentResponses = [];
  if (!Array.isArray(s.notificationIntegrations)) s.notificationIntegrations = [];
  if (!Array.isArray(s.notificationLogs)) s.notificationLogs = [];
  if (!s.agentConfig) s.agentConfig = defaultAgentConfig();
  if (!Array.isArray(s.escalationRules)) s.escalationRules = [];
  if (!Array.isArray(s.escalationLogs)) s.escalationLogs = [];
  if (!Array.isArray(s.agentExecutionLogs)) s.agentExecutionLogs = [];
  s.nextId = {
    ...s.nextId,
    department: s.nextId?.department ?? 1,
    contact: s.nextId?.contact ?? 1,
    routingRule: s.nextId?.routingRule ?? 1,
    assignment: s.nextId?.assignment ?? 1,
    departmentResponse: s.nextId?.departmentResponse ?? 1,
    integration: s.nextId?.integration ?? 1,
    notificationLog: s.nextId?.notificationLog ?? 1,
    escalationRule: s.nextId?.escalationRule ?? 1,
    escalationLog: s.nextId?.escalationLog ?? 1,
    agentExecutionLog: s.nextId?.agentExecutionLog ?? 1,
  };
}

function createInitialStore(seededFromDb?: Store | null): Store {
  const persisted = seededFromDb ?? loadPersistedStore();
  if (persisted) {
    ensureStoreExtensions(persisted);
    // Re-sync environment-derived provider/SMTP flags and env admin credentials without wiping user data
    const freshAi = defaultAiConfig();
    const dbStatus = getDbStatus();
    persisted.aiConfig = {
      ...persisted.aiConfig,
      provider_active: freshAi.provider_active,
      groq_configured: freshAi.groq_configured,
      gemini_configured: freshAi.gemini_configured,
    };
    persisted.settings.smtp_configured = Boolean(process.env.SMTP_HOST?.trim() || process.env.RESEND_API_KEY?.trim());
    persisted.settings.ai_provider_configured = Boolean(persisted.aiConfig.provider_active);
    persisted.settings.persistence_mode = dbStatus.connected ? dbStatus.mode : "file-backed-tmp";
    syncEnvAdmin(persisted);
    saveStore(persisted);
    return persisted;
  }

  const aiCfg = defaultAiConfig();
  const dbStatus = getDbStatus();
  const store: Store = {
    users: [],
    districts: [],
    boundaries: new Map(),
    assessments: [],
    simulations: [],
    resources: [],
    datasets: [],
    incidents: [],
    alerts: [],
    notifications: [],
    aiLogs: [],
    aiConfig: aiCfg,
    settings: {
      platform_name: "CrisisTwin AI",
      tagline: "Predict Risks. Simulate Disasters. Save Lives.",
      support_email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "",
      emergency_primary_number: "15",
      default_alert_notifications: true,
      allow_public_registration: true,
      smtp_configured: Boolean(process.env.SMTP_HOST?.trim() || process.env.RESEND_API_KEY?.trim()),
      ai_provider_configured: Boolean(aiCfg.provider_active),
      persistence_mode: dbStatus.connected ? dbStatus.mode : "file-backed-tmp",
      updated_at: new Date().toISOString(),
    },
    auditLogs: [],
    departments: [],
    routingRules: [],
    incidentAssignments: [],
    departmentResponses: [],
    notificationIntegrations: [],
    notificationLogs: [],
    agentConfig: defaultAgentConfig(),
    escalationRules: [],
    escalationLogs: [],
    agentExecutionLogs: [],
    nextId: {
      user: 1,
      district: 1,
      assessment: 1,
      simulation: 1,
      resource: 1,
      dataset: 1,
      incident: 1,
      media: 1,
      alert: 1,
      notification: 1,
      aiLog: 1,
      audit: 1,
      department: 1,
      contact: 1,
      routingRule: 1,
      assignment: 1,
      departmentResponse: 1,
      integration: 1,
      notificationLog: 1,
      escalationRule: 1,
      escalationLog: 1,
      agentExecutionLog: 1,
    },
  };

  // Seed 26 Balochistan districts + boundaries from bundled geoBoundaries open data
  const fc = readPublicJson<{
    features: {
      geometry: GeoJSON.Geometry;
      properties: { name: string; area_km2_approx?: number; source?: string };
    }[];
  }>("data/districts.geojson");

  if (fc?.features) {
    for (const f of fc.features) {
      const id = store.nextId.district++;
      const source = f.properties.source ?? "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified";
      store.districts.push({
        id,
        name: f.properties.name,
        province: "Balochistan",
        area_km2: f.properties.area_km2_approx ?? null,
        population: null,
        data_source: source,
        verified: false,
        has_boundary: true,
      });
      store.boundaries.set(id, {
        district_id: id,
        geometry: f.geometry,
        crs: "EPSG:4326",
        source,
      });
    }
  }

  // Register default open-data boundary dataset truthfully so Data Management reflects reality
  if (store.districts.length > 0) {
    store.datasets.push({
      id: store.nextId.dataset++,
      name: "Balochistan ADM2 District Boundaries",
      kind: "boundary",
      source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified",
      description: "26 Balochistan district polygon geometries loaded at startup as unverified open data pending administrator review.",
      verified: false,
      created_at: new Date().toISOString(),
    });
  }

  syncEnvAdmin(store);

  saveStore(store);
  return store;
}

const g = globalThis as unknown as { __ctStore?: Store; __ctStoreInitPromise?: Promise<Store> };

export function getStore(): Store {
  if (!g.__ctStore) {
    g.__ctStore = createInitialStore();
  }
  return g.__ctStore;
}

export async function getStoreAsync(): Promise<Store> {
  if (g.__ctStore) return g.__ctStore;
  if (!g.__ctStoreInitPromise) {
    g.__ctStoreInitPromise = (async () => {
      const { store: dbStore, status } = await initAndLoadPostgresStore();
      const s = createInitialStore(dbStore);
      s.settings.persistence_mode = status.connected ? status.mode : "file-backed-tmp";
      if (status.connected && !dbStore) {
        // Seed initial Balochistan districts & env admin into newly created database tables
        await saveStoreToDatabase(s);
      }
      g.__ctStore = s;
      return s;
    })();
  }
  return g.__ctStoreInitPromise;
}

export async function saveStoreAsync(store: Store, opts: { scopes?: SyncScope[] } = {}): Promise<void> {
  saveStore(store);
  const status = await saveStoreToDatabase(store, opts);
  store.settings.persistence_mode = status.connected ? status.mode : "file-backed-tmp";
}

export async function getPublicAlertsCached(): Promise<(AlertItem & { district_names?: string[] })[]> {
  const store = await getStoreAsync();
  const dMap = new Map(store.districts.map((d) => [d.id, d.name]));
  const now = Date.now();
  return store.alerts
    .filter((a) => a.status === "published" && (!a.expires_at || new Date(a.expires_at).getTime() > now))
    .slice(0, 20)
    .map((a) => ({
      ...a,
      district_names: a.district_ids.map((id) => dMap.get(id) ?? `District ${id}`),
    }));
}

export function addAudit(
  store: Store,
  user_id: number | null,
  action: string,
  entity: string,
  entity_id: number | null = null,
  detail: Record<string, unknown> | null = null
): void {
  store.auditLogs.unshift({
    id: store.nextId.audit++,
    user_id,
    action,
    entity,
    entity_id,
    detail,
    created_at: new Date().toISOString(),
  });
  if (store.auditLogs.length > 500) store.auditLogs.length = 500;
}

export function pushNotification(
  store: Store,
  n: { user_id: number; kind: AppNotification["kind"]; title: string; body: string; link?: string | null }
): AppNotification {
  const row: AppNotification = {
    id: store.nextId.notification++,
    user_id: n.user_id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link ?? null,
    read: false,
    created_at: new Date().toISOString(),
  };
  store.notifications.unshift(row);
  if (store.notifications.length > 2000) store.notifications.length = 2000;
  return row;
}

/** Notify all active administrator accounts of new citizen signups or incoming reports. */
export function notifyAdmins(
  store: Store,
  n: { kind: AppNotification["kind"]; title: string; body: string; link?: string | null }
): number {
  let count = 0;
  for (const u of store.users) {
    if (u.role === "admin" && u.is_active) {
      pushNotification(store, { user_id: u.id, ...n });
      count++;
    }
  }
  return count;
}

/** Fan out notifications ONLY for published alerts to active users whose preferences allow it. */
export function notifyPublishedAlert(store: Store, alert: AlertItem): number {
  if (alert.status !== "published") return 0;
  let delivered = 0;
  for (const u of store.users) {
    if (!u.is_active) continue;
    if (!u.notification_prefs.district_alerts) continue;
    const matchesDistrict =
      alert.district_ids.length === 0 ||
      u.district_id === null ||
      alert.district_ids.includes(u.district_id);
    if (!matchesDistrict) continue;
    pushNotification(store, {
      user_id: u.id,
      kind: "alert",
      title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      body: alert.message.slice(0, 180),
      link: "/alerts",
    });
    delivered++;
  }
  alert.delivery_count += delivered;
  return delivered;
}

export function newIncidentCode(store: Store): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  for (let i = 0; i < 10; i++) {
    const code = `CT-${yy}${mm}${dd}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    if (!store.incidents.some((inc) => inc.code === code)) return code;
  }
  return `CT-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}
