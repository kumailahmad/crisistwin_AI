import { Pool } from "pg";
import type { Store, StoredIncident, StoredUser } from "./store";

export type PersistenceMode = "supabase-postgres" | "postgres" | "supabase-rest" | "file-backed-tmp";

export interface DbStatus {
  mode: PersistenceMode;
  connected: boolean;
  provider_label: string;
  error: string | null;
}

const g = globalThis as unknown as {
  __ctPgPool?: Pool | null;
  __ctPgPoolKey?: string;
  __ctDbStatus?: DbStatus;
};

/** Strip userinfo (username/password) from any URL or error message before logging or returning to UI. */
export function redactDbError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw || "Database connection failed");
  return msg
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://***@")
    .replace(/https?:\/\/[^@\s]+@/gi, "https://***@")
    .slice(0, 240);
}

export function normalizeDatabaseUrl(rawUrl: string | undefined): {
  url: string | null;
  invalidReason: string | null;
} {
  if (!rawUrl) return { url: null, invalidReason: null };
  let s = rawUrl.trim();
  if (!s) return { url: null, invalidReason: null };

  // Strip surrounding quotes if pasted as "postgresql://..."
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Strip accidental KEY= prefix if pasted from .env (e.g. DATABASE_URL=postgresql://...)
  if (/^[A-Z0-9_]+\s*=\s*/i.test(s) && !/^postgres(?:ql)?(?:\+[a-z0-9_]+)?:/i.test(s) && !/^https?:/i.test(s)) {
    s = s.replace(/^[A-Z0-9_]+\s*=\s*/i, "").trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
  }
  if (!s) return { url: null, invalidReason: null };

  // Convert SQLAlchemy-style dialect prefix (e.g. postgresql+psycopg://) to standard postgresql://
  s = s.replace(/^postgres(?:ql)?\+[a-z0-9_]+:\/\//i, "postgresql://");

  // Detect HTTP/HTTPS Supabase project URL pasted into DATABASE_URL by mistake
  if (/^https?:\/\//i.test(s)) {
    return {
      url: null,
      invalidReason:
        "DATABASE_URL is an HTTPS web URL instead of a PostgreSQL connection string. Copy the Postgres Connection string (postgresql://...) from Supabase Project Settings -> Database -> Transaction pooler (port 6543).",
    };
  }

  // Prepend postgresql:// if scheme was omitted (e.g. postgres.ref:pass@host:6543/postgres)
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && s.includes("@")) {
    s = `postgresql://${s}`;
  }

  // Safely percent-encode raw special chars (#, ?, /, @) inside password if unencoded
  const schemeMatch = /^(postgres(?:ql)?:\/\/)(.+)$/i.exec(s);
  if (schemeMatch) {
    const scheme = schemeMatch[1];
    const rest = schemeMatch[2];
    const atIdx = rest.lastIndexOf("@");
    if (atIdx > 0) {
      const userInfo = rest.slice(0, atIdx);
      const hostAndPath = rest.slice(atIdx + 1);
      const colonIdx = userInfo.indexOf(":");
      if (colonIdx > 0) {
        const user = userInfo.slice(0, colonIdx);
        const pass = userInfo.slice(colonIdx + 1);
        // Only encode if password contains unescaped reserved URL chars that break new URL()
        if (/[#@?/\s[\]]/.test(pass)) {
          const encodedPass = encodeURIComponent(pass);
          s = `${scheme}${user}:${encodedPass}@${hostAndPath}`;
        }
      }
    }
  }

  try {
    const parsed = new URL(s);
    if (!parsed.hostname || parsed.hostname === "base") {
      return {
        url: null,
        invalidReason: "DATABASE_URL does not include a valid database hostname.",
      };
    }
    return { url: s, invalidReason: null };
  } catch {
    return {
      url: null,
      invalidReason: "DATABASE_URL format is invalid. Use postgresql://user:password@host:6543/postgres",
    };
  }
}

export function classifyDatabaseUrl(rawUrl: string | undefined): {
  configured: boolean;
  mode: PersistenceMode;
  useSsl: boolean;
  invalidReason: string | null;
} {
  const { url: normalized, invalidReason } = normalizeDatabaseUrl(rawUrl);
  if (!normalized) {
    return { configured: false, mode: "file-backed-tmp", useSsl: false, invalidReason };
  }
  const lower = normalized.toLowerCase();
  const isSupabase = lower.includes("supabase.co") || lower.includes("supabase.com");
  const isLocal =
    lower.includes("@localhost") ||
    lower.includes("@127.0.0.1") ||
    lower.includes("@postgres:") ||
    lower.includes("sslmode=disable");
  return {
    configured: true,
    mode: isSupabase ? "supabase-postgres" : "postgres",
    useSsl: !isLocal,
    invalidReason: null,
  };
}

export function validateHttpsExternalUrl(raw: string | undefined): URL | null {
  const val = raw?.trim();
  if (!val) return null;
  try {
    const parsed = new URL(val);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "169.254.169.254" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".local")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getDbStatus(): DbStatus {
  if (g.__ctDbStatus) return g.__ctDbStatus;
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.configured) {
    return {
      mode: info.mode,
      connected: false,
      provider_label: info.mode === "supabase-postgres" ? "Supabase PostgreSQL" : "PostgreSQL",
      error: null,
    };
  }
  const supaUrl = validateHttpsExternalUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (supaUrl && supaKey) {
    return {
      mode: "supabase-rest",
      connected: false,
      provider_label: "Supabase REST API",
      error: null,
    };
  }
  return {
    mode: "file-backed-tmp",
    connected: false,
    provider_label: "Temporary local file (/tmp)",
    error: info.invalidReason,
  };
}

function getPool(): Pool | null {
  const { url: dbUrl } = normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (!dbUrl) return null;
  if (g.__ctPgPool && g.__ctPgPoolKey === dbUrl) return g.__ctPgPool;

  const { useSsl } = classifyDatabaseUrl(dbUrl);
  const pool = new Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  pool.on("error", (err) => {
    g.__ctDbStatus = {
      ...getDbStatus(),
      connected: false,
      error: redactDbError(err),
    };
  });
  g.__ctPgPool = pool;
  g.__ctPgPoolKey = dbUrl;
  return pool;
}

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ct_app_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ct_users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT,
      role TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone TEXT,
      district_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ct_incidents (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      district_id INTEGER,
      district_name TEXT,
      reporter_type TEXT,
      contact_phone TEXT,
      user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ct_alerts (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      hazard_type TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      published_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS ct_notifications (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ct_audit_logs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
}

export type SerializedStorePayload = Omit<Store, "boundaries" | "incidents"> & {
  boundaries: [number, { district_id: number; geometry: GeoJSON.Geometry; crs: string; source: string }][];
  incidents: (Omit<StoredIncident, "media_blobs"> & {
    media_blobs: (Omit<StoredIncident["media_blobs"][number], "data"> & { data_b64: string })[];
  })[];
};

export function serializeStoreForDb(store: Store): SerializedStorePayload {
  return {
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
}

export function hydrateStoreFromDbPayload(raw: SerializedStorePayload): Store | null {
  if (!raw || !Array.isArray(raw.users) || !Array.isArray(raw.districts) || !raw.nextId) return null;
  return {
    ...raw,
    boundaries: new Map(raw.boundaries ?? []),
    incidents: (raw.incidents ?? []).map((inc) => ({
      ...inc,
      media_blobs: (inc.media_blobs ?? []).map(({ data_b64, ...rest }) => ({
        ...rest,
        data: Buffer.from(data_b64 || "", "base64"),
      })),
    })),
  };
}

export async function initAndLoadPostgresStore(): Promise<{ store: Store | null; status: DbStatus }> {
  const pool = getPool();
  if (!pool) {
    // Try optional Supabase REST API if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided without DATABASE_URL
    const restRes = await loadViaSupabaseRest();
    if (!restRes.status.connected && restRes.status.mode === "file-backed-tmp") {
      const { invalidReason } = classifyDatabaseUrl(process.env.DATABASE_URL);
      if (invalidReason) restRes.status.error = invalidReason;
    }
    g.__ctDbStatus = restRes.status;
    return restRes;
  }

  const { mode } = classifyDatabaseUrl(process.env.DATABASE_URL);
  const label = mode === "supabase-postgres" ? "Supabase PostgreSQL" : "PostgreSQL";
  try {
    await ensureSchema(pool);
    const res = await pool.query<{ payload: SerializedStorePayload }>(
      "SELECT payload FROM ct_app_state WHERE id = $1 LIMIT 1",
      ["primary"]
    );
    const status: DbStatus = {
      mode,
      connected: true,
      provider_label: label,
      error: null,
    };
    g.__ctDbStatus = status;
    const loaded = res.rows[0]?.payload ? hydrateStoreFromDbPayload(res.rows[0].payload) : null;
    return { store: loaded, status };
  } catch (err) {
    const status: DbStatus = {
      mode,
      connected: false,
      provider_label: label,
      error: redactDbError(err),
    };
    g.__ctDbStatus = status;
    return { store: null, status };
  }
}

export async function saveStoreToDatabase(store: Store): Promise<DbStatus> {
  const pool = getPool();
  if (!pool) {
    const restStatus = await saveViaSupabaseRest(store);
    if (!restStatus.connected && restStatus.mode === "file-backed-tmp") {
      const { invalidReason } = classifyDatabaseUrl(process.env.DATABASE_URL);
      if (invalidReason) restStatus.error = invalidReason;
    }
    g.__ctDbStatus = restStatus;
    return restStatus;
  }

  const { mode } = classifyDatabaseUrl(process.env.DATABASE_URL);
  const label = mode === "supabase-postgres" ? "Supabase PostgreSQL" : "PostgreSQL";
  const client = await pool.connect().catch((err) => {
    const status: DbStatus = {
      mode,
      connected: false,
      provider_label: label,
      error: redactDbError(err),
    };
    g.__ctDbStatus = status;
    return null;
  });

  if (!client) return g.__ctDbStatus!;

  try {
    await client.query("BEGIN");
    const serialized = serializeStoreForDb(store);
    await client.query(
      `INSERT INTO ct_app_state (id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      ["primary", JSON.stringify(serialized)]
    );

    // Sync queryable relational tables so records appear directly in Supabase Table Editor
    await syncUsersTable(client, store.users);
    await syncIncidentsTable(client, store.incidents);
    await syncAlertsTable(client, store.alerts);
    await syncNotificationsTable(client, store.notifications);
    await syncAuditLogsTable(client, store.auditLogs);

    await client.query("COMMIT");
    const status: DbStatus = {
      mode,
      connected: true,
      provider_label: label,
      error: null,
    };
    g.__ctDbStatus = status;
    return status;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const status: DbStatus = {
      mode,
      connected: false,
      provider_label: label,
      error: redactDbError(err),
    };
    g.__ctDbStatus = status;
    return status;
  } finally {
    client.release();
  }
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

async function syncUsersTable(client: Queryable, users: StoredUser[]) {
  const ids = users.map((u) => u.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM ct_users");
    return;
  }
  await client.query("DELETE FROM ct_users WHERE NOT (id = ANY($1::int[]))", [ids]);
  for (const u of users) {
    await client.query(
      `INSERT INTO ct_users (id, email, full_name, role, is_active, email_verified, phone, district_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         email_verified = EXCLUDED.email_verified,
         phone = EXCLUDED.phone,
         district_id = EXCLUDED.district_id`,
      [
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        u.email_verified,
        u.phone,
        u.district_id,
        u.created_at,
      ]
    );
  }
}

async function syncIncidentsTable(client: Queryable, incidents: StoredIncident[]) {
  const ids = incidents.map((i) => i.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM ct_incidents");
    return;
  }
  await client.query("DELETE FROM ct_incidents WHERE NOT (id = ANY($1::int[]))", [ids]);
  for (const i of incidents) {
    await client.query(
      `INSERT INTO ct_incidents (id, code, type, severity, status, description, latitude, longitude, district_id, district_name, reporter_type, contact_phone, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         severity = EXCLUDED.severity,
         description = EXCLUDED.description,
         district_id = EXCLUDED.district_id,
         district_name = EXCLUDED.district_name`,
      [
        i.id,
        i.code,
        i.type,
        i.severity,
        i.status,
        i.description,
        i.latitude,
        i.longitude,
        i.district_id,
        i.district_name,
        i.reporter_type ?? "guest",
        i.contact_phone,
        i.user_id,
        i.created_at,
      ]
    );
  }
}

async function syncAlertsTable(client: Queryable, alerts: Store["alerts"]) {
  const ids = alerts.map((a) => a.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM ct_alerts");
    return;
  }
  await client.query("DELETE FROM ct_alerts WHERE NOT (id = ANY($1::int[]))", [ids]);
  for (const a of alerts) {
    await client.query(
      `INSERT INTO ct_alerts (id, title, severity, hazard_type, status, source, created_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         severity = EXCLUDED.severity,
         status = EXCLUDED.status,
         published_at = EXCLUDED.published_at`,
      [a.id, a.title, a.severity, a.hazard_type, a.status, a.source, a.created_at, a.published_at]
    );
  }
}

async function syncNotificationsTable(client: Queryable, notifications: Store["notifications"]) {
  const recent = notifications.slice(0, 500);
  const ids = recent.map((n) => n.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM ct_notifications");
    return;
  }
  await client.query("DELETE FROM ct_notifications WHERE NOT (id = ANY($1::int[]))", [ids]);
  for (const n of recent) {
    await client.query(
      `INSERT INTO ct_notifications (id, user_id, kind, title, body, link, read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         read = EXCLUDED.read`,
      [n.id, n.user_id, n.kind, n.title, n.body, n.link, n.read, n.created_at]
    );
  }
}

async function syncAuditLogsTable(client: Queryable, logs: Store["auditLogs"]) {
  const recent = logs.slice(0, 250);
  const ids = recent.map((l) => l.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM ct_audit_logs");
    return;
  }
  await client.query("DELETE FROM ct_audit_logs WHERE NOT (id = ANY($1::int[]))", [ids]);
  for (const l of recent) {
    await client.query(
      `INSERT INTO ct_audit_logs (id, user_id, action, entity, entity_id, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [l.id, l.user_id, l.action, l.entity, l.entity_id, l.detail ? JSON.stringify(l.detail) : null, l.created_at]
    );
  }
}

async function loadViaSupabaseRest(): Promise<{ store: Store | null; status: DbStatus }> {
  const supaUrl = validateHttpsExternalUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supaUrl || !supaKey) {
    return {
      store: null,
      status: {
        mode: "file-backed-tmp",
        connected: false,
        provider_label: "Temporary local file (/tmp)",
        error: null,
      },
    };
  }
  try {
    const endpoint = new URL("/rest/v1/ct_app_state?id=eq.primary&select=payload", supaUrl);
    const res = await fetch(endpoint.toString(), {
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        store: null,
        status: {
          mode: "supabase-rest",
          connected: false,
          provider_label: "Supabase REST API",
          error:
            res.status === 404
              ? "Supabase URL reached, but table ct_app_state does not exist yet. Set DATABASE_URL (Transaction Pooler) for automatic table setup."
              : `Supabase REST returned HTTP ${res.status}`,
        },
      };
    }
    const rows = (await res.json()) as { payload?: SerializedStorePayload }[];
    const loaded = rows[0]?.payload ? hydrateStoreFromDbPayload(rows[0].payload) : null;
    return {
      store: loaded,
      status: {
        mode: "supabase-rest",
        connected: true,
        provider_label: "Supabase REST API",
        error: null,
      },
    };
  } catch (err) {
    return {
      store: null,
      status: {
        mode: "supabase-rest",
        connected: false,
        provider_label: "Supabase REST API",
        error: redactDbError(err),
      },
    };
  }
}

async function saveViaSupabaseRest(store: Store): Promise<DbStatus> {
  const supaUrl = validateHttpsExternalUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supaUrl || !supaKey) {
    return {
      mode: "file-backed-tmp",
      connected: false,
      provider_label: "Temporary local file (/tmp)",
      error: null,
    };
  }
  try {
    const endpoint = new URL("/rest/v1/ct_app_state", supaUrl);
    const res = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        id: "primary",
        payload: serializeStoreForDb(store),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      return {
        mode: "supabase-rest",
        connected: false,
        provider_label: "Supabase REST API",
        error:
          res.status === 404
            ? "Table ct_app_state not found in Supabase. Add DATABASE_URL (Transaction Pooler) for automatic setup."
            : `Supabase REST returned HTTP ${res.status}`,
      };
    }
    return {
      mode: "supabase-rest",
      connected: true,
      provider_label: "Supabase REST API",
      error: null,
    };
  } catch (err) {
    return {
      mode: "supabase-rest",
      connected: false,
      provider_label: "Supabase REST API",
      error: redactDbError(err),
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Optional server-side notification delivery (Resend email and/or HTTPS webhook) when configured via Secrets. */
export async function sendAdminAccountAlert(event: {
  eventType: "user_registered" | "incident_submitted";
  title: string;
  summary: string;
  fields: Record<string, string | number | null | undefined>;
  fallbackSupportEmail?: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const recipient = (
    process.env.ADMIN_NOTIFY_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    event.fallbackSupportEmail?.trim() ||
    ""
  ).toLowerCase();

  if (resendKey && /^\S+@\S+\.\S+$/.test(recipient)) {
    try {
      const fromAddr = process.env.RESEND_FROM_EMAIL?.trim() || "CrisisTwin AI <onboarding@resend.dev>";
      const rows = Object.entries(event.fields)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`)
        .join("");
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [recipient],
          subject: `[CrisisTwin AI] ${event.title}`,
          html: `<div style="font-family:sans-serif;max-width:560px"><h2>${escapeHtml(event.title)}</h2><p>${escapeHtml(event.summary)}</p><ul>${rows}</ul></div>`,
        }),
      });
    } catch {
      /* do not block user actions on outbound notification errors */
    }
  }

  const webhookUrl = validateHttpsExternalUrl(process.env.ADMIN_WEBHOOK_URL);
  if (webhookUrl) {
    try {
      await fetch(webhookUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: event.eventType,
          title: event.title,
          summary: event.summary,
          fields: event.fields,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      /* ignore transient webhook errors */
    }
  }
}
