import crypto from "crypto";
import fs from "fs";
import path from "path";
import { hashPassword } from "./auth";
import type {
  AiConfig,
  AiLogEntry,
  AlertItem,
  AppNotification,
  AuditLog,
  Dataset,
  District,
  Incident,
  NotificationPrefs,
  PlatformSettings,
  PrivacyPrefs,
  Resource,
  RiskAssessment,
  Role,
  Simulation,
} from "@/lib/types";

export interface StoredUser {
  id: number;
  email: string;
  hashed_password: string;
  full_name: string | null;
  role: Role;
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
  user_id: number;
  reviewed_by: number | null;
  flagged_by: number[];
  media_blobs: StoredMedia[];
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

function createInitialStore(): Store {
  const aiCfg = defaultAiConfig();
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
      smtp_configured: Boolean(process.env.SMTP_HOST?.trim()),
      ai_provider_configured: Boolean(aiCfg.provider_active),
      persistence_mode: "in-memory-session",
      updated_at: new Date().toISOString(),
    },
    auditLogs: [],
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

  // Optional ADMIN_EMAIL / ADMIN_PASSWORD from environment
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPw = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPw && adminPw.length >= 10) {
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

  return store;
}

const g = globalThis as unknown as { __ctStore?: Store };

export function getStore(): Store {
  if (!g.__ctStore) {
    g.__ctStore = createInitialStore();
  }
  return g.__ctStore;
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
