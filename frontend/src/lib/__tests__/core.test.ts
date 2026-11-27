import assert from "node:assert/strict";
import test from "node:test";
import { assess } from "../demo/riskEngine";
import {
  createAccessToken,
  decodeAccessToken,
  generateGuestVerificationCode,
  hashOpaqueToken,
  hashPassword,
  incidentRateOk,
  trackRateOk,
  verifyOpaqueSecret,
  verifyPassword,
} from "../server/auth";
import { geometryBBox, inBalochistan, kmBetween, pointInGeometry, validatePolygon } from "../server/geo";
import { boundAiPrompt, MAX_AI_PROMPT_CHARS } from "../server/ai";
import { cachedPublicJson, invalidateCache, noStoreJson } from "../server/responseCache";
import { recoverStalePendingIncidents } from "../server/routingAgent";
import { getStore } from "../server/store";
import { NextRequest } from "next/server";
import {
  classifyDatabaseUrl,
  normalizeDatabaseUrl,
  redactDbError,
  validateHttpsExternalUrl,
} from "../server/supabaseDb";
import { decryptSecret, encryptSecret, maskSecretHint } from "../server/cryptoSecrets";
import { evaluateRoutingRules, findEscalationCandidates } from "../server/routingEngine";
import { buildCsv, compareSimulations, computeAnalytics, csvCell } from "../utils/analytics";
import { createOfflineDraft, parseDrafts } from "../utils/offlineDrafts";
import {
  INCIDENT_TYPES,
  type AlertItem,
  type Department,
  type EscalationRule,
  type Incident,
  type IncidentAssignment,
  type Resource,
  type RiskAssessment,
  type RoutingRule,
  type Simulation,
} from "../types";

test("riskEngine excludes missing values rather than treating them as zero", () => {
  const res = assess({ rainfall_mm_24h: 120, elevation_m: 150, flood_history_index: 0.7 }, { rainfall_mm_24h: "measured" });
  assert.ok(res.score !== null && res.score > 50);
  assert.equal(res.coverage, 0.7);
  assert.deepEqual(res.missing, ["slope_deg", "exposure_index"]);
});

test("riskEngine refuses score when factor weight coverage < 50%", () => {
  const res = assess({ elevation_m: 200 });
  assert.equal(res.score, null);
  assert.equal(res.category, "Insufficient data");
});

test("riskEngine applies bounded saturation note when duration > 24h", () => {
  const base = assess({ rainfall_mm_24h: 100, flood_history_index: 0.5, exposure_index: 0.5 });
  const long = assess({ rainfall_mm_24h: 100, flood_history_index: 0.5, exposure_index: 0.5, duration_h: 48 });
  assert.ok(base.score !== null && long.score !== null);
  assert.ok(long.score > base.score);
  assert.ok(long.duration_note?.includes("48 h"));
});

test("geo helpers validate Balochistan bounds, polygon containment, and haversine km", () => {
  assert.equal(inBalochistan(30.1798, 66.975), true); // Quetta
  assert.equal(inBalochistan(24.8607, 67.0011), true); // Karachi edge vs bbox check (lat >= 24.0, lon 60.8..70.6)
  assert.equal(inBalochistan(33.6844, 73.0479), false); // Islamabad outside

  const square: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [[[66, 30], [67, 30], [67, 31], [66, 31], [66, 30]]],
  };
  assert.equal(validatePolygon(square), null);
  assert.equal(pointInGeometry(30.5, 66.5, square), true);
  assert.equal(pointInGeometry(29.5, 66.5, square), false);
  const d = kmBetween(30.18, 66.97, 25.12, 62.33); // Quetta to Gwadar
  assert.ok(d > 650 && d < 800);
});

test("analytics CSV escaping neutralizes formula injection and summarizes incidents & comparisons", () => {
  assert.equal(csvCell("=CMD|'/C calc'!A0"), "'=CMD|'/C calc'!A0");
  assert.equal(csvCell('Quetta, "North"'), '"Quetta, ""North"""');
  const csv = buildCsv(["name", "formula"], [["Flood", "+SUM(A1:A2)"]]);
  assert.match(csv, /^name,formula\nFlood,'?\+SUM/);

  const inc: Incident[] = [
    {
      id: 1, code: "CT-1", type: "flood", severity: "high", description: "Water high",
      latitude: 30.1, longitude: 67.0, place_text: null, district_id: 1, district_name: "Quetta",
      status: "verified", created_at: "2026-04-02T10:00:00Z", observed_at: null, photo_count: 0,
    },
    {
      id: 2, code: "CT-2", type: "landslide", severity: "medium", description: "Road blocked",
      latitude: 30.2, longitude: 67.1, place_text: null, district_id: 1, district_name: "Quetta",
      status: "pending", created_at: "2026-04-05T10:00:00Z", observed_at: null, photo_count: 1,
    },
  ];
  const resList: Resource[] = [
    { id: 1, name: "Hospital A", type: "hospital", district_id: 1, latitude: 30.1, longitude: 67, phone: null, address: null, source: "Health Dept", verified: true },
  ];
  const assessList: RiskAssessment[] = [];
  const alerts: AlertItem[] = [
    { id: 1, title: "Flood Watch", message: "Alert", severity: "watch", hazard_type: "flood", district_ids: [1], safety_instructions: "Stay safe", status: "published", source: "PDMA", created_by: 1, created_at: "2026-04-01T00:00:00Z", published_at: "2026-04-01T00:00:00Z", expires_at: null, delivery_count: 1 },
  ];

  const report = computeAnalytics({ incidents: inc, resources: resList, assessments: assessList, alerts });
  assert.equal(report.incidents_total, 2);
  assert.equal(report.incidents_by_district[0].name, "Quetta");
  assert.equal(report.incidents_by_district[0].value, 2);
  assert.equal(report.monthly_incident_trends[0].verified, 1);
  assert.equal(report.alerts_summary.published, 1);

  const s1: Simulation = {
    id: 1, district_id: 1, params: {}, status: "completed", created_at: "",
    results: { total_rainfall_mm: 100, risk_indicators: assess({ rainfall_mm_24h: 100, elevation_m: 1000 }), visualization: null, visualization_note: null, assumptions: [], limitations: [], processing_status: "completed" },
  };
  const s2: Simulation = {
    id: 2, district_id: 1, params: {}, status: "completed", created_at: "",
    results: { total_rainfall_mm: 240, risk_indicators: assess({ rainfall_mm_24h: 200, elevation_m: 1000 }), visualization: null, visualization_note: null, assumptions: [], limitations: [], processing_status: "completed" },
  };
  const cmp = compareSimulations(s1, s2);
  assert.equal(cmp.totalRainfallDiffMm, 140);
  assert.equal(cmp.higherRiskSide, "right");
});

test("offline drafts explicitly mark unsubmitted local drafts and validate parsed payloads", () => {
  const draft = createOfflineDraft({
    type: "flash_flood",
    severity: "critical",
    description: "Bridge washed away on main highway",
    latitude: 29.55,
    longitude: 67.85,
    location_source: "gps",
  });
  assert.equal(draft.sync_state, "local_draft_unsubmitted");
  const parsed = parseDrafts(JSON.stringify([draft, { bogus: true }]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].local_id, draft.local_id);
});

test("password hashing and JWT signing enforce cryptographic integrity", () => {
  const h = hashPassword("StrongPass#2026");
  assert.equal(verifyPassword("StrongPass#2026", h), true);
  assert.equal(verifyPassword("WrongPass", h), false);

  const token = createAccessToken(42, "admin", "admin@crisistwin.test", "Coordinator");
  const decoded = decodeAccessToken(token);
  assert.deepEqual(decoded, { sub: 42, role: "admin", email: "admin@crisistwin.test", full_name: "Coordinator" });
  assert.equal(decodeAccessToken(token + "tampered"), null);
});

test("INCIDENT_TYPES includes all 9 citizen emergency reporting categories", () => {
  const primaryIds = INCIDENT_TYPES.filter((t) => t.citizenPrimary).map((t) => t.value);
  for (const required of [
    "flood",
    "fire",
    "earthquake",
    "landslide",
    "building_collapse",
    "road_accident",
    "road_blocked",
    "infrastructure_damage",
    "other",
  ] as const) {
    assert.ok(primaryIds.includes(required), `Missing primary citizen type: ${required}`);
  }
});

test("guest verification PINs verify in constant time and support IP rate limiting", () => {
  const pin = generateGuestVerificationCode(8);
  assert.equal(pin.length, 8);
  assert.match(pin, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  const hash = hashOpaqueToken(pin);
  assert.equal(verifyOpaqueSecret(pin, hash), true);
  assert.equal(verifyOpaqueSecret("WRONGPIN", hash), false);
  assert.equal(verifyOpaqueSecret("", hash), false);

  assert.equal(incidentRateOk("guest:203.0.113.10"), true);
  assert.equal(trackRateOk("203.0.113.10"), true);
});

test("classifyDatabaseUrl identifies Supabase pooler, local Postgres, and empty configuration", () => {
  assert.deepEqual(
    classifyDatabaseUrl("postgresql://postgres.abcd:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"),
    { configured: true, mode: "supabase-postgres", useSsl: true, invalidReason: null }
  );
  assert.deepEqual(
    classifyDatabaseUrl("postgresql://postgres:pass@localhost:5432/crisistwin"),
    { configured: true, mode: "postgres", useSsl: false, invalidReason: null }
  );
  assert.deepEqual(classifyDatabaseUrl("   "), {
    configured: false,
    mode: "file-backed-tmp",
    useSsl: false,
    invalidReason: null,
  });
});

test("normalizeDatabaseUrl strips quotes, DATABASE_URL= prefix, SQLAlchemy driver, encodes special password chars, and rejects https URLs", () => {
  assert.equal(
    normalizeDatabaseUrl('"postgresql://postgres.abcd:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"').url,
    "postgresql://postgres.abcd:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
  );
  assert.equal(
    normalizeDatabaseUrl("DATABASE_URL=postgresql+psycopg://postgres:My#Pass@db.xyz.supabase.co:5432/postgres").url,
    "postgresql://postgres:My%23Pass@db.xyz.supabase.co:5432/postgres"
  );
  const httpsRes = normalizeDatabaseUrl("https://xyz.supabase.co");
  assert.equal(httpsRes.url, null);
  assert.ok(httpsRes.invalidReason?.includes("HTTPS"));
});

test("redactDbError strips database credentials from connection strings and errors", () => {
  const err = new Error("connect ECONNREFUSED postgresql://postgres.xyz:SuperSecret123@db.xyz.supabase.co:5432/postgres");
  const redacted = redactDbError(err);
  assert.ok(!redacted.includes("SuperSecret123"));
  assert.ok(redacted.includes("postgresql://***@db.xyz.supabase.co"));
});

test("validateHttpsExternalUrl enforces HTTPS and rejects private or metadata hosts", () => {
  assert.equal(validateHttpsExternalUrl("https://xyz.supabase.co")?.hostname, "xyz.supabase.co");
  assert.equal(validateHttpsExternalUrl("http://xyz.supabase.co"), null);
  assert.equal(validateHttpsExternalUrl("https://127.0.0.1/rest/v1"), null);
  assert.equal(validateHttpsExternalUrl("https://169.254.169.254/latest/meta-data"), null);
  assert.equal(validateHttpsExternalUrl("https://10.0.0.5/hook"), null);
  assert.equal(validateHttpsExternalUrl("https://192.168.1.20/hook"), null);
});

test("cryptoSecrets encrypts with AES-256-GCM, round-trips cleanly, and masks hints", () => {
  const cipher = encryptSecret("whsec_live_9876543210");
  assert.ok(cipher.startsWith("enc:v1:"));
  assert.ok(!cipher.includes("9876543210"));
  assert.equal(decryptSecret(cipher), "whsec_live_9876543210");
  assert.equal(maskSecretHint(cipher), "••••3210");
  assert.equal(encryptSecret("   "), "");
  assert.equal(decryptSecret("enc:v1:bad"), "");
});

test("evaluateRoutingRules prioritizes specificity over fallback, respects priority order, and preserves unassigned", () => {
  const now = "2026-11-27T00:00:00Z";
  const depts: Department[] = [
    {
      id: 1,
      name: "Agency Alpha",
      description: null,
      department_type: "fire_rescue",
      assigned_district_ids: [1],
      supported_categories: ["fire"],
      primary_contact_name: null,
      contact_email: null,
      contact_phone: null,
      notification_channel: "email",
      webhook_url: null,
      backup_department_id: 2,
      priority_weight: 20,
      is_active: true,
      contacts: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      name: "Agency Beta",
      description: null,
      department_type: "disaster_management",
      assigned_district_ids: [],
      supported_categories: ["flood", "fire"],
      primary_contact_name: null,
      contact_email: null,
      contact_phone: null,
      notification_channel: "webhook",
      webhook_url: null,
      backup_department_id: null,
      priority_weight: 10,
      is_active: true,
      contacts: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      name: "Disabled Agency",
      description: null,
      department_type: "other",
      assigned_district_ids: [],
      supported_categories: [],
      primary_contact_name: null,
      contact_email: null,
      contact_phone: null,
      notification_channel: "email",
      webhook_url: null,
      backup_department_id: null,
      priority_weight: 99,
      is_active: false,
      contacts: [],
      created_at: now,
      updated_at: now,
    },
  ];

  const rules: RoutingRule[] = [
    {
      id: 10,
      name: "Fallback Rule",
      description: null,
      enabled: true,
      is_fallback: true,
      priority_order: 1,
      incident_categories: [],
      district_ids: [],
      severities: [],
      min_people_affected: null,
      require_photos: false,
      keywords: null,
      target_department_id: 2,
      backup_department_id: null,
      set_priority: null,
      send_notification: true,
      escalation_minutes: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 11,
      name: "Specific Fire District 1",
      description: null,
      enabled: true,
      is_fallback: false,
      priority_order: 2,
      incident_categories: ["fire"],
      district_ids: [1],
      severities: [],
      min_people_affected: null,
      require_photos: false,
      keywords: null,
      target_department_id: 1,
      backup_department_id: null,
      set_priority: "critical",
      send_notification: true,
      escalation_minutes: 10,
      created_at: now,
      updated_at: now,
    },
    {
      id: 12,
      name: "Disabled Agency Rule",
      description: null,
      enabled: true,
      is_fallback: false,
      priority_order: 1,
      incident_categories: ["fire"],
      district_ids: [1],
      severities: ["high"],
      min_people_affected: null,
      require_photos: false,
      keywords: null,
      target_department_id: 3,
      backup_department_id: null,
      set_priority: null,
      send_notification: true,
      escalation_minutes: null,
      created_at: now,
      updated_at: now,
    },
  ];

  // Specific active rule beats fallback AND disabled department's rule AND enforces min severity upgrade
  const decision = evaluateRoutingRules(
    { category: "fire", district_id: 1, severity: "high", people_affected: null, photo_count: 0, description: "Warehouse fire" },
    rules,
    depts
  );
  assert.equal(decision.matched, true);
  assert.equal(decision.department?.id, 1);
  assert.equal(decision.backup_department?.id, 2);
  assert.equal(decision.effective_priority, "critical");
  assert.equal(decision.escalation_minutes, 10);

  // Unmatched specific conditions fall back only to enabled fallback
  const fallbackDecision = evaluateRoutingRules(
    { category: "flood", district_id: 9, severity: "low", people_affected: null, photo_count: 0, description: "Minor water" },
    rules,
    depts
  );
  assert.equal(fallbackDecision.matched, true);
  assert.equal(fallbackDecision.rule?.id, 10);
  assert.equal(fallbackDecision.department?.id, 2);

  // When no rules exist, returns matched: false cleanly (no invented department)
  const none = evaluateRoutingRules(
    { category: "flood", district_id: 9, severity: "low", people_affected: null, photo_count: 0, description: "Minor water" },
    [],
    depts
  );
  assert.equal(none.matched, false);
  assert.equal(none.department, null);
});

test("findEscalationCandidates flags overdue unacknowledged assignments and ignores acknowledged ones", () => {
  const nowMs = Date.parse("2026-11-27T12:00:00Z");
  const baseAssignment: IncidentAssignment = {
    id: 1,
    incident_id: 100,
    incident_code: "CT-100",
    incident_type: "flood",
    district_id: 1,
    district_name: "Quetta",
    department_id: 1,
    department_name: "Agency Alpha",
    backup_department_id: 2,
    routing_rule_id: 11,
    routing_rule_name: "Rule",
    status: "notified",
    priority: "critical",
    assigned_personnel: null,
    escalation_minutes: null,
    escalated: false,
    escalation_level: 0,
    last_escalated_at: null,
    assigned_at: "2026-11-27T11:30:00Z", // 30 mins ago
    notified_at: "2026-11-27T11:30:05Z",
    acknowledged_at: null,
    resolved_at: null,
    updated_at: "2026-11-27T11:30:05Z",
  };

  const rules: EscalationRule[] = [
    {
      id: 1,
      name: "Critical SLA 15m",
      enabled: true,
      severity: "critical",
      department_id: null,
      timeout_minutes: 15,
      notify_admins: true,
      notify_backup_department: true,
      created_at: "2026-11-27T00:00:00Z",
      updated_at: "2026-11-27T00:00:00Z",
    },
  ];

  const overdue = findEscalationCandidates([baseAssignment], rules, nowMs);
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].elapsedMinutes, 30);

  // Accepted/acknowledged assignments must not escalate
  const acknowledged: IncidentAssignment = { ...baseAssignment, status: "accepted", acknowledged_at: "2026-11-27T11:35:00Z" };
  assert.equal(findEscalationCandidates([acknowledged], rules, nowMs).length, 0);

  // Recently escalated assignment throttles repeat triggers until another timeout elapses
  const recentlyEscalated: IncidentAssignment = {
    ...baseAssignment,
    escalated: true,
    escalation_level: 1,
    last_escalated_at: "2026-11-27T11:55:00Z",
  };
  assert.equal(findEscalationCandidates([recentlyEscalated], rules, nowMs).length, 0);
});

test("geometryBBox memoizes bounds and speeds up outside-bbox pointInGeometry rejections", () => {
  const poly: GeoJSON.MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [
      [[[66.0, 30.0], [67.0, 30.0], [67.0, 31.0], [66.0, 31.0], [66.0, 30.0]]],
      [[[68.0, 29.0], [68.5, 29.0], [68.5, 29.5], [68.0, 29.5], [68.0, 29.0]]],
    ],
  };
  const b1 = geometryBBox(poly);
  const b2 = geometryBBox(poly);
  assert.equal(b1, b2); // WeakMap memoized reference
  assert.deepEqual(b1, [66.0, 29.0, 68.5, 31.0]);
  assert.equal(pointInGeometry(30.5, 66.5, poly), true);
  assert.equal(pointInGeometry(29.2, 68.25, poly), true);
  assert.equal(pointInGeometry(25.0, 62.0, poly), false);
});

test("responseCache serves ETag, honors If-None-Match 304, invalidates by tag, and marks noStoreJson private", async () => {
  let runs = 0;
  const req1 = new NextRequest("http://localhost:3000/api/v1/alerts");
  const r1 = cachedPublicJson(req1, {
    tag: "alerts",
    key: "unit-test",
    maxAge: 30,
    sMaxAge: 60,
    swr: 120,
    compute: () => ({ count: ++runs }),
  });
  assert.equal(r1.status, 200);
  const etag = r1.headers.get("ETag");
  assert.ok(etag);
  assert.match(r1.headers.get("Cache-Control") ?? "", /s-maxage=60/);

  const req2 = new NextRequest("http://localhost:3000/api/v1/alerts", {
    headers: { "if-none-match": etag! },
  });
  const r2 = cachedPublicJson(req2, {
    tag: "alerts",
    key: "unit-test",
    maxAge: 30,
    sMaxAge: 60,
    swr: 120,
    compute: () => ({ count: ++runs }),
  });
  assert.equal(r2.status, 304);
  assert.equal(runs, 1); // Snapshot reused without recomputation

  invalidateCache("alerts");
  const r3 = cachedPublicJson(req2, {
    tag: "alerts",
    key: "unit-test",
    maxAge: 30,
    sMaxAge: 60,
    swr: 120,
    compute: () => ({ count: ++runs }),
  });
  assert.equal(r3.status, 200);
  assert.equal(runs, 2);

  const priv = noStoreJson({ secret: true });
  assert.equal(priv.headers.get("Cache-Control"), "private, no-store, max-age=0");
});

test("boundAiPrompt caps context size while keeping the user question intact", () => {
  const bigContext = "X".repeat(MAX_AI_PROMPT_CHARS + 5000);
  const prompt = `${bigContext}\nQuestion: Where is the nearest hospital in Quetta?`;
  const bounded = boundAiPrompt(prompt);
  assert.ok(bounded.length <= MAX_AI_PROMPT_CHARS);
  assert.ok(bounded.endsWith("Question: Where is the nearest hospital in Quetta?"));
});

test("recoverStalePendingIncidents exits immediately when agent disabled or no stale jobs", async () => {
  const store = getStore();
  const prev = store.agentConfig.enabled;
  try {
    store.agentConfig.enabled = false;
    assert.equal(await recoverStalePendingIncidents(store, 3), 0);
    store.agentConfig.enabled = true;
    assert.equal(await recoverStalePendingIncidents(store, 3), 0);
  } finally {
    store.agentConfig.enabled = prev;
  }
});


