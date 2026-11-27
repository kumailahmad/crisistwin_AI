import crypto from "crypto";
import { decryptSecret, maskSecretHint } from "./cryptoSecrets";
import { pointInGeometry } from "./geo";
import { invalidateCache } from "./responseCache";
import { evaluateRoutingRules, findEscalationCandidates } from "./routingEngine";
import {
  addAudit,
  notifyAdmins,
  pushNotification,
  saveStoreAsync,
  type Store,
  type StoredIncident,
  type StoredNotificationIntegration,
} from "./store";
import { redactDbError, validateHttpsExternalUrl } from "./supabaseDb";
import type {
  Department,
  IncidentAssignment,
  IncidentSeverity,
  IncidentType,
  NotificationChannelType,
  NotificationIntegration,
  NotificationLog,
} from "@/lib/types";

const ALLOWED_TYPES = new Set<IncidentType>([
  "flood",
  "flash_flood",
  "heavy_rain",
  "earthquake",
  "landslide",
  "building_collapse",
  "road_accident",
  "drought",
  "fire",
  "road_blocked",
  "infrastructure_damage",
  "medical",
  "missing_person",
  "other",
]);
const ALLOWED_SEVERITIES = new Set<IncidentSeverity>(["low", "medium", "high", "critical"]);

export function integrationToPublic(i: StoredNotificationIntegration): NotificationIntegration {
  const { encrypted_api_key, encrypted_auth_token, ...rest } = i;
  return {
    ...rest,
    has_api_key: Boolean(encrypted_api_key),
    api_key_hint: maskSecretHint(encrypted_api_key) || null,
    has_auth_token: Boolean(encrypted_auth_token),
    auth_token_hint: maskSecretHint(encrypted_auth_token) || null,
  };
}

function appBaseUrl(): string {
  const raw = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw.replace(/\/$/, "");
  return "";
}

function parseJsonSafe<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function groqFetchWithRetry(bodyObj: Record<string, unknown>, groqKey: string, timeoutMs = 20_000): Promise<Response> {
  const payloadStr = JSON.stringify(bodyObj);
  for (const attempt of [0, 1]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: payloadStr,
        signal: ctl.signal,
      });
      if ([429, 500, 502, 503].includes(res.status) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Groq returned HTTP ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Groq request exhausted retries");
}

const MAX_VISION_BYTES = 1_500_000;

async function analyzePhotosWithGroqVision(
  inc: StoredIncident,
  visionModel: string,
  groqKey: string
): Promise<{ summary: string; model: string }> {
  const images = inc.media_blobs.filter((b) => b.data.length > 0 && b.data.length <= MAX_VISION_BYTES).slice(0, 2);
  if (images.length === 0) return { summary: "", model: visionModel };

  const content: Record<string, unknown>[] = [
    {
      type: "text",
      text:
        "Inspect these emergency incident photos from Balochistan. Summarize visible hazards, structural/road/flood/fire damage, and immediate safety risks in 2 concise factual sentences. Do not invent unverified details.",
    },
  ];
  for (const blob of images) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${blob.content_type};base64,${blob.data.toString("base64")}`,
      },
    });
  }

  const res = await groqFetchWithRetry(
    {
      model: visionModel,
      temperature: 0.1,
      max_tokens: 220,
      messages: [{ role: "user", content }],
    },
    groqKey,
    22_000
  );
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return {
    summary: (data.choices?.[0]?.message?.content ?? "").trim().slice(0, 500),
    model: visionModel,
  };
}

async function classifyIncidentWithGroq(
  inc: StoredIncident,
  districtName: string | null,
  imageSummary: string,
  model: string,
  groqKey: string
): Promise<{
  recommended_category: IncidentType;
  recommended_severity: IncidentSeverity;
  confidence: number;
  reasoning: string;
}> {
  const prompt = [
    `Reported category: ${inc.type}`,
    `Reported severity: ${inc.severity}`,
    `District: ${districtName || "Unknown"}`,
    `People affected: ${inc.people_affected ?? "Not specified"}`,
    `Description: ${inc.description.slice(0, 1200)}`,
    imageSummary ? `Visual photo analysis: ${imageSummary}` : "Visual photo analysis: None",
    `Allowed categories: ${Array.from(ALLOWED_TYPES).join(", ")}`,
    `Allowed severities: low, medium, high, critical`,
    `Respond ONLY with valid JSON: {"recommended_category":"...","recommended_severity":"...","confidence":0.0,"reasoning":"1 short factual sentence"}. Never invent department names or contacts.`,
  ].join("\n");

  const res = await groqFetchWithRetry(
    {
      model,
      temperature: 0.1,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an emergency triage classifier for Balochistan Disaster Management. Output only strict JSON classifying the incident category and severity based strictly on the provided report and image analysis.",
        },
        { role: "user", content: prompt },
      ],
    },
    groqKey,
    20_000
  );
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const rawText = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseJsonSafe<{
    recommended_category?: string;
    recommended_severity?: string;
    confidence?: number;
    reasoning?: string;
  }>(rawText);
  if (!parsed) throw new Error("Groq classification returned invalid JSON");

  const cat = ALLOWED_TYPES.has(parsed.recommended_category as IncidentType)
    ? (parsed.recommended_category as IncidentType)
    : inc.type;
  const sev = ALLOWED_SEVERITIES.has(parsed.recommended_severity as IncidentSeverity)
    ? (parsed.recommended_severity as IncidentSeverity)
    : inc.severity;
  const conf =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, Math.round(parsed.confidence * 100) / 100))
      : 0.7;
  return {
    recommended_category: cat,
    recommended_severity: sev,
    confidence: conf,
    reasoning: (parsed.reasoning ?? "Classified via Groq").trim().slice(0, 320),
  };
}

export interface DepartmentDispatchPayload {
  event_type: "incident_assigned" | "incident_escalated" | "integration_test";
  reference_id: string;
  category: string;
  severity: string;
  district: string;
  coordinates: { latitude: number; longitude: number };
  map_link: string;
  dashboard_link: string;
  description: string;
  ai_image_summary: string | null;
  submitted_at: string;
  department_name: string;
}

export function buildPrivacySafeDispatchPayload(
  inc: StoredIncident,
  dept: Department,
  eventType: DepartmentDispatchPayload["event_type"],
  effectiveSeverity: IncidentSeverity
): DepartmentDispatchPayload {
  const origin = appBaseUrl();
  const mapPath = `/map?lat=${inc.latitude}&lon=${inc.longitude}&code=${encodeURIComponent(inc.code)}`;
  const deptPath = "/department";
  return {
    event_type: eventType,
    reference_id: inc.code,
    category: inc.type,
    severity: effectiveSeverity,
    district: inc.district_name || inc.place_text || "Balochistan",
    coordinates: { latitude: inc.latitude, longitude: inc.longitude },
    map_link: origin ? `${origin}${mapPath}` : mapPath,
    dashboard_link: origin ? `${origin}${deptPath}` : deptPath,
    description: inc.description,
    ai_image_summary: inc.ai_image_summary ?? null,
    submitted_at: inc.created_at,
    department_name: dept.name,
  };
}

async function deliverViaIntegration(
  integration: StoredNotificationIntegration | null,
  channel: NotificationChannelType,
  recipient: string,
  payload: DepartmentDispatchPayload,
  directWebhookUrl?: string | null
): Promise<{ ok: boolean; responseText: string | null; error: string | null }> {
  const apiKey = decryptSecret(integration?.encrypted_api_key);
  const authToken = decryptSecret(integration?.encrypted_auth_token);

  try {
    if (channel === "webhook") {
      const targetUrl = validateHttpsExternalUrl(directWebhookUrl || integration?.endpoint_url || recipient);
      if (!targetUrl) {
        return { ok: false, responseText: null, error: "Invalid or non-HTTPS webhook URL (private IPs blocked)." };
      }
      const bodyStr = JSON.stringify(payload);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) {
        const sig = crypto.createHmac("sha256", apiKey).update(bodyStr).digest("hex");
        headers["X-CrisisTwin-Signature"] = `sha256=${sig}`;
      }
      const res = await fetch(targetUrl.toString(), { method: "POST", headers, body: bodyStr });
      const txt = (await res.text()).slice(0, 200);
      return res.ok
        ? { ok: true, responseText: `HTTP ${res.status}`, error: null }
        : { ok: false, responseText: txt || `HTTP ${res.status}`, error: `Webhook returned HTTP ${res.status}` };
    }

    if (channel === "email") {
      if (!/^\S+@\S+\.\S+$/.test(recipient)) {
        return { ok: false, responseText: null, error: "Invalid recipient email address." };
      }
      const key = apiKey || process.env.RESEND_API_KEY?.trim() || "";
      if (integration?.endpoint_url) {
        const customUrl = validateHttpsExternalUrl(integration.endpoint_url);
        if (!customUrl) return { ok: false, responseText: null, error: "Email endpoint must use public HTTPS." };
        const res = await fetch(customUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({ to: recipient, from: integration.sender_identity, payload }),
        });
        return res.ok
          ? { ok: true, responseText: `HTTP ${res.status}`, error: null }
          : { ok: false, responseText: null, error: `Email relay returned HTTP ${res.status}` };
      }
      if (!key) return { ok: false, responseText: null, error: "Missing Email / Resend API key." };
      const fromAddr =
        integration?.sender_identity?.trim() ||
        process.env.RESEND_FROM_EMAIL?.trim() ||
        "CrisisTwin AI <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddr,
          to: [recipient],
          subject: `[${payload.severity.toUpperCase()}] ${payload.reference_id} · ${payload.category.replace(/_/g, " ")} (${payload.district})`,
          text: [
            `Department: ${payload.department_name}`,
            `Reference ID: ${payload.reference_id}`,
            `Category: ${payload.category}`,
            `Severity: ${payload.severity}`,
            `District: ${payload.district}`,
            `Coordinates: ${payload.coordinates.latitude}, ${payload.coordinates.longitude}`,
            `Map: ${payload.map_link}`,
            `Description: ${payload.description}`,
            payload.ai_image_summary ? `AI Image Analysis: ${payload.ai_image_summary}` : "",
            `Submitted: ${payload.submitted_at}`,
            `Portal: ${payload.dashboard_link}`,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });
      const resText = (await res.text()).slice(0, 180);
      return res.ok
        ? { ok: true, responseText: `Resend HTTP ${res.status}`, error: null }
        : { ok: false, responseText: resText, error: `Email provider returned HTTP ${res.status}` };
    }

    if (channel === "sms") {
      if (!recipient) return { ok: false, responseText: null, error: "Missing SMS recipient phone number." };
      const customUrl = validateHttpsExternalUrl(integration?.endpoint_url || undefined);
      if (customUrl) {
        const res = await fetch(customUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            to: recipient,
            from: integration?.sender_identity,
            message: `[CrisisTwin ${payload.severity.toUpperCase()}] ${payload.reference_id} (${payload.category}) in ${payload.district}. Open: ${payload.dashboard_link}`,
            payload,
          }),
        });
        return res.ok
          ? { ok: true, responseText: `HTTP ${res.status}`, error: null }
          : { ok: false, responseText: null, error: `SMS gateway returned HTTP ${res.status}` };
      }
      const sid = integration?.account_sid?.trim() || "";
      const token = authToken || apiKey;
      const fromNum = integration?.sender_identity?.trim() || "";
      if (!sid || !token || !fromNum) {
        return { ok: false, responseText: null, error: "Configure Twilio Account SID, Auth Token, and From number (or custom HTTPS SMS endpoint)." };
      }
      const twilioEndpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
      const form = new URLSearchParams({
        To: recipient,
        From: fromNum,
        Body: `[CrisisTwin ${payload.severity.toUpperCase()}] ${payload.reference_id} ${payload.category} · ${payload.district}. ${payload.description.slice(0, 100)}`,
      });
      const res = await fetch(twilioEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      return res.ok
        ? { ok: true, responseText: `Twilio HTTP ${res.status}`, error: null }
        : { ok: false, responseText: null, error: `Twilio SMS returned HTTP ${res.status}` };
    }

    if (channel === "whatsapp") {
      if (!recipient) return { ok: false, responseText: null, error: "Missing WhatsApp recipient number." };
      const customUrl = validateHttpsExternalUrl(integration?.endpoint_url || undefined);
      if (customUrl) {
        const res = await fetch(customUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ to: recipient, from: integration?.sender_identity, payload }),
        });
        return res.ok
          ? { ok: true, responseText: `HTTP ${res.status}`, error: null }
          : { ok: false, responseText: null, error: `WhatsApp gateway returned HTTP ${res.status}` };
      }
      const phoneId = integration?.account_sid?.trim() || "";
      if (!phoneId || !apiKey) {
        return { ok: false, responseText: null, error: "Configure WhatsApp Phone Number ID and API Token (or custom HTTPS WhatsApp endpoint)." };
      }
      const graphUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`;
      const res = await fetch(graphUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient.replace(/[^0-9]/g, ""),
          type: "text",
          text: {
            body: `[CrisisTwin ${payload.severity.toUpperCase()}] ${payload.reference_id} (${payload.category}) in ${payload.district}\n${payload.description.slice(0, 200)}\nPortal: ${payload.dashboard_link}`,
          },
        }),
      });
      return res.ok
        ? { ok: true, responseText: `WhatsApp HTTP ${res.status}`, error: null }
        : { ok: false, responseText: null, error: `WhatsApp Cloud API returned HTTP ${res.status}` };
    }

    if (channel === "push") {
      const pushUrl = validateHttpsExternalUrl(integration?.endpoint_url || undefined);
      if (!pushUrl) {
        return { ok: false, responseText: null, error: "Configure a valid HTTPS Push gateway endpoint." };
      }
      const res = await fetch(pushUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ recipient, payload }),
      });
      return res.ok
        ? { ok: true, responseText: `Push HTTP ${res.status}`, error: null }
        : { ok: false, responseText: null, error: `Push provider returned HTTP ${res.status}` };
    }

    return { ok: false, responseText: null, error: "Unsupported channel" };
  } catch (err) {
    return { ok: false, responseText: null, error: redactDbError(err) };
  }
}

export async function testNotificationIntegration(
  store: Store,
  integration: StoredNotificationIntegration,
  testRecipient?: string
): Promise<{ ok: boolean; error: string | null; response: string | null }> {
  const recipient = (testRecipient?.trim() || integration.default_recipients[0] || integration.endpoint_url || "").trim();
  const samplePayload: DepartmentDispatchPayload = {
    event_type: "integration_test",
    reference_id: "CT-TEST-VERIFY",
    category: "flood",
    severity: "high",
    district: "Quetta",
    coordinates: { latitude: 30.1798, longitude: 66.975 },
    map_link: appBaseUrl() ? `${appBaseUrl()}/map` : "/map",
    dashboard_link: appBaseUrl() ? `${appBaseUrl()}/department` : "/department",
    description: "Verification test delivery from CrisisTwin AI Notification Integration Manager.",
    ai_image_summary: null,
    submitted_at: new Date().toISOString(),
    department_name: integration.name,
  };
  const result = await deliverViaIntegration(integration, integration.channel, recipient, samplePayload);
  const nowIso = new Date().toISOString();
  integration.connection_status = result.ok ? "verified" : "error";
  integration.last_verified_at = result.ok ? nowIso : integration.last_verified_at;
  integration.last_error = result.ok ? null : result.error;
  integration.updated_at = nowIso;

  store.notificationLogs.unshift({
    id: store.nextId.notificationLog++,
    incident_id: null,
    incident_code: "CT-TEST-VERIFY",
    assignment_id: null,
    department_id: null,
    department_name: integration.name,
    integration_id: integration.id,
    channel: integration.channel,
    recipient: recipient || integration.name,
    event_type: "integration_test",
    status: result.ok ? "sent" : "failed",
    attempt_count: 1,
    dedupe_key: `test:${integration.id}:${Date.now()}`,
    provider_response: result.responseText,
    error_message: result.error,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (store.notificationLogs.length > 500) store.notificationLogs.length = 500;
  return { ok: result.ok, error: result.error, response: result.responseText };
}

export async function dispatchDepartmentNotifications(
  store: Store,
  inc: StoredIncident,
  dept: Department,
  assignment: IncidentAssignment,
  eventType: "incident_assigned" | "incident_escalated" = "incident_assigned"
): Promise<{ sentCount: number; failedCount: number }> {
  const payload = buildPrivacySafeDispatchPayload(inc, dept, eventType, assignment.priority);
  const maxRetries = Math.max(1, store.agentConfig?.max_notification_retries ?? 2);
  let sentCount = 0;
  let failedCount = 0;

  // Always create in-app portal notification for department-role users assigned to this department
  for (const u of store.users) {
    if (u.is_active && u.role === "department" && u.department_id === dept.id) {
      pushNotification(store, {
        user_id: u.id,
        kind: "incident",
        title: `${eventType === "incident_escalated" ? "[ESCALATED] " : ""}${inc.code} assigned to ${dept.name}`,
        body: `${inc.type.replace(/_/g, " ")} (${assignment.priority}) · ${inc.district_name || "Balochistan"}`,
        link: "/department",
      });
    }
  }

  // Gather configured delivery targets from department & verified/enabled integrations
  const targets: { channel: NotificationChannelType; recipient: string; integration: StoredNotificationIntegration | null; webhookUrl?: string | null }[] = [];

  if (dept.notification_channel === "webhook" && dept.webhook_url) {
    targets.push({ channel: "webhook", recipient: dept.webhook_url, integration: null, webhookUrl: dept.webhook_url });
  }
  if (dept.contact_email && (dept.notification_channel === "email" || dept.contacts.some((c) => c.channel_preference === "email"))) {
    const emailInt =
      store.notificationIntegrations.find(
        (i) => i.enabled && i.channel === "email" && (i.department_ids.length === 0 || i.department_ids.includes(dept.id))
      ) ?? null;
    targets.push({ channel: "email", recipient: dept.contact_email, integration: emailInt });
  }
  if (dept.contact_phone && (dept.notification_channel === "sms" || dept.notification_channel === "whatsapp")) {
    const chInt =
      store.notificationIntegrations.find(
        (i) => i.enabled && i.channel === dept.notification_channel && (i.department_ids.length === 0 || i.department_ids.includes(dept.id))
      ) ?? null;
    targets.push({ channel: dept.notification_channel, recipient: dept.contact_phone, integration: chInt });
  }

  // Also include enabled integrations scoped to this department / event trigger
  for (const intg of store.notificationIntegrations) {
    if (!intg.enabled) continue;
    if (intg.department_ids.length > 0 && !intg.department_ids.includes(dept.id)) continue;
    if (intg.event_triggers.length > 0 && !intg.event_triggers.includes(eventType)) continue;
    const recips = intg.default_recipients.length
      ? intg.default_recipients
      : intg.channel === "webhook" && intg.endpoint_url
        ? [intg.endpoint_url]
        : dept.contact_email && intg.channel === "email"
          ? [dept.contact_email]
          : dept.contact_phone && (intg.channel === "sms" || intg.channel === "whatsapp")
            ? [dept.contact_phone]
            : [];
    for (const r of recips) {
      if (!targets.some((t) => t.channel === intg.channel && t.recipient === r && t.integration?.id === intg.id)) {
        targets.push({ channel: intg.channel, recipient: r, integration: intg });
      }
    }
  }

  const nowIso = new Date().toISOString();
  for (const t of targets) {
    const dedupeKey = `${eventType}:${inc.id}:${dept.id}:${t.channel}:${t.recipient.toLowerCase()}`;
    if (store.notificationLogs.some((l) => l.dedupe_key === dedupeKey && l.status === "sent")) {
      continue;
    }

    let attempts = 0;
    let finalRes: { ok: boolean; responseText: string | null; error: string | null } = {
      ok: false,
      responseText: null,
      error: "Not attempted",
    };

    while (attempts < maxRetries) {
      attempts++;
      finalRes = await deliverViaIntegration(t.integration, t.channel, t.recipient, payload, t.webhookUrl);
      if (finalRes.ok) break;
    }

    const logEntry: NotificationLog = {
      id: store.nextId.notificationLog++,
      incident_id: inc.id,
      incident_code: inc.code,
      assignment_id: assignment.id,
      department_id: dept.id,
      department_name: dept.name,
      integration_id: t.integration?.id ?? null,
      channel: t.channel,
      recipient: t.recipient,
      event_type: eventType,
      status: finalRes.ok ? "sent" : "failed",
      attempt_count: attempts,
      dedupe_key: dedupeKey,
      provider_response: finalRes.responseText,
      error_message: finalRes.error,
      created_at: nowIso,
      updated_at: nowIso,
    };
    store.notificationLogs.unshift(logEntry);
    if (store.notificationLogs.length > 500) store.notificationLogs.length = 500;
    if (finalRes.ok) sentCount++;
    else failedCount++;
  }

  if (sentCount > 0) {
    assignment.notified_at = nowIso;
    if (assignment.status === "assigned") {
      assignment.status = "notified";
      inc.workflow_status = "notified";
    }
    assignment.updated_at = nowIso;
  }

  return { sentCount, failedCount };
}

export async function retryNotificationLog(store: Store, log: NotificationLog): Promise<NotificationLog> {
  const inc = log.incident_id ? store.incidents.find((i) => i.id === log.incident_id) : null;
  const dept = log.department_id ? store.departments.find((d) => d.id === log.department_id) : null;
  const intg = log.integration_id
    ? store.notificationIntegrations.find((i) => i.id === log.integration_id) ?? null
    : null;
  if (!inc || !dept) {
    log.error_message = "Associated incident or department no longer exists.";
    log.updated_at = new Date().toISOString();
    return log;
  }
  const payload = buildPrivacySafeDispatchPayload(inc, dept, "incident_assigned", inc.severity);
  const res = await deliverViaIntegration(intg, log.channel, log.recipient, payload, dept.webhook_url);
  log.attempt_count += 1;
  log.status = res.ok ? "sent" : "failed";
  log.provider_response = res.responseText;
  log.error_message = res.error;
  log.updated_at = new Date().toISOString();
  return log;
}

/**
 * Centralized Incident Intelligence & Routing Agent.
 * Idempotent per incident processing cycle; AI only recommends classification while deterministic rules assign departments.
 */
export async function runIncidentIntelligencePipeline(
  store: Store,
  incidentId: number,
  opts: { forceReprocess?: boolean } = {}
): Promise<void> {
  const inc = store.incidents.find((i) => i.id === incidentId);
  if (!inc) return;

  // Idempotency guard against concurrent duplicate runs
  const nowMs = Date.now();
  if (!opts.forceReprocess && inc.processing_lock_at && nowMs - inc.processing_lock_at < 30_000) {
    return;
  }
  if (!opts.forceReprocess && store.incidentAssignments.some((a) => a.incident_id === inc.id && a.status !== "rejected")) {
    return;
  }

  inc.processing_lock_at = nowMs;
  const startMs = Date.now();
  const cfg = store.agentConfig;
  const idempotencyKey = `inc:${inc.id}:${opts.forceReprocess ? nowMs : "initial"}`;

  // Ensure district boundary resolution is populated
  if (!inc.district_id) {
    for (const b of store.boundaries.values()) {
      if (pointInGeometry(inc.latitude, inc.longitude, b.geometry)) {
        inc.district_id = b.district_id;
        inc.district_name = store.districts.find((d) => d.id === b.district_id)?.name ?? null;
        break;
      }
    }
  }

  if (!cfg.enabled) {
    inc.ai_analysis_status = "skipped";
    inc.workflow_status = "awaiting_verification";
    store.agentExecutionLogs.unshift({
      id: store.nextId.agentExecutionLog++,
      incident_id: inc.id,
      incident_code: inc.code,
      idempotency_key: idempotencyKey,
      status: "skipped",
      provider: null,
      model: null,
      recommended_category: null,
      recommended_severity: null,
      confidence: null,
      image_summary: null,
      matched_rule_id: null,
      matched_rule_name: null,
      assigned_department_id: null,
      assigned_department_name: null,
      duration_ms: Date.now() - startMs,
      error_message: "AI Routing Agent is currently disabled in Agent Settings.",
      created_at: new Date().toISOString(),
    });
    if (store.agentExecutionLogs.length > 300) store.agentExecutionLogs.length = 300;
    inc.processing_lock_at = null;
    await saveStoreAsync(store, { scopes: ["incidents", "agent"] });
    return;
  }

  inc.ai_analysis_status = "processing";
  inc.workflow_status = "ai_processing";

  let imageSummary = "";
  let recommendedCategory: IncidentType = inc.type;
  let recommendedSeverity: IncidentSeverity = inc.severity;
  let confidence: number | null = null;
  let reasoning: string | null = null;
  let aiFailedError: string | null = null;
  const groqKey = process.env.GROQ_API_KEY?.trim();

  if (groqKey) {
    try {
      if (cfg.analyze_images_with_vision && inc.media_blobs.length > 0) {
        try {
          const vis = await analyzePhotosWithGroqVision(inc, cfg.vision_model, groqKey);
          imageSummary = vis.summary;
        } catch (vErr) {
          imageSummary = `Vision inspection unavailable (${redactDbError(vErr)})`;
        }
      }
      const cls = await classifyIncidentWithGroq(
        inc,
        inc.district_name,
        imageSummary,
        cfg.classification_model,
        groqKey
      );
      recommendedCategory = cls.recommended_category;
      recommendedSeverity = cls.recommended_severity;
      confidence = cls.confidence;
      reasoning = cls.reasoning;
      inc.ai_analysis_status = "completed";
    } catch (err) {
      aiFailedError = redactDbError(err);
      inc.ai_analysis_status = "failed";
    }
  } else {
    aiFailedError = "GROQ_API_KEY is not configured; placed in human review queue.";
    inc.ai_analysis_status = "failed";
  }

  inc.ai_recommended_category = recommendedCategory;
  inc.ai_recommended_severity = recommendedSeverity;
  inc.ai_confidence = confidence;
  inc.ai_image_summary = imageSummary || null;
  inc.ai_reasoning = reasoning;
  inc.ai_processed_at = new Date().toISOString();

  // If AI failed or human verification is explicitly required before auto-routing
  if (inc.ai_analysis_status === "failed" || cfg.require_human_verification || !cfg.auto_assign) {
    inc.workflow_status = "awaiting_verification";
    if (inc.ai_analysis_status === "failed" && cfg.notify_admin_on_ai_failure) {
      notifyAdmins(store, {
        kind: "system",
        title: `AI analysis requires review for ${inc.code}`,
        body: `${aiFailedError || "Low confidence / verification required"}. Report preserved in review queue.`,
        link: "/admin/departments?tab=monitoring",
      });
    }
    store.agentExecutionLogs.unshift({
      id: store.nextId.agentExecutionLog++,
      incident_id: inc.id,
      incident_code: inc.code,
      idempotency_key: idempotencyKey,
      status: inc.ai_analysis_status === "failed" ? "failed" : "completed",
      provider: groqKey ? "groq" : null,
      model: cfg.classification_model,
      recommended_category: recommendedCategory,
      recommended_severity: recommendedSeverity,
      confidence,
      image_summary: imageSummary || null,
      matched_rule_id: null,
      matched_rule_name: null,
      assigned_department_id: null,
      assigned_department_name: null,
      duration_ms: Date.now() - startMs,
      error_message: aiFailedError,
      created_at: new Date().toISOString(),
    });
    if (store.agentExecutionLogs.length > 300) store.agentExecutionLogs.length = 300;
    inc.processing_lock_at = null;
    await saveStoreAsync(store, { scopes: ["incidents", "notifications", "agent"] });
    return;
  }

  // Deterministic rule evaluation using AI-recommended values when confidence >= threshold, else citizen-submitted values
  const useAi = confidence !== null && confidence >= cfg.confidence_threshold;
  const effectiveCategory = useAi ? recommendedCategory : inc.type;
  const effectiveSeverity = useAi ? recommendedSeverity : inc.severity;

  const decision = evaluateRoutingRules(
    {
      category: effectiveCategory,
      district_id: inc.district_id,
      severity: effectiveSeverity,
      people_affected: inc.people_affected ?? null,
      photo_count: inc.media_blobs.length,
      description: inc.description,
      ai_summary: imageSummary,
    },
    store.routingRules,
    store.departments
  );

  const nowIso = new Date().toISOString();
  if (!decision.matched || !decision.department || !decision.rule) {
    inc.workflow_status = "unassigned";
    if (cfg.notify_admin_on_unassigned) {
      notifyAdmins(store, {
        kind: "incident",
        title: `Unassigned emergency report ${inc.code}`,
        body: `No active routing rule matched ${effectiveCategory} (${effectiveSeverity})${inc.district_name ? ` in ${inc.district_name}` : ""}.`,
        link: "/admin/departments?tab=monitoring",
      });
    }
    store.agentExecutionLogs.unshift({
      id: store.nextId.agentExecutionLog++,
      incident_id: inc.id,
      incident_code: inc.code,
      idempotency_key: idempotencyKey,
      status: "unassigned",
      provider: "groq",
      model: cfg.classification_model,
      recommended_category: recommendedCategory,
      recommended_severity: recommendedSeverity,
      confidence,
      image_summary: imageSummary || null,
      matched_rule_id: null,
      matched_rule_name: null,
      assigned_department_id: null,
      assigned_department_name: null,
      duration_ms: Date.now() - startMs,
      error_message: "No matching routing rule found.",
      created_at: nowIso,
    });
    if (store.agentExecutionLogs.length > 300) store.agentExecutionLogs.length = 300;
    inc.processing_lock_at = null;
    await saveStoreAsync(store, { scopes: ["incidents", "notifications", "agent"] });
    return;
  }

  const dept = decision.department;
  const assignment: IncidentAssignment = {
    id: store.nextId.assignment++,
    incident_id: inc.id,
    incident_code: inc.code,
    incident_type: effectiveCategory,
    district_id: inc.district_id,
    district_name: inc.district_name,
    department_id: dept.id,
    department_name: dept.name,
    backup_department_id: decision.backup_department?.id ?? null,
    routing_rule_id: decision.rule.id,
    routing_rule_name: decision.rule.name,
    status: "assigned",
    priority: decision.effective_priority,
    assigned_personnel: null,
    escalation_minutes: decision.escalation_minutes,
    escalated: false,
    escalation_level: 0,
    last_escalated_at: null,
    assigned_at: nowIso,
    notified_at: null,
    acknowledged_at: null,
    resolved_at: null,
    updated_at: nowIso,
  };
  store.incidentAssignments.unshift(assignment);
  inc.status = "response_assigned";
  inc.workflow_status = "assigned";
  inc.assigned_team = dept.name;
  inc.assigned_department_id = dept.id;
  inc.assigned_department_name = dept.name;
  inc.history = [
    ...(inc.history ?? []),
    {
      status: "response_assigned",
      by_role: "agent",
      note: `Auto-assigned to ${dept.name} via rule "${decision.rule.name}" (${decision.reasons.join(", ") || "rule match"}).`,
      assigned_team: dept.name,
      at: nowIso,
    },
  ];
  addAudit(store, null, "auto_assign", "incident_assignment", assignment.id, {
    incident_code: inc.code,
    department_id: dept.id,
    rule_id: decision.rule.id,
  });

  if (decision.send_notification) {
    await dispatchDepartmentNotifications(store, inc, dept, assignment, "incident_assigned");
  }

  store.agentExecutionLogs.unshift({
    id: store.nextId.agentExecutionLog++,
    incident_id: inc.id,
    incident_code: inc.code,
    idempotency_key: idempotencyKey,
    status: "completed",
    provider: "groq",
    model: cfg.classification_model,
    recommended_category: recommendedCategory,
    recommended_severity: recommendedSeverity,
    confidence,
    image_summary: imageSummary || null,
    matched_rule_id: decision.rule.id,
    matched_rule_name: decision.rule.name,
    assigned_department_id: dept.id,
    assigned_department_name: dept.name,
    duration_ms: Date.now() - startMs,
    error_message: null,
    created_at: nowIso,
  });
  if (store.agentExecutionLogs.length > 300) store.agentExecutionLogs.length = 300;
  inc.processing_lock_at = null;
  invalidateCache("incidents_public");
  await saveStoreAsync(store, {
    scopes: ["incidents", "assignments", "notifications", "integrations", "agent", "audit"],
  });
}

/** Recover pending or stale-locked incidents (>45s) idempotently when coordinator views load. */
export async function recoverStalePendingIncidents(store: Store, maxBatch = 3): Promise<number> {
  if (!store.agentConfig?.enabled) return 0;
  const now = Date.now();
  const stale = store.incidents
    .filter(
      (i) =>
        (i.ai_analysis_status === "pending" ||
          (i.ai_analysis_status === "processing" && i.processing_lock_at && now - i.processing_lock_at > 45_000)) &&
        !store.incidentAssignments.some((a) => a.incident_id === i.id && a.status !== "rejected")
    )
    .slice(0, maxBatch);
  if (stale.length === 0) return 0;
  for (const inc of stale) {
    await runIncidentIntelligencePipeline(store, inc.id);
  }
  return stale.length;
}

/**
 * Evaluate active escalation rules against unacknowledged assignments.
 * Never claims a department responded without an actual acknowledgement record.
 */
export async function runEscalationCheck(store: Store): Promise<number> {
  const candidates = findEscalationCandidates(store.incidentAssignments, store.escalationRules);
  if (candidates.length === 0) return 0;

  let triggered = 0;
  const nowIso = new Date().toISOString();
  for (const { assignment, rule, elapsedMinutes } of candidates) {
    const inc = store.incidents.find((i) => i.id === assignment.incident_id);
    const dept = store.departments.find((d) => d.id === assignment.department_id);
    if (!inc || !dept) continue;

    const backupId = assignment.backup_department_id ?? dept.backup_department_id ?? null;
    const backupDept = backupId ? store.departments.find((d) => d.id === backupId && d.is_active) ?? null : null;

    assignment.escalated = true;
    assignment.escalation_level += 1;
    assignment.last_escalated_at = nowIso;
    assignment.updated_at = nowIso;
    inc.escalated = true;

    const reason = `No acknowledgement from ${dept.name} after ${elapsedMinutes} min (threshold ${rule.timeout_minutes} min for ${rule.severity}).`;
    store.escalationLogs.unshift({
      id: store.nextId.escalationLog++,
      rule_id: rule.id,
      rule_name: rule.name,
      assignment_id: assignment.id,
      incident_id: inc.id,
      incident_code: inc.code,
      department_id: dept.id,
      department_name: dept.name,
      backup_department_id: backupDept?.id ?? null,
      backup_department_name: backupDept?.name ?? null,
      reason,
      created_at: nowIso,
    });
    if (store.escalationLogs.length > 300) store.escalationLogs.length = 300;

    inc.history = [
      ...(inc.history ?? []),
      {
        status: inc.status,
        by_role: "escalation_engine",
        note: reason + (backupDept ? ` Backup notified: ${backupDept.name}.` : ""),
        assigned_team: dept.name,
        at: nowIso,
      },
    ];

    if (rule.notify_admins) {
      notifyAdmins(store, {
        kind: "incident",
        title: `ESCALATED: ${inc.code} (${rule.severity.toUpperCase()})`,
        body: reason,
        link: "/admin/departments?tab=escalations",
      });
    }
    if (rule.notify_backup_department && backupDept) {
      await dispatchDepartmentNotifications(store, inc, backupDept, assignment, "incident_escalated");
    }

    addAudit(store, null, "escalate", "incident_assignment", assignment.id, {
      incident_code: inc.code,
      rule_id: rule.id,
      backup_department_id: backupDept?.id ?? null,
    });
    triggered++;
  }

  if (triggered > 0) {
    await saveStoreAsync(store, { scopes: ["assignments", "incidents", "notifications", "integrations", "agent", "audit"] });
  }
  return triggered;
}
