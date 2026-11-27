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
import { inBalochistan, kmBetween, pointInGeometry, validatePolygon } from "../server/geo";
import {
  classifyDatabaseUrl,
  normalizeDatabaseUrl,
  redactDbError,
  validateHttpsExternalUrl,
} from "../server/supabaseDb";
import { buildCsv, compareSimulations, computeAnalytics, csvCell } from "../utils/analytics";
import { createOfflineDraft, parseDrafts } from "../utils/offlineDrafts";
import { INCIDENT_TYPES, type AlertItem, type Incident, type Resource, type RiskAssessment, type Simulation } from "../types";

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

