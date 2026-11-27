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
      department_id INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone TEXT,
      district_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL
    );
    ALTER TABLE ct_users ADD COLUMN IF NOT EXISTS department_id INTEGER;

    CREATE TABLE IF NOT EXISTS ct_incidents (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      workflow_status TEXT,
      assigned_department_id INTEGER,
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
    ALTER TABLE ct_incidents ADD COLUMN IF NOT EXISTS workflow_status TEXT;
    ALTER TABLE ct_incidents ADD COLUMN IF NOT EXISTS assigned_department_id INTEGER;

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

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      department_type TEXT NOT NULL,
      supported_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      primary_contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      notification_channel TEXT NOT NULL DEFAULT 'email',
      webhook_url TEXT,
      backup_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      priority_weight INTEGER NOT NULL DEFAULT 10,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS department_districts (
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      district_id INTEGER NOT NULL,
      PRIMARY KEY (department_id, district_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dept_districts_dist ON department_districts(district_id);

    CREATE TABLE IF NOT EXISTS department_contacts (
      id INTEGER PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role_title TEXT,
      email TEXT,
      phone TEXT,
      channel_preference TEXT NOT NULL DEFAULT 'email',
      is_primary BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS idx_dept_contacts_dept ON department_contacts(department_id);

    CREATE TABLE IF NOT EXISTS routing_rules (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
      priority_order INTEGER NOT NULL DEFAULT 10,
      incident_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      district_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      severities JSONB NOT NULL DEFAULT '[]'::jsonb,
      min_people_affected INTEGER,
      require_photos BOOLEAN NOT NULL DEFAULT FALSE,
      keywords TEXT,
      target_department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      backup_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      set_priority TEXT,
      send_notification BOOLEAN NOT NULL DEFAULT TRUE,
      escalation_minutes INTEGER,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_routing_rules_order ON routing_rules(enabled, priority_order);

    CREATE TABLE IF NOT EXISTS incident_assignments (
      id INTEGER PRIMARY KEY,
      incident_id INTEGER NOT NULL REFERENCES ct_incidents(id) ON DELETE CASCADE,
      incident_code TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      backup_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      routing_rule_id INTEGER REFERENCES routing_rules(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      assigned_personnel TEXT,
      escalation_minutes INTEGER,
      escalated BOOLEAN NOT NULL DEFAULT FALSE,
      escalation_level INTEGER NOT NULL DEFAULT 0,
      last_escalated_at TIMESTAMPTZ,
      assigned_at TIMESTAMPTZ NOT NULL,
      notified_at TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assignments_inc ON incident_assignments(incident_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_dept ON incident_assignments(department_id, status);

    CREATE TABLE IF NOT EXISTS department_responses (
      id INTEGER PRIMARY KEY,
      assignment_id INTEGER NOT NULL REFERENCES incident_assignments(id) ON DELETE CASCADE,
      incident_id INTEGER NOT NULL REFERENCES ct_incidents(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      status_after TEXT NOT NULL,
      assigned_personnel TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dept_responses_assign ON department_responses(assignment_id);

    CREATE TABLE IF NOT EXISTS notification_integrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      channel TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      connection_status TEXT NOT NULL DEFAULT 'unverified',
      last_verified_at TIMESTAMPTZ,
      last_error TEXT,
      endpoint_url TEXT,
      sender_identity TEXT,
      default_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      event_triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
      department_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      encrypted_api_key TEXT,
      encrypted_auth_token TEXT,
      account_sid TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY,
      incident_id INTEGER REFERENCES ct_incidents(id) ON DELETE SET NULL,
      incident_code TEXT,
      assignment_id INTEGER REFERENCES incident_assignments(id) ON DELETE SET NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      integration_id INTEGER REFERENCES notification_integrations(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      dedupe_key TEXT NOT NULL,
      provider_response TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_logs_dedupe ON notification_logs(dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_notif_logs_status ON notification_logs(status, created_at);

    CREATE TABLE IF NOT EXISTS agent_configurations (
      id INTEGER PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      auto_assign BOOLEAN NOT NULL DEFAULT TRUE,
      require_human_verification BOOLEAN NOT NULL DEFAULT FALSE,
      analyze_images_with_vision BOOLEAN NOT NULL DEFAULT TRUE,
      classification_model TEXT NOT NULL,
      vision_model TEXT NOT NULL,
      confidence_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.55,
      max_notification_retries INTEGER NOT NULL DEFAULT 2,
      notify_admin_on_unassigned BOOLEAN NOT NULL DEFAULT TRUE,
      notify_admin_on_ai_failure BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escalation_rules (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      severity TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
      timeout_minutes INTEGER NOT NULL DEFAULT 15,
      notify_admins BOOLEAN NOT NULL DEFAULT TRUE,
      notify_backup_department BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escalation_logs (
      id INTEGER PRIMARY KEY,
      rule_id INTEGER REFERENCES escalation_rules(id) ON DELETE SET NULL,
      assignment_id INTEGER NOT NULL REFERENCES incident_assignments(id) ON DELETE CASCADE,
      incident_id INTEGER NOT NULL REFERENCES ct_incidents(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      backup_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_execution_logs (
      id INTEGER PRIMARY KEY,
      incident_id INTEGER NOT NULL REFERENCES ct_incidents(id) ON DELETE CASCADE,
      incident_code TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      recommended_category TEXT,
      recommended_severity TEXT,
      confidence DOUBLE PRECISION,
      image_summary TEXT,
      matched_rule_id INTEGER REFERENCES routing_rules(id) ON DELETE SET NULL,
      assigned_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_exec_idem ON agent_execution_logs(idempotency_key);

    ALTER TABLE ct_app_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ct_users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ct_incidents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ct_alerts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ct_notifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ct_audit_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE department_districts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE department_contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE incident_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE department_responses ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notification_integrations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_configurations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE escalation_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;
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

    // Sync queryable relational tables in FK-safe order so records & RLS stay updated in Supabase
    await syncUsersTable(client, store.users);
    await syncDepartmentsTables(client, store.departments);
    await syncIncidentsTable(client, store.incidents);
    await syncRoutingRulesTable(client, store.routingRules);
    await syncAssignmentsAndResponsesTables(client, store.incidentAssignments, store.departmentResponses);
    await syncIntegrationsAndLogsTables(client, store.notificationIntegrations, store.notificationLogs);
    await syncAgentAndEscalationTables(
      client,
      store.agentConfig,
      store.escalationRules,
      store.escalationLogs,
      store.agentExecutionLogs
    );
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
      `INSERT INTO ct_users (id, email, full_name, role, department_id, is_active, email_verified, phone, district_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         department_id = EXCLUDED.department_id,
         is_active = EXCLUDED.is_active,
         email_verified = EXCLUDED.email_verified,
         phone = EXCLUDED.phone,
         district_id = EXCLUDED.district_id`,
      [
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.department_id ?? null,
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
      `INSERT INTO ct_incidents (id, code, type, severity, status, workflow_status, assigned_department_id, description, latitude, longitude, district_id, district_name, reporter_type, contact_phone, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         workflow_status = EXCLUDED.workflow_status,
         assigned_department_id = EXCLUDED.assigned_department_id,
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
        i.workflow_status ?? null,
        i.assigned_department_id ?? null,
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

async function syncDepartmentsTables(client: Queryable, departments: Store["departments"]) {
  const ids = departments.map((d) => d.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM department_contacts");
    await client.query("DELETE FROM department_districts");
    await client.query("DELETE FROM departments");
    return;
  }
  // Upsert departments first with NULL backup_department_id, then set backup_department_id to avoid FK ordering issues
  for (const d of departments) {
    await client.query(
      `INSERT INTO departments (id, name, description, department_type, supported_categories, primary_contact_name, contact_email, contact_phone, notification_channel, webhook_url, backup_department_id, priority_weight, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, NULL, $11, $12, $13::timestamptz, $14::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         department_type = EXCLUDED.department_type,
         supported_categories = EXCLUDED.supported_categories,
         primary_contact_name = EXCLUDED.primary_contact_name,
         contact_email = EXCLUDED.contact_email,
         contact_phone = EXCLUDED.contact_phone,
         notification_channel = EXCLUDED.notification_channel,
         webhook_url = EXCLUDED.webhook_url,
         priority_weight = EXCLUDED.priority_weight,
         is_active = EXCLUDED.is_active,
         updated_at = EXCLUDED.updated_at`,
      [
        d.id,
        d.name,
        d.description,
        d.department_type,
        JSON.stringify(d.supported_categories ?? []),
        d.primary_contact_name,
        d.contact_email,
        d.contact_phone,
        d.notification_channel,
        d.webhook_url,
        d.priority_weight,
        d.is_active,
        d.created_at,
        d.updated_at,
      ]
    );
  }
  for (const d of departments) {
    await client.query("UPDATE departments SET backup_department_id = $2 WHERE id = $1", [
      d.id,
      d.backup_department_id && ids.includes(d.backup_department_id) ? d.backup_department_id : null,
    ]);
  }

  await client.query("DELETE FROM department_districts");
  for (const d of departments) {
    for (const did of d.assigned_district_ids ?? []) {
      await client.query(
        "INSERT INTO department_districts (department_id, district_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [d.id, did]
      );
    }
  }

  await client.query("DELETE FROM department_contacts");
  for (const d of departments) {
    for (const c of d.contacts ?? []) {
      await client.query(
        `INSERT INTO department_contacts (id, department_id, name, role_title, email, phone, channel_preference, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [c.id, d.id, c.name, c.role_title, c.email, c.phone, c.channel_preference, c.is_primary]
      );
    }
  }
}

async function syncRoutingRulesTable(client: Queryable, rules: Store["routingRules"]) {
  const ids = rules.map((r) => r.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM routing_rules");
    return;
  }
  await client.query("DELETE FROM routing_rules WHERE NOT (id = ANY($1::int[]))", [ids]);
  for (const r of rules) {
    await client.query(
      `INSERT INTO routing_rules (id, name, description, enabled, is_fallback, priority_order, incident_categories, district_ids, severities, min_people_affected, require_photos, keywords, target_department_id, backup_department_id, set_priority, send_notification, escalation_minutes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18::timestamptz, $19::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         enabled = EXCLUDED.enabled,
         is_fallback = EXCLUDED.is_fallback,
         priority_order = EXCLUDED.priority_order,
         incident_categories = EXCLUDED.incident_categories,
         district_ids = EXCLUDED.district_ids,
         severities = EXCLUDED.severities,
         min_people_affected = EXCLUDED.min_people_affected,
         require_photos = EXCLUDED.require_photos,
         keywords = EXCLUDED.keywords,
         target_department_id = EXCLUDED.target_department_id,
         backup_department_id = EXCLUDED.backup_department_id,
         set_priority = EXCLUDED.set_priority,
         send_notification = EXCLUDED.send_notification,
         escalation_minutes = EXCLUDED.escalation_minutes,
         updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.name,
        r.description,
        r.enabled,
        r.is_fallback,
        r.priority_order,
        JSON.stringify(r.incident_categories ?? []),
        JSON.stringify(r.district_ids ?? []),
        JSON.stringify(r.severities ?? []),
        r.min_people_affected,
        r.require_photos,
        r.keywords,
        r.target_department_id,
        r.backup_department_id,
        r.set_priority,
        r.send_notification,
        r.escalation_minutes,
        r.created_at,
        r.updated_at,
      ]
    );
  }
}

async function syncAssignmentsAndResponsesTables(
  client: Queryable,
  assignments: Store["incidentAssignments"],
  responses: Store["departmentResponses"]
) {
  const ids = assignments.map((a) => a.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM department_responses");
    await client.query("DELETE FROM incident_assignments");
    return;
  }
  await client.query("DELETE FROM incident_assignments WHERE NOT (id = ANY($1::int[]))", [ids]);
  for (const a of assignments) {
    await client.query(
      `INSERT INTO incident_assignments (id, incident_id, incident_code, department_id, backup_department_id, routing_rule_id, status, priority, assigned_personnel, escalation_minutes, escalated, escalation_level, last_escalated_at, assigned_at, notified_at, acknowledged_at, resolved_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz, $14::timestamptz, $15::timestamptz, $16::timestamptz, $17::timestamptz, $18::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         department_id = EXCLUDED.department_id,
         status = EXCLUDED.status,
         priority = EXCLUDED.priority,
         assigned_personnel = EXCLUDED.assigned_personnel,
         escalated = EXCLUDED.escalated,
         escalation_level = EXCLUDED.escalation_level,
         last_escalated_at = EXCLUDED.last_escalated_at,
         notified_at = EXCLUDED.notified_at,
         acknowledged_at = EXCLUDED.acknowledged_at,
         resolved_at = EXCLUDED.resolved_at,
         updated_at = EXCLUDED.updated_at`,
      [
        a.id,
        a.incident_id,
        a.incident_code,
        a.department_id,
        a.backup_department_id,
        a.routing_rule_id,
        a.status,
        a.priority,
        a.assigned_personnel,
        a.escalation_minutes,
        a.escalated,
        a.escalation_level,
        a.last_escalated_at,
        a.assigned_at,
        a.notified_at,
        a.acknowledged_at,
        a.resolved_at,
        a.updated_at,
      ]
    );
  }

  const rIds = responses.map((r) => r.id);
  if (rIds.length === 0) {
    await client.query("DELETE FROM department_responses");
    return;
  }
  await client.query("DELETE FROM department_responses WHERE NOT (id = ANY($1::int[]))", [rIds]);
  for (const r of responses) {
    await client.query(
      `INSERT INTO department_responses (id, assignment_id, incident_id, department_id, user_id, user_name, action, status_after, assigned_personnel, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id,
        r.assignment_id,
        r.incident_id,
        r.department_id,
        r.user_id,
        r.user_name,
        r.action,
        r.status_after,
        r.assigned_personnel,
        r.note,
        r.created_at,
      ]
    );
  }
}

async function syncIntegrationsAndLogsTables(
  client: Queryable,
  integrations: Store["notificationIntegrations"],
  logs: Store["notificationLogs"]
) {
  const intIds = integrations.map((i) => i.id);
  if (intIds.length === 0) {
    await client.query("DELETE FROM notification_integrations");
  } else {
    await client.query("DELETE FROM notification_integrations WHERE NOT (id = ANY($1::int[]))", [intIds]);
    for (const i of integrations) {
      await client.query(
        `INSERT INTO notification_integrations (id, name, channel, provider_name, enabled, connection_status, last_verified_at, last_error, endpoint_url, sender_identity, default_recipients, event_triggers, department_ids, encrypted_api_key, encrypted_auth_token, account_sid, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17::timestamptz, $18::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           enabled = EXCLUDED.enabled,
           connection_status = EXCLUDED.connection_status,
           last_verified_at = EXCLUDED.last_verified_at,
           last_error = EXCLUDED.last_error,
           endpoint_url = EXCLUDED.endpoint_url,
           sender_identity = EXCLUDED.sender_identity,
           default_recipients = EXCLUDED.default_recipients,
           event_triggers = EXCLUDED.event_triggers,
           department_ids = EXCLUDED.department_ids,
           encrypted_api_key = EXCLUDED.encrypted_api_key,
           encrypted_auth_token = EXCLUDED.encrypted_auth_token,
           account_sid = EXCLUDED.account_sid,
           updated_at = EXCLUDED.updated_at`,
        [
          i.id,
          i.name,
          i.channel,
          i.provider_name,
          i.enabled,
          i.connection_status,
          i.last_verified_at,
          i.last_error,
          i.endpoint_url,
          i.sender_identity,
          JSON.stringify(i.default_recipients ?? []),
          JSON.stringify(i.event_triggers ?? []),
          JSON.stringify(i.department_ids ?? []),
          i.encrypted_api_key ?? null,
          i.encrypted_auth_token ?? null,
          i.account_sid ?? null,
          i.created_at,
          i.updated_at,
        ]
      );
    }
  }

  const recentLogs = logs.slice(0, 500);
  const logIds = recentLogs.map((l) => l.id);
  if (logIds.length === 0) {
    await client.query("DELETE FROM notification_logs");
  } else {
    await client.query("DELETE FROM notification_logs WHERE NOT (id = ANY($1::int[]))", [logIds]);
    for (const l of recentLogs) {
      await client.query(
        `INSERT INTO notification_logs (id, incident_id, incident_code, assignment_id, department_id, integration_id, channel, recipient, event_type, status, attempt_count, dedupe_key, provider_response, error_message, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz, $16::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           attempt_count = EXCLUDED.attempt_count,
           provider_response = EXCLUDED.provider_response,
           error_message = EXCLUDED.error_message,
           updated_at = EXCLUDED.updated_at`,
        [
          l.id,
          l.incident_id,
          l.incident_code,
          l.assignment_id,
          l.department_id,
          l.integration_id,
          l.channel,
          l.recipient,
          l.event_type,
          l.status,
          l.attempt_count,
          l.dedupe_key,
          l.provider_response,
          l.error_message,
          l.created_at,
          l.updated_at,
        ]
      );
    }
  }
}

async function syncAgentAndEscalationTables(
  client: Queryable,
  agentCfg: Store["agentConfig"],
  escRules: Store["escalationRules"],
  escLogs: Store["escalationLogs"],
  execLogs: Store["agentExecutionLogs"]
) {
  await client.query(
    `INSERT INTO agent_configurations (id, enabled, auto_assign, require_human_verification, analyze_images_with_vision, classification_model, vision_model, confidence_threshold, max_notification_retries, notify_admin_on_unassigned, notify_admin_on_ai_failure, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       auto_assign = EXCLUDED.auto_assign,
       require_human_verification = EXCLUDED.require_human_verification,
       analyze_images_with_vision = EXCLUDED.analyze_images_with_vision,
       classification_model = EXCLUDED.classification_model,
       vision_model = EXCLUDED.vision_model,
       confidence_threshold = EXCLUDED.confidence_threshold,
       max_notification_retries = EXCLUDED.max_notification_retries,
       notify_admin_on_unassigned = EXCLUDED.notify_admin_on_unassigned,
       notify_admin_on_ai_failure = EXCLUDED.notify_admin_on_ai_failure,
       updated_at = EXCLUDED.updated_at`,
    [
      agentCfg.id,
      agentCfg.enabled,
      agentCfg.auto_assign,
      agentCfg.require_human_verification,
      agentCfg.analyze_images_with_vision,
      agentCfg.classification_model,
      agentCfg.vision_model,
      agentCfg.confidence_threshold,
      agentCfg.max_notification_retries,
      agentCfg.notify_admin_on_unassigned,
      agentCfg.notify_admin_on_ai_failure,
      agentCfg.updated_at,
    ]
  );

  const erIds = escRules.map((r) => r.id);
  if (erIds.length === 0) {
    await client.query("DELETE FROM escalation_rules");
  } else {
    await client.query("DELETE FROM escalation_rules WHERE NOT (id = ANY($1::int[]))", [erIds]);
    for (const r of escRules) {
      await client.query(
        `INSERT INTO escalation_rules (id, name, enabled, severity, department_id, timeout_minutes, notify_admins, notify_backup_department, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           enabled = EXCLUDED.enabled,
           severity = EXCLUDED.severity,
           department_id = EXCLUDED.department_id,
           timeout_minutes = EXCLUDED.timeout_minutes,
           notify_admins = EXCLUDED.notify_admins,
           notify_backup_department = EXCLUDED.notify_backup_department,
           updated_at = EXCLUDED.updated_at`,
        [
          r.id,
          r.name,
          r.enabled,
          r.severity,
          r.department_id,
          r.timeout_minutes,
          r.notify_admins,
          r.notify_backup_department,
          r.created_at,
          r.updated_at,
        ]
      );
    }
  }

  const recentEscLogs = escLogs.slice(0, 300);
  const elIds = recentEscLogs.map((l) => l.id);
  if (elIds.length === 0) {
    await client.query("DELETE FROM escalation_logs");
  } else {
    await client.query("DELETE FROM escalation_logs WHERE NOT (id = ANY($1::int[]))", [elIds]);
    for (const l of recentEscLogs) {
      await client.query(
        `INSERT INTO escalation_logs (id, rule_id, assignment_id, incident_id, department_id, backup_department_id, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [l.id, l.rule_id, l.assignment_id, l.incident_id, l.department_id, l.backup_department_id, l.reason, l.created_at]
      );
    }
  }

  const recentExec = execLogs.slice(0, 300);
  const exIds = recentExec.map((l) => l.id);
  if (exIds.length === 0) {
    await client.query("DELETE FROM agent_execution_logs");
  } else {
    await client.query("DELETE FROM agent_execution_logs WHERE NOT (id = ANY($1::int[]))", [exIds]);
    for (const l of recentExec) {
      await client.query(
        `INSERT INTO agent_execution_logs (id, incident_id, incident_code, idempotency_key, status, provider, model, recommended_category, recommended_severity, confidence, image_summary, matched_rule_id, assigned_department_id, duration_ms, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [
          l.id,
          l.incident_id,
          l.incident_code,
          l.idempotency_key,
          l.status,
          l.provider,
          l.model,
          l.recommended_category,
          l.recommended_severity,
          l.confidence,
          l.image_summary,
          l.matched_rule_id,
          l.assigned_department_id,
          l.duration_ms,
          l.error_message,
          l.created_at,
        ]
      );
    }
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
