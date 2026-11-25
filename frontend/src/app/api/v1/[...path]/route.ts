import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { assess as runRiskAssess } from "@/lib/demo/riskEngine";
import { AIFailure, AIUnavailable, callAi, resolveProvider } from "@/lib/server/ai";
import {
  SESSION_COOKIE,
  aiRateOk,
  createAccessToken,
  decodeAccessToken,
  flagRateOk,
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  incidentRateOk,
  loginBlocked,
  loginFailed,
  loginOk,
  sessionCookieConfig,
  verifyMutationOrigin,
  verifyPassword,
} from "@/lib/server/auth";
import { inBalochistan, kmBetween, pointInGeometry, validatePolygon } from "@/lib/server/geo";
import { buildSimulationPdf } from "@/lib/server/pdf";
import {
  addAudit,
  getContacts,
  getStore,
  newIncidentCode,
  notifyPublishedAlert,
  pushNotification,
  type Store,
  type StoredIncident,
  type StoredUser,
} from "@/lib/server/store";
import { buildCsv, computeAnalytics } from "@/lib/utils/analytics";
import type {
  AlertItem,
  AssistantLanguage,
  AvailabilityStatus,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  ResourceInput,
  ResourceType,
  SimulationResults,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIM_ASSUMPTIONS = [
  "Rainfall is treated as uniform over the whole district for the stated duration.",
  "The rainfall factor uses the heaviest 24-hour accumulation of the scenario (intensity x min(duration, 24 h)), compared against a fixed 200 mm reference.",
  "Terrain, history and exposure factors use only the values supplied; absent values are excluded, not zeroed.",
];
const SIM_LIMITATIONS = [
  "This is an indicator-based scenario, not a hydrological or hydraulic flood inundation model.",
  "It does not model drainage networks, soil saturation, upstream inflow, dams or river channels.",
  "Results must not be used for evacuation or operational decisions.",
];
const INCIDENT_TYPES = new Set<string>([
  "flood",
  "flash_flood",
  "heavy_rain",
  "earthquake",
  "landslide",
  "drought",
  "fire",
  "road_blocked",
  "infrastructure_damage",
  "medical",
  "missing_person",
  "other",
]);
const INCIDENT_SEVERITIES = new Set<string>(["low", "medium", "high", "critical"]);
const INCIDENT_STATUSES = new Set<string>([
  "pending",
  "under_review",
  "verified",
  "response_assigned",
  "resolved",
  "rejected",
]);
const RESOURCE_TYPES = new Set<string>([
  "hospital",
  "shelter",
  "rescue_center",
  "fire_service",
  "ambulance",
  "other",
]);
const AVAILABILITY_STATUSES = new Set<string>(["available", "limited", "full", "offline"]);
const ALERT_SEVERITIES = new Set<string>(["advisory", "watch", "warning", "emergency"]);
const ALERT_STATUSES = new Set<string>(["draft", "published", "expired"]);
const PHONE_RE = /^[+0-9][0-9 \-()]{5,24}$/;

function err(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

function userOut(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    is_active: u.is_active,
    email_verified: u.email_verified,
    phone: u.phone,
    district_id: u.district_id,
    notification_prefs: u.notification_prefs,
    privacy_prefs: u.privacy_prefs,
    created_at: u.created_at,
  };
}

function getUser(req: NextRequest, store: Store): StoredUser | NextResponse {
  const auth = req.headers.get("authorization") ?? "";
  let token = "";
  let viaCookie = false;
  if (auth.startsWith("Bearer ")) {
    token = auth.slice(7).trim();
  } else {
    const cookieVal = req.cookies.get(SESSION_COOKIE)?.value;
    if (cookieVal) {
      token = cookieVal;
      viaCookie = true;
    }
  }
  if (!token) return err(401, "Not authenticated");
  const method = req.method.toUpperCase();
  if (viaCookie && !["GET", "HEAD", "OPTIONS"].includes(method) && !verifyMutationOrigin(req)) {
    return err(403, "Cross-origin state mutation rejected");
  }
  const claims = decodeAccessToken(token);
  if (!claims) return err(401, "Invalid or expired token");
  const user = store.users.find((u) => u.id === claims.sub);
  if (!user || !user.is_active) return err(401, "Inactive or unknown user");
  return user;
}

function getOptionalUser(req: NextRequest, store: Store): StoredUser | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : req.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (!token) return null;
  const claims = decodeAccessToken(token);
  if (!claims) return null;
  const user = store.users.find((u) => u.id === claims.sub);
  return user && user.is_active ? user : null;
}

function requireAdmin(req: NextRequest, store: Store): StoredUser | NextResponse {
  const u = getUser(req, store);
  if (u instanceof NextResponse) return u;
  if (u.role !== "admin") return err(403, "Administrator access required");
  return u;
}

async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T | NextResponse> {
  try {
    return (await req.json()) as T;
  } catch {
    return err(400, "Invalid JSON body");
  }
}

function roundApprox(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function incidentOut(store: Store, i: StoredIncident, opts: { publicView?: boolean; similar?: number } = {}) {
  const district = i.district_id ? store.districts.find((d) => d.id === i.district_id) : null;
  const reporter = opts.publicView ? store.users.find((u) => u.id === i.user_id) : null;
  const approxOnly = Boolean(opts.publicView && reporter?.privacy_prefs.share_approximate_only);
  const base: Record<string, unknown> = {
    id: i.id,
    code: i.code,
    type: i.type,
    severity: i.severity,
    description: opts.publicView ? i.description.slice(0, 300) : i.description,
    latitude: approxOnly ? roundApprox(i.latitude) : i.latitude,
    longitude: approxOnly ? roundApprox(i.longitude) : i.longitude,
    place_text: approxOnly ? null : i.place_text,
    district_id: i.district_id,
    district_name: district?.name ?? null,
    status: i.status,
    assigned_team: i.assigned_team ?? null,
    created_at: i.created_at,
    observed_at: i.observed_at,
    photo_count: opts.publicView ? 0 : i.media_blobs.length,
    flag_count: i.flag_count ?? 0,
  };
  if (!opts.publicView) {
    Object.assign(base, {
      accuracy_m: i.accuracy_m,
      location_source: i.location_source,
      contact_phone: i.contact_phone,
      people_affected: i.people_affected,
      admin_note: i.admin_note,
      duplicate_of_id: i.duplicate_of_id ?? null,
      reviewed_at: i.reviewed_at,
      user_id: i.user_id,
      history: i.history ?? [],
      media: i.media_blobs.map((m) => ({
        id: m.id,
        width: m.width,
        height: m.height,
        size: m.size,
        sha256: m.sha256,
      })),
    });
  }
  if (opts.similar !== undefined) base.similar_nearby = opts.similar;
  return base;
}

function validateResourceInput(raw: Partial<ResourceInput>, store: Store): string | null {
  if (!raw.name || raw.name.trim().length < 2 || raw.name.trim().length > 160) return "Name must be 2–160 characters";
  if (!raw.type || !RESOURCE_TYPES.has(raw.type)) return "Invalid resource type";
  if (
    typeof raw.latitude !== "number" ||
    typeof raw.longitude !== "number" ||
    !Number.isFinite(raw.latitude) ||
    !Number.isFinite(raw.longitude)
  ) {
    return "Latitude and longitude must be numbers";
  }
  if (!inBalochistan(raw.latitude, raw.longitude)) return "Coordinates fall outside the Balochistan study area";
  if (!raw.source || raw.source.trim().length < 3) return "Source must be at least 3 characters";
  if (raw.district_id !== undefined && raw.district_id !== null && !store.districts.some((d) => d.id === raw.district_id)) {
    return "Unknown district_id";
  }
  if (raw.capacity !== undefined && raw.capacity !== null && !(Number.isFinite(raw.capacity) && raw.capacity >= 0 && raw.capacity <= 100000)) {
    return "Capacity must be a non-negative integer";
  }
  if (raw.availability_status && !AVAILABILITY_STATUSES.has(raw.availability_status)) {
    return "Invalid availability status";
  }
  return null;
}

function isAlertActive(a: AlertItem, nowMs = Date.now()): boolean {
  if (a.status !== "published") return false;
  if (a.expires_at && new Date(a.expires_at).getTime() <= nowMs) return false;
  return true;
}

function setSessionCookie(res: NextResponse, req: NextRequest, token: string): NextResponse {
  const cfg = sessionCookieConfig(req);
  res.cookies.set(cfg.name, token, {
    httpOnly: cfg.httpOnly,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    path: cfg.path,
    maxAge: cfg.maxAge,
    ...(cfg.partitioned ? { partitioned: true } : {}),
  });
  return res;
}

function clearSessionCookie(res: NextResponse, req: NextRequest): NextResponse {
  const cfg = sessionCookieConfig(req, true);
  res.cookies.set(cfg.name, "", {
    httpOnly: cfg.httpOnly,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    path: cfg.path,
    maxAge: 0,
    ...(cfg.partitioned ? { partitioned: true } : {}),
  });
  return res;
}

async function handle(req: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path: segs } = await context.params;
  const method = req.method.toUpperCase();
  const store = getStore();
  const route = segs.join("/");

  // ---- HEALTH & OPENAPI ----
  if (method === "GET" && route === "health") {
    return NextResponse.json({
      status: "ok",
      database: store.settings.persistence_mode,
      version: "0.3.0",
      ai_provider: resolveProvider(store.aiConfig),
    });
  }

  if (method === "GET" && route === "openapi.json") {
    return NextResponse.json({
      openapi: "3.1.0",
      info: {
        title: "CrisisTwin AI API",
        version: "0.3.0",
        description: "Balochistan Disaster Management, Digital Twin & Emergency Response REST API.",
      },
      paths: {
        "/api/v1/auth/login": { post: { summary: "Authenticate & set HttpOnly cookie + bearer token" } },
        "/api/v1/auth/register": { post: { summary: "Citizen account registration" } },
        "/api/v1/auth/bootstrap-admin": { post: { summary: "One-time first administrator setup when uninitialized" } },
        "/api/v1/users/me": { get: { summary: "Current user profile" }, patch: { summary: "Update profile & notification/privacy preferences" }, delete: { summary: "Delete/deactivate account" } },
        "/api/v1/alerts": { get: { summary: "List published alerts (admin sees all)" }, post: { summary: "Create/publish alert (admin)" } },
        "/api/v1/notifications": { get: { summary: "User in-app notifications" } },
        "/api/v1/incidents": { get: { summary: "List all incidents (admin)" }, post: { summary: "Submit crisis report" } },
        "/api/v1/incidents/public": { get: { summary: "Public verified incidents (PII redacted)" } },
        "/api/v1/resources": { get: { summary: "List emergency resources with optional distance calculation" }, post: { summary: "Create emergency resource (admin)" } },
        "/api/v1/risk/assess": { post: { summary: "Calculate transparent weighted flood risk assessment" } },
        "/api/v1/simulations": { get: { summary: "List disaster simulations" }, post: { summary: "Run disaster scenario simulation" } },
        "/api/v1/assistant/chat": { post: { summary: "Grounded EN / UR / BAL AI assistant" } },
        "/api/v1/reports/analytics": { get: { summary: "Aggregated district, category, and monthly trends" } },
        "/api/v1/admin/ai/logs": { get: { summary: "AI request analytics & error logs (admin)" } },
        "/api/v1/admin/settings": { get: { summary: "Platform branding & runtime settings (admin)" }, patch: { summary: "Update platform settings (admin)" } },
      },
    });
  }

  // ---- AUTH & BOOTSTRAP ----
  if (route === "auth/bootstrap-status" && method === "GET") {
    const initialized = store.users.some((u) => u.role === "admin");
    return NextResponse.json({
      initialized,
      env_admin_configured: Boolean(process.env.ADMIN_EMAIL?.trim() && (process.env.ADMIN_PASSWORD?.length ?? 0) >= 10),
      allow_public_registration: store.settings.allow_public_registration,
      smtp_configured: store.settings.smtp_configured,
    });
  }

  if (route === "auth/bootstrap-admin" && method === "POST") {
    if (store.users.some((u) => u.role === "admin")) {
      return err(409, "An administrator account already exists");
    }
    const body = await readJson<{ email?: string; password?: string; full_name?: string }>(req);
    if (body instanceof NextResponse) return body;
    const email = (body.email ?? "").trim().toLowerCase();
    const pw = body.password ?? "";
    if (!/^\S+@\S+\.\S+$/.test(email)) return err(422, "Invalid email address");
    if (pw.length < 10) return err(422, "Administrator password must be at least 10 characters");
    if (Buffer.byteLength(pw, "utf8") > 72) return err(422, "Password must be at most 72 bytes");
    if (store.users.some((u) => u.email === email)) return err(409, "Email is already registered");

    const adminUser: StoredUser = {
      id: store.nextId.user++,
      email,
      hashed_password: hashPassword(pw),
      full_name: body.full_name?.trim().slice(0, 120) || "Platform Administrator",
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
    };
    store.users.push(adminUser);
    addAudit(store, adminUser.id, "bootstrap_admin", "user", adminUser.id, { email: adminUser.email });
    const token = createAccessToken(adminUser.id, adminUser.role);
    return setSessionCookie(
      NextResponse.json({ access_token: token, token_type: "bearer", user: userOut(adminUser) }, { status: 201 }),
      req,
      token
    );
  }

  if (route === "auth/register" && method === "POST") {
    if (!store.settings.allow_public_registration) {
      return err(403, "Public registration is currently paused by an administrator");
    }
    const body = await readJson<{ email?: string; password?: string; full_name?: string | null; district_id?: number | null }>(req);
    if (body instanceof NextResponse) return body;
    const email = (body.email ?? "").trim().toLowerCase();
    const pw = body.password ?? "";
    if (!/^\S+@\S+\.\S+$/.test(email)) return err(422, "Invalid email address");
    if (pw.length < 8) return err(422, "Password must be at least 8 characters");
    if (Buffer.byteLength(pw, "utf8") > 72) return err(422, "Password must be at most 72 bytes");
    if (store.users.some((u) => u.email === email)) return err(409, "Email is already registered");
    const districtId =
      body.district_id && store.districts.some((d) => d.id === body.district_id) ? body.district_id : null;
    const verifyCode = generateOpaqueToken(12);
    const u: StoredUser = {
      id: store.nextId.user++,
      email,
      hashed_password: hashPassword(pw),
      full_name: body.full_name?.trim().slice(0, 120) || null,
      role: "user",
      is_active: true,
      email_verified: false,
      email_verify_token_hash: hashOpaqueToken(verifyCode),
      reset_token_hash: null,
      reset_expires_at: null,
      phone: null,
      district_id: districtId,
      notification_prefs: {
        district_alerts: store.settings.default_alert_notifications,
        incident_updates: true,
        public_safety: true,
      },
      privacy_prefs: { share_approximate_only: false },
      created_at: new Date().toISOString(),
    };
    store.users.push(u);
    addAudit(store, u.id, "register", "user", u.id, { email: u.email });
    pushNotification(store, {
      user_id: u.id,
      kind: "system",
      title: "Welcome to CrisisTwin AI",
      body: store.settings.smtp_configured
        ? "Account created. Check your inbox to verify your email address."
        : "Account created. Outbound email is not configured on this server; you can verify your account inside Profile using your verification code.",
      link: "/profile",
    });
    const token = createAccessToken(u.id, u.role);
    return setSessionCookie(
      NextResponse.json(
        {
          ...userOut(u),
          access_token: token,
          smtp_configured: store.settings.smtp_configured,
          verification_notice: store.settings.smtp_configured
            ? "Verification email queued."
            : `Email delivery is not configured on this server. Save this one-time verification code to verify inside Profile: ${verifyCode}`,
        },
        { status: 201 }
      ),
      req,
      token
    );
  }

  if (route === "auth/login" && method === "POST") {
    const body = await readJson<{ email?: string; password?: string }>(req);
    if (body instanceof NextResponse) return body;
    const email = (body.email ?? "").trim().toLowerCase();
    const pw = body.password ?? "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (loginBlocked(ip, email)) return err(429, "Too many failed sign-in attempts. Try again in a few minutes.");
    const user = store.users.find((u) => u.email === email);
    if (!user || !user.is_active || !verifyPassword(pw, user.hashed_password)) {
      loginFailed(ip, email);
      return err(401, "Invalid email or password");
    }
    loginOk(ip, email);
    addAudit(store, user.id, "login", "user", user.id);
    const token = createAccessToken(user.id, user.role);
    return setSessionCookie(
      NextResponse.json({ access_token: token, token_type: "bearer", user: userOut(user) }),
      req,
      token
    );
  }

  if (route === "auth/logout" && method === "POST") {
    if (!verifyMutationOrigin(req)) return err(403, "Cross-origin logout rejected");
    return clearSessionCookie(NextResponse.json({ ok: true }), req);
  }

  if (route === "auth/me" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    return NextResponse.json(userOut(u));
  }

  if (route === "auth/verify-email" && method === "POST") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const body = await readJson<{ code?: string }>(req);
    if (body instanceof NextResponse) return body;
    const code = (body.code ?? "").trim();
    if (u.email_verified) return NextResponse.json(userOut(u));
    if (!code || !u.email_verify_token_hash || hashOpaqueToken(code) !== u.email_verify_token_hash) {
      return err(422, "Invalid verification code");
    }
    u.email_verified = true;
    u.email_verify_token_hash = null;
    addAudit(store, u.id, "verify_email", "user", u.id);
    return NextResponse.json(userOut(u));
  }

  if (route === "auth/request-password-reset" && method === "POST") {
    const body = await readJson<{ email?: string }>(req);
    if (body instanceof NextResponse) return body;
    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return err(422, "Enter a valid email address");
    const target = store.users.find((u) => u.email === email && u.is_active);
    if (target) {
      addAudit(store, target.id, "password_reset_requested", "user", target.id);
    }
    return NextResponse.json({
      smtp_configured: store.settings.smtp_configured,
      message: store.settings.smtp_configured
        ? "If an active account exists for that email, reset instructions have been sent."
        : "Outbound email (SMTP) is not configured on this server. Request a one-time reset code from an administrator in Admin -> Users, then enter it below.",
    });
  }

  if (route === "auth/reset-password" && method === "POST") {
    const body = await readJson<{ email?: string; code?: string; new_password?: string }>(req);
    if (body instanceof NextResponse) return body;
    const email = (body.email ?? "").trim().toLowerCase();
    const code = (body.code ?? "").trim();
    const newPw = body.new_password ?? "";
    if (newPw.length < 8) return err(422, "New password must be at least 8 characters");
    if (Buffer.byteLength(newPw, "utf8") > 72) return err(422, "Password must be at most 72 bytes");
    const target = store.users.find((u) => u.email === email && u.is_active);
    if (
      !target ||
      !target.reset_token_hash ||
      !target.reset_expires_at ||
      target.reset_expires_at < Date.now() ||
      hashOpaqueToken(code) !== target.reset_token_hash
    ) {
      return err(422, "Invalid or expired reset code");
    }
    target.hashed_password = hashPassword(newPw);
    target.reset_token_hash = null;
    target.reset_expires_at = null;
    addAudit(store, target.id, "password_reset_completed", "user", target.id);
    return NextResponse.json({ ok: true });
  }

  // ---- USER PROFILE & ACCOUNT ----
  if (route === "users/me") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    if (method === "GET") {
      return NextResponse.json(userOut(u));
    }
    if (method === "PATCH") {
      const body = await readJson<{
        full_name?: string | null;
        phone?: string | null;
        district_id?: number | null;
        notification_prefs?: Partial<StoredUser["notification_prefs"]>;
        privacy_prefs?: Partial<StoredUser["privacy_prefs"]>;
      }>(req);
      if (body instanceof NextResponse) return body;
      if ("full_name" in body) u.full_name = body.full_name ? body.full_name.trim().slice(0, 120) : null;
      if ("phone" in body) {
        const p = body.phone ? body.phone.trim() : null;
        if (p && !PHONE_RE.test(p)) return err(422, "Invalid phone format");
        u.phone = p;
      }
      if ("district_id" in body) {
        if (body.district_id !== null && !store.districts.some((d) => d.id === body.district_id)) {
          return err(404, "District not found");
        }
        u.district_id = body.district_id ?? null;
      }
      if (body.notification_prefs) {
        u.notification_prefs = {
          district_alerts: body.notification_prefs.district_alerts ?? u.notification_prefs.district_alerts,
          incident_updates: body.notification_prefs.incident_updates ?? u.notification_prefs.incident_updates,
          public_safety: body.notification_prefs.public_safety ?? u.notification_prefs.public_safety,
        };
      }
      if (body.privacy_prefs) {
        u.privacy_prefs = {
          share_approximate_only:
            body.privacy_prefs.share_approximate_only ?? u.privacy_prefs.share_approximate_only,
        };
      }
      addAudit(store, u.id, "update_profile", "user", u.id);
      return NextResponse.json(userOut(u));
    }
    if (method === "DELETE") {
      if (u.role === "admin" && store.users.filter((x) => x.role === "admin" && x.is_active).length <= 1) {
        return err(409, "Cannot delete the last active administrator account");
      }
      u.is_active = false;
      u.full_name = "Deleted user";
      u.phone = null;
      u.email = `deleted-${u.id}@anonymized.local`;
      u.hashed_password = hashPassword(generateOpaqueToken(16));
      store.notifications = store.notifications.filter((n) => n.user_id !== u.id);
      addAudit(store, u.id, "delete_account", "user", u.id);
      return clearSessionCookie(new NextResponse(null, { status: 204 }), req);
    }
  }

  if (route === "users/me/password" && method === "POST") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const body = await readJson<{ current_password?: string; new_password?: string }>(req);
    if (body instanceof NextResponse) return body;
    if (!verifyPassword(body.current_password ?? "", u.hashed_password)) {
      return err(401, "Current password is incorrect");
    }
    const newPw = body.new_password ?? "";
    if (newPw.length < 8) return err(422, "New password must be at least 8 characters");
    if (Buffer.byteLength(newPw, "utf8") > 72) return err(422, "Password must be at most 72 bytes");
    u.hashed_password = hashPassword(newPw);
    addAudit(store, u.id, "change_password", "user", u.id);
    return NextResponse.json({ ok: true });
  }

  // ---- ALERTS ----
  if (route === "alerts") {
    if (method === "GET") {
      const maybeUser = getOptionalUser(req, store);
      const sp = req.nextUrl.searchParams;
      const did = sp.get("district_id") ? Number(sp.get("district_id")) : null;
      const includeAll = sp.get("all") === "1" && maybeUser?.role === "admin";
      const dMap = new Map(store.districts.map((d) => [d.id, d.name]));
      const now = Date.now();
      let rows = [...store.alerts];
      if (!includeAll) {
        rows = rows.filter((a) => isAlertActive(a, now));
      }
      if (did) {
        rows = rows.filter((a) => a.district_ids.length === 0 || a.district_ids.includes(did));
      }
      return NextResponse.json(
        rows.map((a) => ({
          ...a,
          district_names: a.district_ids.map((id) => dMap.get(id) ?? `District ${id}`),
        }))
      );
    }
    if (method === "POST") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      const body = await readJson<{
        title?: string;
        message?: string;
        severity?: string;
        hazard_type?: string;
        district_ids?: number[];
        safety_instructions?: string;
        status?: string;
        source?: string;
        expires_at?: string | null;
      }>(req);
      if (body instanceof NextResponse) return body;
      const title = (body.title ?? "").trim();
      const message = (body.message ?? "").trim();
      const severity = (body.severity ?? "advisory").toLowerCase();
      const status = (body.status ?? "draft").toLowerCase();
      const source = (body.source ?? "").trim();
      if (title.length < 3 || title.length > 160) return err(422, "Alert title must be 3–160 characters");
      if (message.length < 10 || message.length > 2000) return err(422, "Alert message must be 10–2000 characters");
      if (!ALERT_SEVERITIES.has(severity)) return err(422, "Invalid alert severity");
      if (!ALERT_STATUSES.has(status)) return err(422, "Invalid alert status");
      if (source.length < 2) return err(422, "Source is required for every alert");
      const districtIds = (body.district_ids ?? []).filter((id) => store.districts.some((d) => d.id === id));
      const nowIso = new Date().toISOString();
      const item: AlertItem = {
        id: store.nextId.alert++,
        title,
        message,
        severity: severity as AlertItem["severity"],
        hazard_type: (body.hazard_type ?? "flood").trim() || "flood",
        district_ids: districtIds,
        safety_instructions: (body.safety_instructions ?? "").trim() || "Follow instructions from local PDMA and district officials.",
        status: status as AlertItem["status"],
        source,
        created_by: admin.id,
        created_at: nowIso,
        published_at: status === "published" ? nowIso : null,
        expires_at: body.expires_at ?? null,
        delivery_count: 0,
      };
      store.alerts.unshift(item);
      if (item.status === "published") notifyPublishedAlert(store, item);
      addAudit(store, admin.id, "create", "alert", item.id, { title: item.title, status: item.status });
      return NextResponse.json(item, { status: 201 });
    }
  }

  if (segs[0] === "alerts" && segs.length === 2) {
    const id = Number(segs[1]);
    const item = store.alerts.find((a) => a.id === id);
    if (method === "PATCH") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!item) return err(404, "Alert not found");
      const body = await readJson<Partial<AlertItem>>(req);
      if (body instanceof NextResponse) return body;
      const prevStatus = item.status;
      if (body.title !== undefined) {
        if (body.title.trim().length < 3) return err(422, "Title too short");
        item.title = body.title.trim();
      }
      if (body.message !== undefined) {
        if (body.message.trim().length < 10) return err(422, "Message too short");
        item.message = body.message.trim();
      }
      if (body.severity !== undefined) {
        if (!ALERT_SEVERITIES.has(body.severity)) return err(422, "Invalid severity");
        item.severity = body.severity;
      }
      if (body.hazard_type !== undefined) item.hazard_type = body.hazard_type.trim() || item.hazard_type;
      if (body.safety_instructions !== undefined) item.safety_instructions = body.safety_instructions.trim();
      if (body.source !== undefined && body.source.trim().length >= 2) item.source = body.source.trim();
      if (Array.isArray(body.district_ids)) {
        item.district_ids = body.district_ids.filter((did) => store.districts.some((d) => d.id === did));
      }
      if ("expires_at" in body) item.expires_at = body.expires_at ?? null;
      if (body.status !== undefined) {
        if (!ALERT_STATUSES.has(body.status)) return err(422, "Invalid status");
        item.status = body.status;
        if (body.status === "published" && prevStatus !== "published") {
          item.published_at = new Date().toISOString();
          notifyPublishedAlert(store, item);
        }
      }
      addAudit(store, admin.id, "update", "alert", item.id, { status: item.status });
      return NextResponse.json(item);
    }
    if (method === "DELETE") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!item) return err(404, "Alert not found");
      store.alerts = store.alerts.filter((a) => a.id !== id);
      addAudit(store, admin.id, "delete", "alert", id, { title: item.title });
      return new NextResponse(null, { status: 204 });
    }
  }

  // ---- NOTIFICATIONS ----
  if (route === "notifications" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const rows = store.notifications.filter((n) => n.user_id === u.id).slice(0, 100);
    return NextResponse.json({
      items: rows,
      unread_count: rows.filter((n) => !n.read).length,
    });
  }

  if (route === "notifications/read-all" && method === "POST") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    for (const n of store.notifications) {
      if (n.user_id === u.id) n.read = true;
    }
    return NextResponse.json({ ok: true });
  }

  if (segs[0] === "notifications" && segs.length === 3 && segs[2] === "read" && method === "POST") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const n = store.notifications.find((x) => x.id === Number(segs[1]) && x.user_id === u.id);
    if (!n) return err(404, "Notification not found");
    n.read = true;
    return NextResponse.json(n);
  }

  // ---- DISTRICTS ----
  if (route === "districts/boundaries/all" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const features = [...store.districts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => {
        const b = store.boundaries.get(d.id);
        if (!b) return null;
        return {
          type: "Feature",
          geometry: b.geometry,
          properties: {
            district_id: d.id,
            name: d.name,
            verified: d.verified,
            source: b.source,
            area_km2: d.area_km2,
          },
        };
      })
      .filter(Boolean);
    return NextResponse.json({ type: "FeatureCollection", features });
  }

  if (route === "districts") {
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      return NextResponse.json([...store.districts].sort((a, b) => a.name.localeCompare(b.name)));
    }
    if (method === "POST") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      const body = await readJson<{
        name?: string;
        area_km2?: number | null;
        population?: number | null;
        data_source?: string | null;
        verified?: boolean;
      }>(req);
      if (body instanceof NextResponse) return body;
      const name = (body.name ?? "").trim();
      if (name.length < 2 || name.length > 120) return err(422, "District name must be 2–120 characters");
      if (store.districts.some((d) => d.name.toLowerCase() === name.toLowerCase())) return err(409, "District already exists");
      const d = {
        id: store.nextId.district++,
        name,
        province: "Balochistan",
        area_km2: body.area_km2 ?? null,
        population: body.population ?? null,
        data_source: body.data_source ?? null,
        verified: Boolean(body.verified),
        has_boundary: false,
      };
      store.districts.push(d);
      addAudit(store, admin.id, "create", "district", d.id, { name: d.name });
      return NextResponse.json(d, { status: 201 });
    }
  }

  if (segs[0] === "districts" && segs.length === 2) {
    const id = Number(segs[1]);
    if (!Number.isFinite(id)) return err(404, "District not found");
    const d = store.districts.find((x) => x.id === id);
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      if (!d) return err(404, "District not found");
      return NextResponse.json(d);
    }
    if (method === "PATCH") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!d) return err(404, "District not found");
      const body = await readJson<Record<string, unknown>>(req);
      if (body instanceof NextResponse) return body;
      for (const k of ["area_km2", "population", "data_source", "verified"] as const) {
        if (k in body) (d as unknown as Record<string, unknown>)[k] = body[k];
      }
      addAudit(store, admin.id, "update", "district", d.id, body);
      return NextResponse.json(d);
    }
    if (method === "DELETE") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!d) return err(404, "District not found");
      const referenced =
        store.assessments.some((a) => a.district_id === id) ||
        store.simulations.some((s) => s.district_id === id) ||
        store.resources.some((r) => r.district_id === id);
      if (referenced) return err(409, "District is referenced by assessments, simulations or resources");
      store.districts = store.districts.filter((x) => x.id !== id);
      store.boundaries.delete(id);
      addAudit(store, admin.id, "delete", "district", id, { name: d.name });
      return new NextResponse(null, { status: 204 });
    }
  }

  if (segs[0] === "districts" && segs.length === 3 && segs[2] === "boundary") {
    const id = Number(segs[1]);
    const d = store.districts.find((x) => x.id === id);
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      if (!d) return err(404, "District not found");
      const b = store.boundaries.get(id);
      if (!b) return err(404, "No verified boundary is available for this district");
      return NextResponse.json({
        type: "Feature",
        geometry: b.geometry,
        properties: { district_id: d.id, name: d.name, crs: b.crs, source: b.source },
      });
    }
    if (method === "PUT") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!d) return err(404, "District not found");
      const body = await readJson<{ geometry?: GeoJSON.Geometry; source?: string }>(req);
      if (body instanceof NextResponse) return body;
      if (!body.source || body.source.trim().length < 3) return err(422, "Source is required");
      const geomErr = validatePolygon(body.geometry);
      if (geomErr) return err(422, geomErr);
      store.boundaries.set(id, {
        district_id: id,
        geometry: body.geometry!,
        crs: "EPSG:4326",
        source: body.source.trim(),
      });
      d.has_boundary = true;
      addAudit(store, admin.id, "set_boundary", "district", id, { source: body.source });
      return new NextResponse(null, { status: 204 });
    }
  }

  // ---- RISK ----
  if (route === "risk/assess" && method === "POST") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const body = await readJson<{
      district_id?: number;
      rainfall_mm_24h?: number | null;
      duration_h?: number | null;
      elevation_m?: number | null;
      slope_deg?: number | null;
      flood_history_index?: number | null;
      exposure_index?: number | null;
      input_status?: Record<string, string>;
    }>(req);
    if (body instanceof NextResponse) return body;
    if (!body.district_id || !store.districts.some((d) => d.id === body.district_id)) return err(404, "District not found");
    const inputs: Record<string, number | null> = {
      rainfall_mm_24h: body.rainfall_mm_24h ?? null,
      duration_h: body.duration_h ?? null,
      elevation_m: body.elevation_m ?? null,
      slope_deg: body.slope_deg ?? null,
      flood_history_index: body.flood_history_index ?? null,
      exposure_index: body.exposure_index ?? null,
    };
    const result = runRiskAssess(inputs, body.input_status ?? {});
    const row = {
      id: store.nextId.assessment++,
      district_id: body.district_id,
      user_id: u.id,
      inputs,
      result,
      score: result.score,
      category: result.category,
      created_at: new Date().toISOString(),
    };
    store.assessments.unshift(row);
    return NextResponse.json(row, { status: 201 });
  }

  if (route === "risk/assessments" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const did = req.nextUrl.searchParams.get("district_id");
    let rows = u.role === "admin" ? store.assessments : store.assessments.filter((a) => a.user_id === u.id);
    if (did) rows = rows.filter((a) => a.district_id === Number(did));
    return NextResponse.json(rows);
  }

  if (segs[0] === "risk" && segs[1] === "assessments" && segs.length === 3 && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const id = Number(segs[2]);
    const row = store.assessments.find((a) => a.id === id);
    if (!row || (u.role !== "admin" && row.user_id !== u.id)) return err(404, "Assessment not found");
    return NextResponse.json(row);
  }

  // ---- SIMULATIONS ----
  if (route === "simulations") {
    if (method === "POST") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      const body = await readJson<{
        district_id?: number;
        rainfall_intensity_mm_h?: number;
        duration_h?: number;
        elevation_m?: number | null;
        slope_deg?: number | null;
        flood_history_index?: number | null;
        exposure_index?: number | null;
        input_status?: Record<string, string>;
      }>(req);
      if (body instanceof NextResponse) return body;
      if (!body.district_id || !store.districts.some((d) => d.id === body.district_id)) return err(404, "District not found");
      const intensity = Number(body.rainfall_intensity_mm_h);
      const duration = Number(body.duration_h);
      if (!(intensity > 0 && intensity <= 300)) return err(422, "rainfall_intensity_mm_h must be in (0, 300]");
      if (!(duration > 0 && duration <= 168)) return err(422, "duration_h must be in (0, 168]");
      const peak = Math.min(intensity * Math.min(duration, 24), 1000);
      const indicators = runRiskAssess(
        {
          rainfall_mm_24h: peak,
          duration_h: duration,
          elevation_m: body.elevation_m ?? null,
          slope_deg: body.slope_deg ?? null,
          flood_history_index: body.flood_history_index ?? null,
          exposure_index: body.exposure_index ?? null,
        },
        { rainfall_mm_24h: "assumption", ...(body.input_status ?? {}) }
      );
      const bnd = store.boundaries.get(body.district_id)?.geometry ?? null;
      const results: SimulationResults = {
        total_rainfall_mm: Math.round(intensity * duration * 10) / 10,
        risk_indicators: indicators,
        visualization: bnd
          ? { type: "Feature", geometry: bnd, properties: { category: indicators.category, score: indicators.score } }
          : null,
        visualization_note: bnd ? null : "No verified boundary is stored for this district.",
        assumptions: SIM_ASSUMPTIONS,
        limitations: SIM_LIMITATIONS,
        processing_status: "completed",
      };
      const row = {
        id: store.nextId.simulation++,
        district_id: body.district_id,
        user_id: u.id,
        params: body as Record<string, unknown>,
        status: "completed",
        results,
        created_at: new Date().toISOString(),
      };
      store.simulations.unshift(row);
      return NextResponse.json(row, { status: 201 });
    }
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      const rows = u.role === "admin" ? store.simulations : store.simulations.filter((s) => s.user_id === u.id);
      return NextResponse.json(rows.map(({ results: _r, ...rest }) => rest));
    }
  }

  if (segs[0] === "simulations" && segs.length === 2 && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const row = store.simulations.find((s) => s.id === Number(segs[1]));
    if (!row || (u.role !== "admin" && row.user_id !== u.id)) return err(404, "Simulation not found");
    const { results: _r, ...rest } = row;
    return NextResponse.json(rest);
  }

  if (segs[0] === "simulations" && segs.length === 3 && segs[2] === "results" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const row = store.simulations.find((s) => s.id === Number(segs[1]));
    if (!row || (u.role !== "admin" && row.user_id !== u.id)) return err(404, "Simulation not found");
    return NextResponse.json({
      simulation_id: row.id,
      parameters: row.params,
      status: row.status,
      results: row.results,
    });
  }

  // ---- RESOURCES ----
  if (route === "resources/bulk" && method === "POST") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const body = await readJson<{ items?: Partial<ResourceInput>[] }>(req);
    if (body instanceof NextResponse) return body;
    const items = body.items ?? [];
    if (!Array.isArray(items) || items.length < 1 || items.length > 500) {
      return err(422, "items must contain 1 to 500 records");
    }
    for (const it of items) {
      const msg = validateResourceInput(it, store);
      if (msg) return err(422, msg);
    }
    for (const it of items) {
      store.resources.push({
        id: store.nextId.resource++,
        name: it.name!.trim(),
        type: it.type as ResourceType,
        district_id: it.district_id ?? null,
        latitude: it.latitude!,
        longitude: it.longitude!,
        phone: it.phone ?? null,
        address: it.address ?? null,
        source: it.source!.trim(),
        verified: Boolean(it.verified),
        capacity: it.capacity ?? null,
        availability_status: (it.availability_status ?? "available") as AvailabilityStatus,
      });
    }
    addAudit(store, admin.id, "bulk_create", "resource", null, { count: items.length });
    return NextResponse.json({ created: items.length }, { status: 201 });
  }

  if (route === "resources") {
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      const sp = req.nextUrl.searchParams;
      const type = sp.get("type");
      const did = sp.get("district_id");
      const q = sp.get("q")?.toLowerCase();
      const bbox = sp.get("bbox");
      const latRaw = sp.get("lat");
      const lonRaw = sp.get("lon");
      const hasOrigin = latRaw !== null && lonRaw !== null && Number.isFinite(Number(latRaw)) && Number.isFinite(Number(lonRaw));
      const uLat = Number(latRaw), uLon = Number(lonRaw);

      let rows = store.resources.map((r) => ({
        ...r,
        ...(hasOrigin ? { distance_km: Math.round(kmBetween(uLat, uLon, r.latitude, r.longitude) * 10) / 10 } : {}),
      }));
      if (type) rows = rows.filter((r) => r.type === type);
      if (did) rows = rows.filter((r) => r.district_id === Number(did));
      if (bbox) {
        const pts = bbox.split(",").map(Number);
        if (pts.length !== 4 || pts.some(Number.isNaN)) return err(422, "bbox must be minLon,minLat,maxLon,maxLat");
        const [x0, y0, x1, y1] = pts;
        rows = rows.filter((r) => r.longitude >= x0 && r.longitude <= x1 && r.latitude >= y0 && r.latitude <= y1);
      }
      if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.address ?? "").toLowerCase().includes(q));
      if (hasOrigin) {
        rows.sort((a, b) => (a.distance_km ?? 99999) - (b.distance_km ?? 99999));
      } else {
        rows.sort((a, b) => a.name.localeCompare(b.name));
      }
      return NextResponse.json(rows);
    }
    if (method === "POST") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      const body = await readJson<Partial<ResourceInput>>(req);
      if (body instanceof NextResponse) return body;
      const msg = validateResourceInput(body, store);
      if (msg) return err(422, msg);
      const r = {
        id: store.nextId.resource++,
        name: body.name!.trim(),
        type: body.type as ResourceType,
        district_id: body.district_id ?? null,
        latitude: body.latitude!,
        longitude: body.longitude!,
        phone: body.phone ?? null,
        address: body.address ?? null,
        source: body.source!.trim(),
        verified: Boolean(body.verified),
        capacity: body.capacity ?? null,
        availability_status: (body.availability_status ?? "available") as AvailabilityStatus,
      };
      store.resources.push(r);
      addAudit(store, admin.id, "create", "resource", r.id, { name: r.name });
      return NextResponse.json(r, { status: 201 });
    }
  }

  if (segs[0] === "resources" && segs.length === 2) {
    const id = Number(segs[1]);
    const r = store.resources.find((x) => x.id === id);
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      if (!r) return err(404, "Resource not found");
      return NextResponse.json(r);
    }
    if (method === "PUT") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!r) return err(404, "Resource not found");
      const body = await readJson<Partial<ResourceInput>>(req);
      if (body instanceof NextResponse) return body;
      const msg = validateResourceInput(body, store);
      if (msg) return err(422, msg);
      Object.assign(r, {
        name: body.name!.trim(),
        type: body.type as ResourceType,
        district_id: body.district_id ?? null,
        latitude: body.latitude!,
        longitude: body.longitude!,
        phone: body.phone ?? null,
        address: body.address ?? null,
        source: body.source!.trim(),
        verified: Boolean(body.verified),
        capacity: body.capacity ?? null,
        availability_status: (body.availability_status ?? r.availability_status ?? "available") as AvailabilityStatus,
      });
      addAudit(store, admin.id, "update", "resource", r.id);
      return NextResponse.json(r);
    }
    if (method === "DELETE") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!r) return err(404, "Resource not found");
      store.resources = store.resources.filter((x) => x.id !== id);
      addAudit(store, admin.id, "delete", "resource", id, { name: r.name });
      return new NextResponse(null, { status: 204 });
    }
  }

  // ---- DATASETS ----
  if (route === "datasets") {
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      return NextResponse.json([...store.datasets].sort((a, b) => a.name.localeCompare(b.name)));
    }
    if (method === "POST") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      const body = await readJson<{ name?: string; kind?: string; source?: string; description?: string | null; verified?: boolean }>(req);
      if (body instanceof NextResponse) return body;
      if (!body.name || body.name.trim().length < 2) return err(422, "Dataset name is required");
      if (!body.source || body.source.trim().length < 3) return err(422, "Source is required");
      if (store.datasets.some((d) => d.name.toLowerCase() === body.name!.trim().toLowerCase())) {
        return err(409, "Dataset name already exists");
      }
      const nowIso = new Date().toISOString();
      const d = {
        id: store.nextId.dataset++,
        name: body.name.trim(),
        kind: body.kind?.trim() || "other",
        source: body.source.trim(),
        description: body.description ?? null,
        verified: Boolean(body.verified),
        created_at: nowIso,
        updated_at: nowIso,
      };
      store.datasets.push(d);
      addAudit(store, admin.id, "create", "dataset", d.id, { name: d.name });
      return NextResponse.json(d, { status: 201 });
    }
  }

  if (segs[0] === "datasets" && segs.length === 2) {
    const id = Number(segs[1]);
    const d = store.datasets.find((x) => x.id === id);
    if (method === "PUT") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!d) return err(404, "Dataset not found");
      const body = await readJson<{ name?: string; kind?: string; source?: string; description?: string | null; verified?: boolean }>(req);
      if (body instanceof NextResponse) return body;
      Object.assign(d, {
        name: body.name?.trim() || d.name,
        kind: body.kind?.trim() || d.kind,
        source: body.source?.trim() || d.source,
        description: body.description ?? null,
        verified: Boolean(body.verified),
        updated_at: new Date().toISOString(),
      });
      addAudit(store, admin.id, "update", "dataset", d.id);
      return NextResponse.json(d);
    }
    if (method === "DELETE") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!d) return err(404, "Dataset not found");
      store.datasets = store.datasets.filter((x) => x.id !== id);
      addAudit(store, admin.id, "delete", "dataset", id, { name: d.name });
      return new NextResponse(null, { status: 204 });
    }
  }

  // ---- INCIDENTS ----
  if (route === "incidents/mine" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    return NextResponse.json(store.incidents.filter((i) => i.user_id === u.id).slice(0, 100).map((i) => incidentOut(store, i)));
  }

  if (route === "incidents/public" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    return NextResponse.json(
      store.incidents
        .filter((i) => i.status === "verified" || i.status === "response_assigned" || i.status === "resolved")
        .slice(0, 300)
        .map((i) => incidentOut(store, i, { publicView: true }))
    );
  }

  if (route === "incidents/stats" && method === "GET") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const counts = { pending: 0, under_review: 0, verified: 0, response_assigned: 0, rejected: 0, resolved: 0 };
    for (const i of store.incidents) {
      if (i.status in counts) counts[i.status as keyof typeof counts]++;
    }
    return NextResponse.json({ total: store.incidents.length, ...counts });
  }

  if (route === "incidents") {
    if (method === "GET") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      const sp = req.nextUrl.searchParams;
      const status = sp.get("status");
      const type = sp.get("type");
      const did = sp.get("district_id");
      let rows = [...store.incidents];
      if (status) rows = rows.filter((i) => i.status === status);
      if (type) rows = rows.filter((i) => i.type === type);
      if (did) rows = rows.filter((i) => i.district_id === Number(did));
      return NextResponse.json(rows.slice(0, 500).map((i) => incidentOut(store, i)));
    }
    if (method === "POST") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      let fd: FormData;
      try {
        fd = await req.formData();
      } catch {
        return err(400, "Invalid multipart form data");
      }
      const str = (k: string) => {
        const v = fd.get(k);
        return typeof v === "string" ? v : "";
      };
      const type = str("type");
      const severity = str("severity") || "medium";
      const description = str("description").trim();
      const latitude = Number(str("latitude"));
      const longitude = Number(str("longitude"));
      const accuracyRaw = str("accuracy_m");
      const accuracy_m = accuracyRaw ? Number(accuracyRaw) : null;
      const location_source = str("location_source") || "map_pin";
      const place_text = str("place_text").trim().slice(0, 255) || null;
      const contact_phone = str("contact_phone").trim() || null;
      const peopleRaw = str("people_affected");
      const people_affected = peopleRaw ? Number(peopleRaw) : null;
      const observed_at = str("observed_at").trim() || null;

      if (!INCIDENT_TYPES.has(type)) return err(422, "Unknown incident type");
      if (!INCIDENT_SEVERITIES.has(severity)) return err(422, "Unknown severity");
      if (description.length < 10 || description.length > 2000) return err(422, "Describe what is happening in 10–2000 characters");
      if (!["gps", "map_pin", "search", "manual"].includes(location_source)) return err(422, "Unknown location_source");
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !inBalochistan(latitude, longitude)) {
        return err(422, "Location is outside the Balochistan study area");
      }
      if (accuracy_m !== null && !(accuracy_m >= 0 && accuracy_m <= 100000)) return err(422, "Invalid GPS accuracy");
      if (contact_phone && !PHONE_RE.test(contact_phone)) return err(422, "Contact phone looks invalid");
      if (people_affected !== null && !(people_affected >= 0 && people_affected <= 1_000_000)) return err(422, "Invalid number of people");

      const photoEntries = fd.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0);
      if (photoEntries.length > 4) return err(422, "At most 4 photos");
      const allowedMime = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
      const processed: { content_type: string; sha256: string; size: number; width: number; height: number; data: Buffer }[] = [];
      for (const f of photoEntries) {
        if (f.size > 8 * 1024 * 1024) return err(422, `${f.name}: Photo is larger than 8 MB`);
        if (f.type && !allowedMime.has(f.type)) return err(422, `${f.name}: Only JPEG, PNG or WebP photos are accepted`);
        const buf = Buffer.from(await f.arrayBuffer());
        processed.push({
          content_type: f.type || "image/jpeg",
          sha256: crypto.createHash("sha256").update(buf).digest("hex"),
          size: buf.length,
          width: 0,
          height: 0,
          data: buf,
        });
      }

      if (!incidentRateOk(u.id)) {
        return err(429, "Too many reports in the last hour. If this is an emergency, call Police 15.");
      }

      const dayAgo = Date.now() - 24 * 3600_000;
      const similar = store.incidents.filter(
        (i) =>
          i.type === type &&
          ["pending", "under_review", "verified", "response_assigned"].includes(i.status) &&
          new Date(i.created_at).getTime() >= dayAgo &&
          kmBetween(latitude, longitude, i.latitude, i.longitude) <= 2.0
      ).length;

      let districtId: number | null = null;
      for (const b of store.boundaries.values()) {
        if (pointInGeometry(latitude, longitude, b.geometry)) {
          districtId = b.district_id;
          break;
        }
      }
      const districtName = districtId ? store.districts.find((d) => d.id === districtId)?.name ?? null : null;

      const incId = store.nextId.incident++;
      const nowIso = new Date().toISOString();
      const inc: StoredIncident = {
        id: incId,
        code: newIncidentCode(store),
        user_id: u.id,
        type: type as IncidentType,
        severity: severity as IncidentSeverity,
        description,
        latitude: Math.round(latitude * 1e6) / 1e6,
        longitude: Math.round(longitude * 1e6) / 1e6,
        accuracy_m,
        location_source,
        place_text,
        district_id: districtId,
        district_name: districtName,
        contact_phone,
        people_affected,
        observed_at,
        status: "pending",
        admin_note: null,
        assigned_team: null,
        duplicate_of_id: null,
        flag_count: 0,
        flagged_by: [],
        reviewed_by: null,
        reviewed_at: null,
        created_at: nowIso,
        photo_count: processed.length,
        history: [{ status: "pending", by_role: u.role, note: "Submitted by citizen", at: nowIso }],
        media_blobs: processed.map((m) => ({ ...m, id: store.nextId.media++, incident_id: incId })),
      };
      store.incidents.unshift(inc);
      addAudit(store, u.id, "submit", "incident", inc.id, { code: inc.code, type, photos: processed.length });
      if (u.notification_prefs.incident_updates) {
        pushNotification(store, {
          user_id: u.id,
          kind: "incident",
          title: `Report ${inc.code} received`,
          body: `Your ${inc.type.replace(/_/g, " ")} report${districtName ? ` in ${districtName}` : ""} is awaiting administrator verification.`,
          link: "/report",
        });
      }
      return NextResponse.json(incidentOut(store, inc, { similar }), { status: 201 });
    }
  }

  if (segs[0] === "incidents" && segs.length === 3 && segs[2] === "flag" && method === "POST") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    if (!flagRateOk(u.id)) return err(429, "Too many community flags submitted recently");
    const inc = store.incidents.find((i) => i.id === Number(segs[1]));
    if (!inc || !["verified", "response_assigned", "resolved"].includes(inc.status)) {
      return err(404, "Public incident not found");
    }
    if (inc.flagged_by.includes(u.id)) {
      return err(409, "You have already flagged this report for review");
    }
    const body = await readJson<{ reason?: string }>(req);
    if (body instanceof NextResponse) return body;
    inc.flagged_by.push(u.id);
    inc.flag_count = inc.flagged_by.length;
    addAudit(store, u.id, "flag_inaccurate", "incident", inc.id, {
      code: inc.code,
      reason: (body.reason ?? "").trim().slice(0, 200) || "Reported potentially inaccurate",
    });
    return NextResponse.json({ id: inc.id, flag_count: inc.flag_count });
  }

  if (segs[0] === "incidents" && segs.length === 4 && segs[2] === "media" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const inc = store.incidents.find((i) => i.id === Number(segs[1]));
    if (!inc || (inc.user_id !== u.id && u.role !== "admin")) return err(404, "Report not found");
    const m = inc.media_blobs.find((x) => x.id === Number(segs[3]));
    if (!m) return err(404, "Photo not found");
    return new NextResponse(new Uint8Array(m.data), {
      status: 200,
      headers: {
        "Content-Type": m.content_type,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (segs[0] === "incidents" && segs.length === 2) {
    const iid = Number(segs[1]);
    const inc = store.incidents.find((i) => i.id === iid);
    if (method === "GET") {
      const u = getUser(req, store);
      if (u instanceof NextResponse) return u;
      if (!inc || (inc.user_id !== u.id && u.role !== "admin")) return err(404, "Report not found");
      return NextResponse.json(incidentOut(store, inc));
    }
    if (method === "PATCH") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!inc) return err(404, "Report not found");
      const body = await readJson<{
        status?: string;
        severity?: string;
        admin_note?: string | null;
        assigned_team?: string | null;
        duplicate_of_id?: number | null;
      }>(req);
      if (body instanceof NextResponse) return body;
      if (body.status && !INCIDENT_STATUSES.has(body.status)) return err(422, "Invalid status");
      if (body.severity && !INCIDENT_SEVERITIES.has(body.severity)) return err(422, "Invalid severity");
      if (body.duplicate_of_id !== undefined && body.duplicate_of_id !== null) {
        if (body.duplicate_of_id === inc.id || !store.incidents.some((x) => x.id === body.duplicate_of_id)) {
          return err(422, "Invalid duplicate reference incident ID");
        }
        inc.duplicate_of_id = body.duplicate_of_id;
      }
      const prevStatus = inc.status;
      if (body.status) inc.status = body.status as IncidentStatus;
      if (body.severity) inc.severity = body.severity as IncidentSeverity;
      if ("admin_note" in body) inc.admin_note = body.admin_note ?? null;
      if ("assigned_team" in body) inc.assigned_team = body.assigned_team?.trim().slice(0, 120) || null;
      const nowIso = new Date().toISOString();
      inc.reviewed_by = admin.id;
      inc.reviewed_at = nowIso;
      inc.history = [
        ...(inc.history ?? []),
        {
          status: inc.status,
          by_role: "admin",
          note: inc.admin_note ?? null,
          assigned_team: inc.assigned_team ?? null,
          at: nowIso,
        },
      ];
      addAudit(store, admin.id, "review", "incident", inc.id, { code: inc.code, ...body });

      const reporter = store.users.find((u) => u.id === inc.user_id);
      if (reporter && reporter.notification_prefs.incident_updates && prevStatus !== inc.status) {
        pushNotification(store, {
          user_id: reporter.id,
          kind: "incident",
          title: `Report ${inc.code} status updated`,
          body: `Status changed to ${inc.status.replace(/_/g, " ")}${inc.assigned_team ? ` · Team: ${inc.assigned_team}` : ""}`,
          link: "/report",
        });
      }
      return NextResponse.json(incidentOut(store, inc));
    }
    if (method === "DELETE") {
      const admin = requireAdmin(req, store);
      if (admin instanceof NextResponse) return admin;
      if (!inc) return err(404, "Report not found");
      store.incidents = store.incidents.filter((i) => i.id !== iid);
      addAudit(store, admin.id, "delete", "incident", iid, { code: inc.code });
      return new NextResponse(null, { status: 204 });
    }
  }

  // ---- ASSISTANT ----
  if (route === "assistant/chat" && method === "POST") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    if (!aiRateOk(u.id, store.aiConfig.rate_limit_per_minute)) {
      return err(429, "Too many AI requests. Please wait a minute and try again.");
    }
    const body = await readJson<{
      message?: string;
      language?: AssistantLanguage;
      district_id?: number | null;
      simulation_id?: number | null;
      assessment_id?: number | null;
    }>(req);
    if (body instanceof NextResponse) return body;
    const message = (body.message ?? "").trim();
    const language: AssistantLanguage = body.language === "ur" ? "ur" : body.language === "bal" ? "bal" : "en";
    if (!message || message.length > 2000) return err(422, "Message must be 1–2000 characters");

    const contacts = getContacts();
    const activeAlerts = store.alerts.filter((a) => isAlertActive(a));
    const ctx: Record<string, unknown> = {
      official_helplines: contacts.helplines.map((h) => ({
        name: h.name,
        number: h.number,
        confidence: h.confidence,
        note: h.note,
      })),
      helplines_note: contacts.disclaimer,
      active_published_alerts: activeAlerts.slice(0, 10).map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        hazard_type: a.hazard_type,
        districts: a.district_ids.length
          ? a.district_ids.map((id) => store.districts.find((d) => d.id === id)?.name ?? `District ${id}`)
          : ["Province-wide"],
        safety_instructions: a.safety_instructions,
        source: a.source,
      })),
      verified_incidents_count: store.incidents.filter((i) => ["verified", "response_assigned", "resolved"].includes(i.status)).length,
    };

    if (body.district_id) {
      const d = store.districts.find((x) => x.id === body.district_id);
      if (!d) return err(404, "District not found");
      ctx.district = { id: d.id, name: d.name, verified: d.verified, has_boundary: d.has_boundary };
      const last = store.assessments.find((a) => a.district_id === d.id);
      if (last) {
        ctx.latest_risk_assessment = {
          id: last.id,
          category: last.category,
          score: last.score,
          missing: last.result.missing,
        };
      }
      ctx.hospital_directory_from_health_department = contacts.hospitals
        .filter((h) => h.district.toLowerCase() === d.name.toLowerCase())
        .map((h) => ({ name: h.name, phone: h.phone }));
      ctx.resources = store.resources
        .filter((r) => r.district_id === d.id)
        .slice(0, 10)
        .map((r) => ({
          name: r.name,
          type: r.type,
          availability_status: r.availability_status ?? "available",
          verified: r.verified,
          phone: r.verified ? r.phone : null,
        }));
    }

    if (body.simulation_id) {
      const s = store.simulations.find((x) => x.id === body.simulation_id);
      if (!s || (u.role !== "admin" && s.user_id !== u.id)) return err(404, "Simulation not found");
      ctx.simulation = { id: s.id, params: s.params, status: s.status, indicators: s.results?.risk_indicators ?? null };
    }

    if (body.assessment_id) {
      const a = store.assessments.find((x) => x.id === body.assessment_id);
      if (!a || (u.role !== "admin" && a.user_id !== u.id)) return err(404, "Assessment not found");
      ctx.assessment = { id: a.id, category: a.category, score: a.score, result: a.result };
    }

    const langLabel = language === "ur" ? "Urdu (اردو)" : language === "bal" ? "Balochi (بلوچی / Balochi)" : "English";
    const prompt = `Language: ${langLabel}\nContext (JSON): ${JSON.stringify(ctx)}\nQuestion: ${message}`;
    const startMs = Date.now();
    const usedProvider = resolveProvider(store.aiConfig) ?? "unconfigured";

    try {
      const { reply, provider, model } = await callAi(prompt, { language, config: store.aiConfig });
      store.aiLogs.unshift({
        id: store.nextId.aiLog++,
        user_id: u.id,
        language,
        provider,
        model,
        district_id: body.district_id ?? null,
        status: "ok",
        latency_ms: Date.now() - startMs,
        prompt_chars: prompt.length,
        reply_chars: reply.length,
        error_message: null,
        created_at: new Date().toISOString(),
      });
      if (store.aiLogs.length > 500) store.aiLogs.length = 500;
      return NextResponse.json({
        reply,
        language,
        context_used: ctx,
        disclaimer: "Prototype assistant. Not an official warning source. In an emergency contact local authorities.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown AI failure";
      store.aiLogs.unshift({
        id: store.nextId.aiLog++,
        user_id: u.id,
        language,
        provider: usedProvider,
        model: store.aiConfig.model,
        district_id: body.district_id ?? null,
        status: "error",
        latency_ms: Date.now() - startMs,
        prompt_chars: prompt.length,
        reply_chars: 0,
        error_message: msg,
        created_at: new Date().toISOString(),
      });
      if (store.aiLogs.length > 500) store.aiLogs.length = 500;
      if (e instanceof AIUnavailable) return err(503, msg);
      if (e instanceof AIFailure) return err(502, "The AI provider could not answer right now. Please try again.");
      return err(500, "Internal server error");
    }
  }

  // ---- REPORTS & ANALYTICS ----
  if (route === "reports/overview" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    return NextResponse.json({
      districts: store.districts.length,
      risk_assessments: store.assessments.length,
      simulations: store.simulations.length,
      emergency_resources: store.resources.length,
      verified_resources: store.resources.filter((r) => r.verified).length,
      verified_incidents: store.incidents.filter((i) => ["verified", "response_assigned", "resolved"].includes(i.status)).length,
      active_alerts: store.alerts.filter((a) => isAlertActive(a)).length,
      data_note: "Counts reflect records stored in this backend session only.",
    });
  }

  if (route === "reports/analytics" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const visibleIncidents =
      u.role === "admin"
        ? store.incidents
        : store.incidents.filter(
            (i) => i.user_id === u.id || ["verified", "response_assigned", "resolved"].includes(i.status)
          );
    const visibleAssessments =
      u.role === "admin" ? store.assessments : store.assessments.filter((a) => a.user_id === u.id);
    return NextResponse.json(
      computeAnalytics({
        incidents: visibleIncidents,
        resources: store.resources,
        assessments: visibleAssessments,
        alerts: u.role === "admin" ? store.alerts : store.alerts.filter((a) => isAlertActive(a)),
      })
    );
  }

  if (route === "reports/incidents/csv" && method === "GET") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const dMap = new Map(store.districts.map((d) => [d.id, d.name]));
    const csv = buildCsv(
      ["Code", "Type", "Severity", "Status", "District", "Latitude", "Longitude", "People Affected", "Assigned Team", "Created At"],
      store.incidents.map((i) => [
        i.code,
        i.type,
        i.severity,
        i.status,
        i.district_id ? dMap.get(i.district_id) ?? "" : "",
        i.latitude,
        i.longitude,
        i.people_affected ?? "",
        i.assigned_team ?? "",
        i.created_at,
      ])
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="incidents-report.csv"',
      },
    });
  }

  if (route === "reports/simulations/csv" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const rows = u.role === "admin" ? store.simulations : store.simulations.filter((s) => s.user_id === u.id);
    const dMap = new Map(store.districts.map((d) => [d.id, d.name]));
    const csv = buildCsv(
      ["ID", "District", "Intensity (mm/h)", "Duration (h)", "Total Rainfall (mm)", "Score", "Category", "Status", "Created At"],
      rows.map((s) => [
        s.id,
        dMap.get(s.district_id) ?? `District ${s.district_id}`,
        s.params.rainfall_intensity_mm_h ?? "",
        s.params.duration_h ?? "",
        s.results?.total_rainfall_mm ?? "",
        s.results?.risk_indicators.score ?? "",
        s.results?.risk_indicators.category ?? "",
        s.status,
        s.created_at,
      ])
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="simulations-report.csv"',
      },
    });
  }

  if (route === "reports/risk" && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const rows = u.role === "admin" ? store.assessments : store.assessments.filter((a) => a.user_id === u.id);
    const by_category: Record<string, number> = {};
    for (const r of rows) by_category[r.category] = (by_category[r.category] ?? 0) + 1;
    return NextResponse.json({
      total: rows.length,
      by_category,
      disclaimer: "Prototype heuristic scores. Not verified flood predictions.",
    });
  }

  if (segs[0] === "reports" && segs[1] === "simulations" && segs[3] === "pdf" && segs.length === 4 && method === "GET") {
    const u = getUser(req, store);
    if (u instanceof NextResponse) return u;
    const s = store.simulations.find((x) => x.id === Number(segs[2]));
    if (!s || (u.role !== "admin" && s.user_id !== u.id)) return err(404, "Simulation not found");
    const d = store.districts.find((x) => x.id === s.district_id);
    const res = s.results;
    const ind = res?.risk_indicators;
    const lines = [
      `CrisisTwin AI - Simulation report #${s.id}`,
      `District: ${d?.name ?? `District ${s.district_id}`}`,
      `Status: ${s.status}`,
      `Rainfall: ${s.params.rainfall_intensity_mm_h} mm/h for ${s.params.duration_h} h`,
      `Total rainfall: ${res?.total_rainfall_mm ?? "N/A"} mm`,
      `Indicator category: ${ind?.category ?? "N/A"} (score ${ind?.score ?? "N/A"})`,
      `Data coverage: ${ind?.coverage ?? "N/A"}`,
      "",
      "Assumptions:",
      ...(res?.assumptions ?? []).map((a) => `- ${a}`),
      "",
      "Limitations:",
      ...(res?.limitations ?? []).map((l) => `- ${l}`),
      "",
      "Hypothetical scenario output. Not a verified prediction.",
    ];
    const pdf = buildSimulationPdf(lines);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="simulation-${s.id}.pdf"`,
      },
    });
  }

  // ---- ADMIN ----
  if (route === "admin/users" && method === "GET") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    return NextResponse.json(store.users.map(userOut));
  }

  if (segs[0] === "admin" && segs[1] === "users" && segs.length === 4 && segs[3] === "reset-code" && method === "POST") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const target = store.users.find((x) => x.id === Number(segs[2]) && x.is_active);
    if (!target) return err(404, "Active user not found");
    const code = generateOpaqueToken(8).toUpperCase();
    target.reset_token_hash = hashOpaqueToken(code);
    target.reset_expires_at = Date.now() + 15 * 60_000;
    addAudit(store, admin.id, "issue_reset_code", "user", target.id);
    return NextResponse.json({ code, expires_in_minutes: 15, email: target.email });
  }

  if (segs[0] === "admin" && segs[1] === "users" && segs.length === 3 && method === "PATCH") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const u = store.users.find((x) => x.id === Number(segs[2]));
    if (!u) return err(404, "User not found");
    if (u.id === admin.id) return err(400, "Administrators cannot change their own role or status");
    const body = await readJson<{ role?: "user" | "admin"; is_active?: boolean }>(req);
    if (body instanceof NextResponse) return body;
    if (body.role === "user" || body.role === "admin") u.role = body.role;
    if (typeof body.is_active === "boolean") u.is_active = body.is_active;
    addAudit(store, admin.id, "update", "user", u.id, body);
    return NextResponse.json(userOut(u));
  }

  if (route === "admin/audit-logs" && method === "GET") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "100"), 500);
    return NextResponse.json(store.auditLogs.slice(0, limit));
  }

  if (route === "admin/ai/logs" && method === "GET") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "150"), 500);
    const logs = store.aiLogs.slice(0, limit);
    const okCount = store.aiLogs.filter((l) => l.status === "ok").length;
    const avgLatencyMs = store.aiLogs.length
      ? Math.round(store.aiLogs.reduce((sum, l) => sum + l.latency_ms, 0) / store.aiLogs.length)
      : 0;
    return NextResponse.json({
      logs,
      summary: {
        total: store.aiLogs.length,
        ok: okCount,
        errors: store.aiLogs.length - okCount,
        avg_latency_ms: avgLatencyMs,
      },
    });
  }

  if (route === "admin/ai/config") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    if (method === "GET") {
      return NextResponse.json({
        ...store.aiConfig,
        provider_active: resolveProvider(store.aiConfig),
      });
    }
    if (method === "PATCH") {
      const body = await readJson<{
        enabled?: boolean;
        provider_preference?: "auto" | "groq" | "gemini";
        model?: string;
        rate_limit_per_minute?: number;
      }>(req);
      if (body instanceof NextResponse) return body;
      if (typeof body.enabled === "boolean") store.aiConfig.enabled = body.enabled;
      if (body.provider_preference && ["auto", "groq", "gemini"].includes(body.provider_preference)) {
        store.aiConfig.provider_preference = body.provider_preference;
      }
      if (typeof body.model === "string" && body.model.trim().length >= 2) {
        store.aiConfig.model = body.model.trim().slice(0, 80);
      }
      if (typeof body.rate_limit_per_minute === "number" && body.rate_limit_per_minute >= 1 && body.rate_limit_per_minute <= 120) {
        store.aiConfig.rate_limit_per_minute = Math.round(body.rate_limit_per_minute);
      }
      store.aiConfig.provider_active = resolveProvider(store.aiConfig);
      store.settings.ai_provider_configured = Boolean(store.aiConfig.provider_active);
      addAudit(store, admin.id, "update", "ai_config", null, body);
      return NextResponse.json(store.aiConfig);
    }
  }

  if (route === "admin/settings") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    if (method === "GET") {
      return NextResponse.json({
        ...store.settings,
        ai_provider_configured: Boolean(resolveProvider(store.aiConfig)),
      });
    }
    if (method === "PATCH") {
      const body = await readJson<{
        platform_name?: string;
        tagline?: string;
        support_email?: string;
        emergency_primary_number?: string;
        default_alert_notifications?: boolean;
        allow_public_registration?: boolean;
      }>(req);
      if (body instanceof NextResponse) return body;
      if (typeof body.platform_name === "string" && body.platform_name.trim().length >= 2) {
        store.settings.platform_name = body.platform_name.trim().slice(0, 80);
      }
      if (typeof body.tagline === "string") store.settings.tagline = body.tagline.trim().slice(0, 140);
      if (typeof body.support_email === "string") store.settings.support_email = body.support_email.trim().slice(0, 120);
      if (typeof body.emergency_primary_number === "string" && body.emergency_primary_number.trim()) {
        store.settings.emergency_primary_number = body.emergency_primary_number.trim().slice(0, 30);
      }
      if (typeof body.default_alert_notifications === "boolean") {
        store.settings.default_alert_notifications = body.default_alert_notifications;
      }
      if (typeof body.allow_public_registration === "boolean") {
        store.settings.allow_public_registration = body.allow_public_registration;
      }
      store.settings.updated_at = new Date().toISOString();
      addAudit(store, admin.id, "update", "settings", null, body);
      return NextResponse.json(store.settings);
    }
  }

  if (route === "admin/stats" && method === "GET") {
    const admin = requireAdmin(req, store);
    if (admin instanceof NextResponse) return admin;
    const assessments_by_category: Record<string, number> = {};
    for (const a of store.assessments) assessments_by_category[a.category] = (assessments_by_category[a.category] ?? 0) + 1;
    const resources_by_type: Record<string, number> = {};
    for (const r of store.resources) resources_by_type[r.type] = (resources_by_type[r.type] ?? 0) + 1;
    return NextResponse.json({
      users: store.users.length,
      active_users: store.users.filter((u) => u.is_active).length,
      admins: store.users.filter((u) => u.role === "admin").length,
      districts: store.districts.length,
      districts_verified: store.districts.filter((d) => d.verified).length,
      districts_with_boundary: store.boundaries.size,
      resources: store.resources.length,
      resources_verified: store.resources.filter((r) => r.verified).length,
      resources_by_type,
      datasets: store.datasets.length,
      datasets_verified: store.datasets.filter((d) => d.verified).length,
      assessments: store.assessments.length,
      assessments_by_category,
      simulations: store.simulations.length,
      simulations_failed: store.simulations.filter((s) => s.status === "failed").length,
      incidents_total: store.incidents.length,
      incidents_pending: store.incidents.filter((i) => i.status === "pending" || i.status === "under_review").length,
      incidents_verified: store.incidents.filter((i) => ["verified", "response_assigned", "resolved"].includes(i.status)).length,
      alerts_active: store.alerts.filter((a) => isAlertActive(a)).length,
      ai_requests_total: store.aiLogs.length,
      ai_errors_total: store.aiLogs.filter((l) => l.status === "error").length,
    });
  }

  return err(404, "Not found");
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
