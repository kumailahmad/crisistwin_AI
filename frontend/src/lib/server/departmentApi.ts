import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "./cryptoSecrets";
import { evaluateRoutingRules } from "./routingEngine";
import {
  dispatchDepartmentNotifications,
  integrationToPublic,
  recoverStalePendingIncidents,
  retryNotificationLog,
  runEscalationCheck,
  runIncidentIntelligencePipeline,
  testNotificationIntegration,
} from "./routingAgent";
import { invalidateCache } from "./responseCache";
import { addAudit, notifyAdmins, pushNotification, type Store, type StoredIncident, type StoredUser } from "./store";
import { validateHttpsExternalUrl } from "./supabaseDb";
import type {
  Department,
  DepartmentAnalytics,
  DepartmentContact,
  DepartmentResponseRecord,
  EscalationRule,
  IncidentAssignment,
  IncidentSeverity,
  IncidentType,
  NotificationChannelType,
  RoutingRule,
  WorkflowStatus,
} from "@/lib/types";

const VALID_CHANNELS = new Set<NotificationChannelType>(["email", "webhook", "sms", "whatsapp", "push"]);
const VALID_SEVERITIES = new Set<IncidentSeverity>(["low", "medium", "high", "critical"]);
const VALID_CATEGORIES = new Set<IncidentType>([
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

function err(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

function sanitizeIncidentForDepartment(inc: StoredIncident) {
  // Strip private citizen PII (user_id, reporter email, etc.) — share only incident & response details
  return {
    id: inc.id,
    code: inc.code,
    type: inc.type,
    severity: inc.severity,
    description: inc.description,
    latitude: inc.latitude,
    longitude: inc.longitude,
    place_text: inc.place_text,
    district_id: inc.district_id,
    district_name: inc.district_name,
    status: inc.status,
    workflow_status: inc.workflow_status ?? "assigned",
    contact_phone: inc.contact_phone,
    people_affected: inc.people_affected,
    ai_image_summary: inc.ai_image_summary ?? null,
    ai_recommended_category: inc.ai_recommended_category ?? null,
    ai_recommended_severity: inc.ai_recommended_severity ?? null,
    escalated: Boolean(inc.escalated),
    photo_count: inc.media_blobs.length,
    created_at: inc.created_at,
    history: inc.history ?? [],
  };
}

export function computeDepartmentAnalytics(
  store: Store,
  filters: {
    district_id?: number | null;
    department_id?: number | null;
    type?: string | null;
    severity?: string | null;
    from?: string | null;
    to?: string | null;
  } = {}
): DepartmentAnalytics {
  const fromMs = filters.from ? new Date(filters.from).getTime() : null;
  const toMs = filters.to ? new Date(filters.to).getTime() + 86_400_000 : null;

  const incidents = store.incidents.filter((i) => {
    if (filters.district_id && i.district_id !== filters.district_id) return false;
    if (filters.department_id && i.assigned_department_id !== filters.department_id) return false;
    if (filters.type && i.type !== filters.type) return false;
    if (filters.severity && i.severity !== filters.severity) return false;
    const ms = new Date(i.created_at).getTime();
    if (fromMs && Number.isFinite(fromMs) && ms < fromMs) return false;
    if (toMs && Number.isFinite(toMs) && ms > toMs) return false;
    return true;
  });

  const incIds = new Set(incidents.map((i) => i.id));
  const assignments = store.incidentAssignments.filter((a) => incIds.has(a.incident_id));

  const deptStatsMap = new Map<
    number,
    { department_id: number; department_name: string; total: number; pending: number; resolved: number; escalated: number }
  >();
  for (const d of store.departments) {
    deptStatsMap.set(d.id, {
      department_id: d.id,
      department_name: d.name,
      total: 0,
      pending: 0,
      resolved: 0,
      escalated: 0,
    });
  }
  for (const a of assignments) {
    const entry = deptStatsMap.get(a.department_id) ?? {
      department_id: a.department_id,
      department_name: a.department_name,
      total: 0,
      pending: 0,
      resolved: 0,
      escalated: 0,
    };
    entry.total++;
    if (a.status === "assigned" || a.status === "notified") entry.pending++;
    if (a.status === "resolved") entry.resolved++;
    if (a.escalated) entry.escalated++;
    deptStatsMap.set(a.department_id, entry);
  }

  return {
    total_reports: incidents.length,
    auto_assigned_reports: assignments.filter((a) => a.routing_rule_id !== null).length,
    unassigned_reports: incidents.filter((i) => i.workflow_status === "unassigned" || (!i.assigned_department_id && i.status === "pending")).length,
    pending_acknowledgements: assignments.filter((a) => a.status === "assigned" || a.status === "notified").length,
    active_escalations: assignments.filter((a) => a.escalated && a.status !== "resolved" && a.status !== "rejected").length,
    resolved_incidents: assignments.filter((a) => a.status === "resolved").length,
    notification_failures: store.notificationLogs.filter((l) => l.status === "failed").length,
    ai_classification_failures: incidents.filter((i) => i.ai_analysis_status === "failed").length,
    by_department: Array.from(deptStatsMap.values()).sort((a, b) => b.total - a.total),
  };
}

export async function handleDepartmentRoutes(params: {
  req: NextRequest;
  segs: string[];
  method: string;
  store: Store;
  requireAdmin: () => StoredUser | NextResponse;
  requireUser: () => StoredUser | NextResponse;
}): Promise<NextResponse | null> {
  const { req, segs, method, store, requireAdmin, requireUser } = params;
  const route = segs.join("/");

  // =========================================================================
  // ADMIN: DEPARTMENT & AGENT MANAGER
  // =========================================================================
  if (segs[0] === "department-manager") {
    const admin = requireAdmin();
    if (admin instanceof NextResponse) return admin;

    // ---- A. DEPARTMENTS ----
    if (route === "department-manager/departments" && method === "GET") {
      const counts = new Map<number, number>();
      for (const a of store.incidentAssignments) {
        counts.set(a.department_id, (counts.get(a.department_id) ?? 0) + 1);
      }
      const list = store.departments.map((d) => ({
        ...d,
        incident_count: counts.get(d.id) ?? 0,
      }));
      return NextResponse.json(list);
    }

    if (route === "department-manager/departments" && method === "POST") {
      const body = (await req.json().catch(() => null)) as Partial<Department> | null;
      if (!body || !body.name || body.name.trim().length < 2) {
        return err(422, "Department name is required (min 2 characters).");
      }
      const name = body.name.trim().slice(0, 120);
      if (store.departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
        return err(409, "A department with this name already exists.");
      }
      const channel: NotificationChannelType = VALID_CHANNELS.has(body.notification_channel as NotificationChannelType)
        ? (body.notification_channel as NotificationChannelType)
        : "email";
      const webhookUrl = body.webhook_url?.trim() || null;
      if (webhookUrl && !validateHttpsExternalUrl(webhookUrl)) {
        return err(422, "Webhook URL must use HTTPS and cannot target local or private network addresses.");
      }
      const email = body.contact_email?.trim().toLowerCase() || null;
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        return err(422, "Primary contact email is invalid.");
      }

      const nowIso = new Date().toISOString();
      const deptId = store.nextId.department++;
      const contacts: DepartmentContact[] = Array.isArray(body.contacts)
        ? body.contacts
            .filter((c) => c && typeof c.name === "string" && c.name.trim())
            .map((c) => ({
              id: store.nextId.contact++,
              department_id: deptId,
              name: c.name.trim().slice(0, 100),
              role_title: c.role_title?.trim().slice(0, 80) || null,
              email: c.email?.trim().toLowerCase() || null,
              phone: c.phone?.trim().slice(0, 30) || null,
              channel_preference: VALID_CHANNELS.has(c.channel_preference) ? c.channel_preference : channel,
              is_primary: Boolean(c.is_primary),
            }))
        : [];

      const dept: Department = {
        id: deptId,
        name,
        description: body.description?.trim().slice(0, 500) || null,
        department_type: body.department_type?.trim().slice(0, 80) || "emergency_response",
        assigned_district_ids: Array.isArray(body.assigned_district_ids)
          ? body.assigned_district_ids.filter((id) => store.districts.some((d) => d.id === Number(id))).map(Number)
          : [],
        supported_categories: Array.isArray(body.supported_categories)
          ? body.supported_categories.filter((c) => VALID_CATEGORIES.has(c))
          : [],
        primary_contact_name: body.primary_contact_name?.trim().slice(0, 100) || null,
        contact_email: email,
        contact_phone: body.contact_phone?.trim().slice(0, 30) || null,
        notification_channel: channel,
        webhook_url: webhookUrl,
        backup_department_id:
          body.backup_department_id && store.departments.some((d) => d.id === Number(body.backup_department_id))
            ? Number(body.backup_department_id)
            : null,
        priority_weight: Number.isFinite(Number(body.priority_weight)) ? Math.max(1, Math.min(100, Number(body.priority_weight))) : 10,
        is_active: body.is_active !== false,
        contacts,
        created_at: nowIso,
        updated_at: nowIso,
      };
      store.departments.push(dept);
      addAudit(store, admin.id, "create", "department", dept.id, { name: dept.name });
      return NextResponse.json({ ...dept, incident_count: 0 }, { status: 201 });
    }

    if (segs[1] === "departments" && segs.length === 3) {
      const did = Number(segs[2]);
      const dept = store.departments.find((d) => d.id === did);
      if (!dept) return err(404, "Department not found");

      if (method === "PATCH") {
        const body = (await req.json().catch(() => null)) as Partial<Department> | null;
        if (!body) return err(400, "Invalid JSON body");

        if (typeof body.name === "string" && body.name.trim().length >= 2) {
          const nextName = body.name.trim().slice(0, 120);
          if (store.departments.some((d) => d.id !== did && d.name.toLowerCase() === nextName.toLowerCase())) {
            return err(409, "Another department already uses this name.");
          }
          dept.name = nextName;
        }
        if ("description" in body) dept.description = body.description?.trim().slice(0, 500) || null;
        if (typeof body.department_type === "string" && body.department_type.trim()) {
          dept.department_type = body.department_type.trim().slice(0, 80);
        }
        if (Array.isArray(body.assigned_district_ids)) {
          dept.assigned_district_ids = body.assigned_district_ids
            .filter((id) => store.districts.some((d) => d.id === Number(id)))
            .map(Number);
        }
        if (Array.isArray(body.supported_categories)) {
          dept.supported_categories = body.supported_categories.filter((c) => VALID_CATEGORIES.has(c));
        }
        if ("primary_contact_name" in body) dept.primary_contact_name = body.primary_contact_name?.trim().slice(0, 100) || null;
        if ("contact_email" in body) {
          const email = body.contact_email?.trim().toLowerCase() || null;
          if (email && !/^\S+@\S+\.\S+$/.test(email)) return err(422, "Contact email is invalid.");
          dept.contact_email = email;
        }
        if ("contact_phone" in body) dept.contact_phone = body.contact_phone?.trim().slice(0, 30) || null;
        if (body.notification_channel && VALID_CHANNELS.has(body.notification_channel)) {
          dept.notification_channel = body.notification_channel;
        }
        if ("webhook_url" in body) {
          const w = body.webhook_url?.trim() || null;
          if (w && !validateHttpsExternalUrl(w)) return err(422, "Webhook URL must use HTTPS and cannot target local or private hosts.");
          dept.webhook_url = w;
        }
        if ("backup_department_id" in body) {
          const bId = body.backup_department_id ? Number(body.backup_department_id) : null;
          if (bId === did) return err(422, "A department cannot be its own backup.");
          dept.backup_department_id = bId && store.departments.some((d) => d.id === bId) ? bId : null;
        }
        if (body.priority_weight !== undefined && Number.isFinite(Number(body.priority_weight))) {
          dept.priority_weight = Math.max(1, Math.min(100, Number(body.priority_weight)));
        }
        if (typeof body.is_active === "boolean") dept.is_active = body.is_active;
        if (Array.isArray(body.contacts)) {
          dept.contacts = body.contacts
            .filter((c) => c && typeof c.name === "string" && c.name.trim())
            .map((c) => ({
              id: c.id && c.id > 0 ? c.id : store.nextId.contact++,
              department_id: did,
              name: c.name.trim().slice(0, 100),
              role_title: c.role_title?.trim().slice(0, 80) || null,
              email: c.email?.trim().toLowerCase() || null,
              phone: c.phone?.trim().slice(0, 30) || null,
              channel_preference: VALID_CHANNELS.has(c.channel_preference) ? c.channel_preference : dept.notification_channel,
              is_primary: Boolean(c.is_primary),
            }));
        }
        dept.updated_at = new Date().toISOString();
        addAudit(store, admin.id, "update", "department", did, { name: dept.name, is_active: dept.is_active });
        return NextResponse.json({
          ...dept,
          incident_count: store.incidentAssignments.filter((a) => a.department_id === did).length,
        });
      }

      if (method === "DELETE") {
        const historyCount = store.incidentAssignments.filter((a) => a.department_id === did).length;
        if (historyCount > 0) {
          return err(
            409,
            `Cannot delete "${dept.name}" because ${historyCount} incident assignment record(s) depend on it. Disable the department instead to preserve audit history.`
          );
        }
        store.departments = store.departments.filter((d) => d.id !== did);
        // Clean references in routing rules / backup / users
        for (const d of store.departments) {
          if (d.backup_department_id === did) d.backup_department_id = null;
        }
        store.routingRules = store.routingRules.filter((r) => r.target_department_id !== did);
        store.escalationRules = store.escalationRules.filter((r) => r.department_id !== did);
        for (const u of store.users) {
          if (u.department_id === did) u.department_id = null;
        }
        addAudit(store, admin.id, "delete", "department", did, { name: dept.name });
        return new NextResponse(null, { status: 204 });
      }
    }

    // ---- B. ROUTING RULES ----
    if (route === "department-manager/rules" && method === "GET") {
      return NextResponse.json([...store.routingRules].sort((a, b) => a.priority_order - b.priority_order));
    }

    if (route === "department-manager/rules" && method === "POST") {
      const body = (await req.json().catch(() => null)) as Partial<RoutingRule> | null;
      if (!body || !body.name || body.name.trim().length < 2) return err(422, "Rule name is required.");
      const targetId = Number(body.target_department_id);
      if (!store.departments.some((d) => d.id === targetId)) {
        return err(422, "Select a valid target department.");
      }
      const nowIso = new Date().toISOString();
      const rule: RoutingRule = {
        id: store.nextId.routingRule++,
        name: body.name.trim().slice(0, 120),
        description: body.description?.trim().slice(0, 400) || null,
        enabled: body.enabled !== false,
        is_fallback: Boolean(body.is_fallback),
        priority_order: Number.isFinite(Number(body.priority_order)) ? Math.max(1, Number(body.priority_order)) : store.routingRules.length + 1,
        incident_categories: Array.isArray(body.incident_categories)
          ? body.incident_categories.filter((c) => VALID_CATEGORIES.has(c))
          : [],
        district_ids: Array.isArray(body.district_ids)
          ? body.district_ids.filter((id) => store.districts.some((d) => d.id === Number(id))).map(Number)
          : [],
        severities: Array.isArray(body.severities) ? body.severities.filter((s) => VALID_SEVERITIES.has(s)) : [],
        min_people_affected:
          body.min_people_affected !== null && body.min_people_affected !== undefined && Number.isFinite(Number(body.min_people_affected))
            ? Math.max(0, Number(body.min_people_affected))
            : null,
        require_photos: Boolean(body.require_photos),
        keywords: body.keywords?.trim().slice(0, 200) || null,
        target_department_id: targetId,
        backup_department_id:
          body.backup_department_id && store.departments.some((d) => d.id === Number(body.backup_department_id))
            ? Number(body.backup_department_id)
            : null,
        set_priority: body.set_priority && VALID_SEVERITIES.has(body.set_priority) ? body.set_priority : null,
        send_notification: body.send_notification !== false,
        escalation_minutes:
          body.escalation_minutes !== null && body.escalation_minutes !== undefined && Number(body.escalation_minutes) > 0
            ? Math.round(Number(body.escalation_minutes))
            : null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      store.routingRules.push(rule);
      addAudit(store, admin.id, "create", "routing_rule", rule.id, { name: rule.name });
      return NextResponse.json(rule, { status: 201 });
    }

    if (route === "department-manager/rules/test" && method === "POST") {
      const body = (await req.json().catch(() => null)) as {
        category?: IncidentType;
        district_id?: number | null;
        severity?: IncidentSeverity;
        people_affected?: number | null;
        photo_count?: number;
        description?: string;
      } | null;
      if (!body) return err(400, "Invalid JSON body");
      const category = VALID_CATEGORIES.has(body.category as IncidentType) ? (body.category as IncidentType) : "flood";
      const severity = VALID_SEVERITIES.has(body.severity as IncidentSeverity) ? (body.severity as IncidentSeverity) : "high";
      const decision = evaluateRoutingRules(
        {
          category,
          district_id: body.district_id ? Number(body.district_id) : null,
          severity,
          people_affected: body.people_affected ?? null,
          photo_count: body.photo_count ?? 0,
          description: body.description?.trim() || "Test rule evaluation",
        },
        store.routingRules,
        store.departments
      );
      return NextResponse.json({
        matched: decision.matched,
        matched_rule: decision.rule,
        assigned_department: decision.department,
        backup_department: decision.backup_department,
        effective_priority: decision.effective_priority,
        escalation_minutes: decision.escalation_minutes,
        specificity: decision.specificity,
        reasons: decision.reasons,
        evaluated: decision.evaluated.map((e) => ({
          rule_id: e.rule.id,
          rule_name: e.rule.name,
          is_fallback: e.rule.is_fallback,
          priority_order: e.rule.priority_order,
          department_name: e.department.name,
          matched: e.matched,
          specificity: e.specificity,
          reasons: e.reasons,
        })),
      });
    }

    if (segs[1] === "rules" && segs.length === 4 && segs[3] === "duplicate" && method === "POST") {
      const rid = Number(segs[2]);
      const src = store.routingRules.find((r) => r.id === rid);
      if (!src) return err(404, "Routing rule not found");
      const nowIso = new Date().toISOString();
      const copy: RoutingRule = {
        ...src,
        id: store.nextId.routingRule++,
        name: `${src.name} (Copy)`,
        priority_order: store.routingRules.length + 1,
        enabled: false,
        created_at: nowIso,
        updated_at: nowIso,
      };
      store.routingRules.push(copy);
      addAudit(store, admin.id, "duplicate", "routing_rule", copy.id, { source_id: rid });
      return NextResponse.json(copy, { status: 201 });
    }

    if (segs[1] === "rules" && segs.length === 3) {
      const rid = Number(segs[2]);
      const rule = store.routingRules.find((r) => r.id === rid);
      if (!rule) return err(404, "Routing rule not found");
      if (method === "PATCH") {
        const body = (await req.json().catch(() => null)) as Partial<RoutingRule> | null;
        if (!body) return err(400, "Invalid JSON body");
        if (typeof body.name === "string" && body.name.trim().length >= 2) rule.name = body.name.trim().slice(0, 120);
        if ("description" in body) rule.description = body.description?.trim().slice(0, 400) || null;
        if (typeof body.enabled === "boolean") rule.enabled = body.enabled;
        if (typeof body.is_fallback === "boolean") rule.is_fallback = body.is_fallback;
        if (body.priority_order !== undefined && Number.isFinite(Number(body.priority_order))) {
          rule.priority_order = Math.max(1, Number(body.priority_order));
        }
        if (Array.isArray(body.incident_categories)) {
          rule.incident_categories = body.incident_categories.filter((c) => VALID_CATEGORIES.has(c));
        }
        if (Array.isArray(body.district_ids)) {
          rule.district_ids = body.district_ids.filter((id) => store.districts.some((d) => d.id === Number(id))).map(Number);
        }
        if (Array.isArray(body.severities)) {
          rule.severities = body.severities.filter((s) => VALID_SEVERITIES.has(s));
        }
        if ("min_people_affected" in body) {
          rule.min_people_affected =
            body.min_people_affected !== null && body.min_people_affected !== undefined
              ? Math.max(0, Number(body.min_people_affected))
              : null;
        }
        if (typeof body.require_photos === "boolean") rule.require_photos = body.require_photos;
        if ("keywords" in body) rule.keywords = body.keywords?.trim().slice(0, 200) || null;
        if (body.target_department_id && store.departments.some((d) => d.id === Number(body.target_department_id))) {
          rule.target_department_id = Number(body.target_department_id);
        }
        if ("backup_department_id" in body) {
          rule.backup_department_id =
            body.backup_department_id && store.departments.some((d) => d.id === Number(body.backup_department_id))
              ? Number(body.backup_department_id)
              : null;
        }
        if ("set_priority" in body) {
          rule.set_priority = body.set_priority && VALID_SEVERITIES.has(body.set_priority) ? body.set_priority : null;
        }
        if (typeof body.send_notification === "boolean") rule.send_notification = body.send_notification;
        if ("escalation_minutes" in body) {
          rule.escalation_minutes =
            body.escalation_minutes && Number(body.escalation_minutes) > 0 ? Math.round(Number(body.escalation_minutes)) : null;
        }
        rule.updated_at = new Date().toISOString();
        addAudit(store, admin.id, "update", "routing_rule", rid, { name: rule.name });
        return NextResponse.json(rule);
      }
      if (method === "DELETE") {
        store.routingRules = store.routingRules.filter((r) => r.id !== rid);
        addAudit(store, admin.id, "delete", "routing_rule", rid, { name: rule.name });
        return new NextResponse(null, { status: 204 });
      }
    }

    // ---- C. NOTIFICATION INTEGRATIONS ----
    if (route === "department-manager/integrations" && method === "GET") {
      return NextResponse.json(store.notificationIntegrations.map(integrationToPublic));
    }

    if (route === "department-manager/integrations" && method === "POST") {
      const body = (await req.json().catch(() => null)) as {
        name?: string;
        channel?: NotificationChannelType;
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
      } | null;
      if (!body || !body.name || body.name.trim().length < 2) return err(422, "Integration name is required.");
      if (!body.channel || !VALID_CHANNELS.has(body.channel)) return err(422, "Invalid channel.");
      const endpoint = body.endpoint_url?.trim() || null;
      if (endpoint && !validateHttpsExternalUrl(endpoint)) {
        return err(422, "Endpoint URL must be public HTTPS.");
      }
      const nowIso = new Date().toISOString();
      const created = {
        id: store.nextId.integration++,
        name: body.name.trim().slice(0, 120),
        channel: body.channel,
        provider_name: body.provider_name?.trim().slice(0, 80) || body.channel,
        enabled: body.enabled !== false,
        connection_status: "unverified" as const,
        last_verified_at: null,
        last_error: null,
        endpoint_url: endpoint,
        sender_identity: body.sender_identity?.trim().slice(0, 160) || null,
        default_recipients: Array.isArray(body.default_recipients)
          ? body.default_recipients.map((r) => r.trim()).filter(Boolean).slice(0, 20)
          : [],
        event_triggers: Array.isArray(body.event_triggers)
          ? body.event_triggers.map((t) => t.trim()).filter(Boolean)
          : ["incident_assigned", "incident_escalated"],
        department_ids: Array.isArray(body.department_ids) ? body.department_ids.map(Number).filter(Boolean) : [],
        encrypted_api_key: body.api_key?.trim() ? encryptSecret(body.api_key) : null,
        encrypted_auth_token: body.auth_token?.trim() ? encryptSecret(body.auth_token) : null,
        account_sid: body.account_sid?.trim().slice(0, 120) || null,
        has_api_key: Boolean(body.api_key?.trim()),
        api_key_hint: null,
        has_auth_token: Boolean(body.auth_token?.trim()),
        auth_token_hint: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      store.notificationIntegrations.push(created);
      addAudit(store, admin.id, "create", "notification_integration", created.id, { name: created.name, channel: created.channel });
      return NextResponse.json(integrationToPublic(created), { status: 201 });
    }

    if (segs[1] === "integrations" && segs.length === 4 && segs[3] === "test" && method === "POST") {
      const iid = Number(segs[2]);
      const intg = store.notificationIntegrations.find((i) => i.id === iid);
      if (!intg) return err(404, "Integration not found");
      const body = (await req.json().catch(() => ({}))) as { test_recipient?: string };
      const res = await testNotificationIntegration(store, intg, body?.test_recipient);
      addAudit(store, admin.id, "test", "notification_integration", iid, { ok: res.ok });
      return NextResponse.json({
        ok: res.ok,
        error: res.error,
        response: res.response,
        integration: integrationToPublic(intg),
      });
    }

    if (segs[1] === "integrations" && segs.length === 3) {
      const iid = Number(segs[2]);
      const intg = store.notificationIntegrations.find((i) => i.id === iid);
      if (!intg) return err(404, "Integration not found");
      if (method === "PATCH") {
        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return err(400, "Invalid JSON body");
        let credsOrEndpointChanged = false;
        if (typeof body.name === "string" && body.name.trim().length >= 2) intg.name = body.name.trim().slice(0, 120);
        if (typeof body.provider_name === "string" && body.provider_name.trim()) {
          intg.provider_name = body.provider_name.trim().slice(0, 80);
        }
        if (typeof body.enabled === "boolean") intg.enabled = body.enabled;
        if ("endpoint_url" in body) {
          const ep = typeof body.endpoint_url === "string" ? body.endpoint_url.trim() || null : null;
          if (ep && !validateHttpsExternalUrl(ep)) return err(422, "Endpoint URL must be public HTTPS.");
          if (ep !== intg.endpoint_url) credsOrEndpointChanged = true;
          intg.endpoint_url = ep;
        }
        if ("sender_identity" in body) {
          intg.sender_identity = typeof body.sender_identity === "string" ? body.sender_identity.trim().slice(0, 160) || null : null;
        }
        if (Array.isArray(body.default_recipients)) {
          intg.default_recipients = body.default_recipients.map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
        }
        if (Array.isArray(body.event_triggers)) {
          intg.event_triggers = body.event_triggers.map((x) => String(x).trim()).filter(Boolean);
        }
        if (Array.isArray(body.department_ids)) {
          intg.department_ids = body.department_ids.map(Number).filter(Boolean);
        }
        if (typeof body.api_key === "string" && body.api_key.trim()) {
          intg.encrypted_api_key = encryptSecret(body.api_key);
          credsOrEndpointChanged = true;
        }
        if (typeof body.auth_token === "string" && body.auth_token.trim()) {
          intg.encrypted_auth_token = encryptSecret(body.auth_token);
          credsOrEndpointChanged = true;
        }
        if ("account_sid" in body) {
          const sid = typeof body.account_sid === "string" ? body.account_sid.trim().slice(0, 120) || null : null;
          if (sid !== intg.account_sid) credsOrEndpointChanged = true;
          intg.account_sid = sid;
        }
        if (credsOrEndpointChanged) {
          intg.connection_status = "unverified";
          intg.last_error = null;
        }
        intg.updated_at = new Date().toISOString();
        addAudit(store, admin.id, "update", "notification_integration", iid, { enabled: intg.enabled });
        return NextResponse.json(integrationToPublic(intg));
      }
      if (method === "DELETE") {
        store.notificationIntegrations = store.notificationIntegrations.filter((i) => i.id !== iid);
        addAudit(store, admin.id, "delete", "notification_integration", iid, { name: intg.name });
        return new NextResponse(null, { status: 204 });
      }
    }

    // ---- D. AI AGENT SETTINGS & EXECUTION LOGS ----
    if (route === "department-manager/agent-config") {
      if (method === "GET") {
        return NextResponse.json({
          config: store.agentConfig,
          groq_configured: Boolean(process.env.GROQ_API_KEY?.trim()),
          execution_logs: store.agentExecutionLogs.slice(0, 100),
        });
      }
      if (method === "PATCH") {
        const body = (await req.json().catch(() => null)) as Partial<typeof store.agentConfig> | null;
        if (!body) return err(400, "Invalid JSON body");
        if (typeof body.enabled === "boolean") store.agentConfig.enabled = body.enabled;
        if (typeof body.auto_assign === "boolean") store.agentConfig.auto_assign = body.auto_assign;
        if (typeof body.require_human_verification === "boolean") {
          store.agentConfig.require_human_verification = body.require_human_verification;
        }
        if (typeof body.analyze_images_with_vision === "boolean") {
          store.agentConfig.analyze_images_with_vision = body.analyze_images_with_vision;
        }
        if (typeof body.classification_model === "string" && body.classification_model.trim()) {
          store.agentConfig.classification_model = body.classification_model.trim().slice(0, 100);
        }
        if (typeof body.vision_model === "string" && body.vision_model.trim()) {
          store.agentConfig.vision_model = body.vision_model.trim().slice(0, 100);
        }
        if (typeof body.confidence_threshold === "number" && body.confidence_threshold >= 0 && body.confidence_threshold <= 1) {
          store.agentConfig.confidence_threshold = Math.round(body.confidence_threshold * 100) / 100;
        }
        if (typeof body.max_notification_retries === "number" && body.max_notification_retries >= 1 && body.max_notification_retries <= 5) {
          store.agentConfig.max_notification_retries = Math.round(body.max_notification_retries);
        }
        if (typeof body.notify_admin_on_unassigned === "boolean") {
          store.agentConfig.notify_admin_on_unassigned = body.notify_admin_on_unassigned;
        }
        if (typeof body.notify_admin_on_ai_failure === "boolean") {
          store.agentConfig.notify_admin_on_ai_failure = body.notify_admin_on_ai_failure;
        }
        store.agentConfig.updated_at = new Date().toISOString();
        addAudit(store, admin.id, "update", "agent_config", 1, body);
        return NextResponse.json({
          config: store.agentConfig,
          groq_configured: Boolean(process.env.GROQ_API_KEY?.trim()),
          execution_logs: store.agentExecutionLogs.slice(0, 100),
        });
      }
    }

    // ---- E. ASSIGNMENT MONITORING & MANUAL / RE-RUN ACTIONS ----
    if (route === "department-manager/assignments" && method === "GET") {
      await recoverStalePendingIncidents(store, 3);
      await runEscalationCheck(store);
      const sp = req.nextUrl.searchParams;
      const did = sp.get("district_id") ? Number(sp.get("district_id")) : null;
      const deptId = sp.get("department_id") ? Number(sp.get("department_id")) : null;
      const type = sp.get("type") || null;
      const severity = sp.get("severity") || null;
      const from = sp.get("from") || null;
      const to = sp.get("to") || null;
      const fromMs = from ? new Date(from).getTime() : null;
      const toMs = to ? new Date(to).getTime() + 86_400_000 : null;

      const filteredAssignments = store.incidentAssignments.filter((a) => {
        if (did && a.district_id !== did) return false;
        if (deptId && a.department_id !== deptId) return false;
        if (type && a.incident_type !== type) return false;
        if (severity && a.priority !== severity) return false;
        const ms = new Date(a.assigned_at).getTime();
        if (fromMs && Number.isFinite(fromMs) && ms < fromMs) return false;
        if (toMs && Number.isFinite(toMs) && ms > toMs) return false;
        return true;
      });

      const unassignedIncidents = store.incidents
        .filter((i) => {
          if (did && i.district_id !== did) return false;
          if (type && i.type !== type) return false;
          if (severity && i.severity !== severity) return false;
          return !store.incidentAssignments.some((a) => a.incident_id === i.id && a.status !== "rejected");
        })
        .slice(0, 100)
        .map((i) => ({
          id: i.id,
          code: i.code,
          type: i.type,
          severity: i.severity,
          district_name: i.district_name,
          status: i.status,
          workflow_status: i.workflow_status ?? "submitted",
          ai_analysis_status: i.ai_analysis_status ?? "pending",
          ai_recommended_category: i.ai_recommended_category ?? null,
          ai_recommended_severity: i.ai_recommended_severity ?? null,
          ai_confidence: i.ai_confidence ?? null,
          ai_image_summary: i.ai_image_summary ?? null,
          created_at: i.created_at,
        }));

      const analytics = computeDepartmentAnalytics(store, {
        district_id: did,
        department_id: deptId,
        type,
        severity,
        from,
        to,
      });

      return NextResponse.json({
        analytics,
        assignments: filteredAssignments.slice(0, 200),
        unassigned_incidents: unassignedIncidents,
        responses: store.departmentResponses.slice(0, 150),
      });
    }

    if (segs[1] === "incidents" && segs.length === 4 && segs[3] === "process" && method === "POST") {
      const iid = Number(segs[2]);
      const inc = store.incidents.find((i) => i.id === iid);
      if (!inc) return err(404, "Incident not found");
      await runIncidentIntelligencePipeline(store, iid, { forceReprocess: true });
      addAudit(store, admin.id, "reprocess_agent", "incident", iid, { code: inc.code });
      return NextResponse.json({
        incident_id: inc.id,
        workflow_status: inc.workflow_status,
        ai_analysis_status: inc.ai_analysis_status,
        assigned_department_id: inc.assigned_department_id ?? null,
        assigned_department_name: inc.assigned_department_name ?? null,
      });
    }

    if (segs[1] === "incidents" && segs.length === 4 && segs[3] === "assign" && method === "POST") {
      const iid = Number(segs[2]);
      const inc = store.incidents.find((i) => i.id === iid);
      if (!inc) return err(404, "Incident not found");
      const body = (await req.json().catch(() => null)) as {
        department_id?: number;
        priority?: IncidentSeverity;
        send_notification?: boolean;
        escalation_minutes?: number | null;
      } | null;
      if (!body || !body.department_id) return err(422, "department_id is required.");
      const dept = store.departments.find((d) => d.id === Number(body.department_id));
      if (!dept) return err(404, "Department not found");

      const nowIso = new Date().toISOString();
      const prio: IncidentSeverity =
        body.priority && VALID_SEVERITIES.has(body.priority) ? body.priority : inc.severity;
      const assignment: IncidentAssignment = {
        id: store.nextId.assignment++,
        incident_id: inc.id,
        incident_code: inc.code,
        incident_type: inc.type,
        district_id: inc.district_id,
        district_name: inc.district_name,
        department_id: dept.id,
        department_name: dept.name,
        backup_department_id: dept.backup_department_id ?? null,
        routing_rule_id: null,
        routing_rule_name: "Manual admin assignment",
        status: "assigned",
        priority: prio,
        assigned_personnel: null,
        escalation_minutes: body.escalation_minutes ?? null,
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
          by_role: "admin",
          note: `Manually assigned to ${dept.name}.`,
          assigned_team: dept.name,
          at: nowIso,
        },
      ];
      addAudit(store, admin.id, "manual_assign", "incident_assignment", assignment.id, {
        incident_code: inc.code,
        department_id: dept.id,
      });

      if (body.send_notification !== false) {
        await dispatchDepartmentNotifications(store, inc, dept, assignment, "incident_assigned");
      }
      invalidateCache("incidents_public");
      return NextResponse.json(assignment, { status: 201 });
    }

    // ---- F. ESCALATION SETTINGS & ENGINE ----
    if (route === "department-manager/escalations" && method === "GET") {
      await runEscalationCheck(store);
      return NextResponse.json({
        rules: store.escalationRules,
        logs: store.escalationLogs.slice(0, 150),
      });
    }

    if (route === "department-manager/escalations/rules" && method === "POST") {
      const body = (await req.json().catch(() => null)) as Partial<EscalationRule> | null;
      if (!body || !body.name || body.name.trim().length < 2) return err(422, "Escalation rule name is required.");
      const severity = VALID_SEVERITIES.has(body.severity as IncidentSeverity) ? (body.severity as IncidentSeverity) : "critical";
      const timeout = Math.max(1, Math.min(1440, Math.round(Number(body.timeout_minutes || 15))));
      const nowIso = new Date().toISOString();
      const rule: EscalationRule = {
        id: store.nextId.escalationRule++,
        name: body.name.trim().slice(0, 120),
        enabled: body.enabled !== false,
        severity,
        department_id:
          body.department_id && store.departments.some((d) => d.id === Number(body.department_id))
            ? Number(body.department_id)
            : null,
        timeout_minutes: timeout,
        notify_admins: body.notify_admins !== false,
        notify_backup_department: body.notify_backup_department !== false,
        created_at: nowIso,
        updated_at: nowIso,
      };
      store.escalationRules.push(rule);
      addAudit(store, admin.id, "create", "escalation_rule", rule.id, { name: rule.name });
      return NextResponse.json(rule, { status: 201 });
    }

    if (segs[1] === "escalations" && segs[2] === "rules" && segs.length === 4) {
      const eid = Number(segs[3]);
      const rule = store.escalationRules.find((r) => r.id === eid);
      if (!rule) return err(404, "Escalation rule not found");
      if (method === "PATCH") {
        const body = (await req.json().catch(() => null)) as Partial<EscalationRule> | null;
        if (!body) return err(400, "Invalid JSON body");
        if (typeof body.name === "string" && body.name.trim().length >= 2) rule.name = body.name.trim().slice(0, 120);
        if (typeof body.enabled === "boolean") rule.enabled = body.enabled;
        if (body.severity && VALID_SEVERITIES.has(body.severity)) rule.severity = body.severity;
        if ("department_id" in body) {
          rule.department_id =
            body.department_id && store.departments.some((d) => d.id === Number(body.department_id))
              ? Number(body.department_id)
              : null;
        }
        if (body.timeout_minutes !== undefined && Number(body.timeout_minutes) >= 1) {
          rule.timeout_minutes = Math.min(1440, Math.round(Number(body.timeout_minutes)));
        }
        if (typeof body.notify_admins === "boolean") rule.notify_admins = body.notify_admins;
        if (typeof body.notify_backup_department === "boolean") {
          rule.notify_backup_department = body.notify_backup_department;
        }
        rule.updated_at = new Date().toISOString();
        return NextResponse.json(rule);
      }
      if (method === "DELETE") {
        store.escalationRules = store.escalationRules.filter((r) => r.id !== eid);
        return new NextResponse(null, { status: 204 });
      }
    }

    if (route === "department-manager/escalations/run" && method === "POST") {
      const triggered = await runEscalationCheck(store);
      addAudit(store, admin.id, "run_escalation_check", "escalation", null, { triggered });
      return NextResponse.json({ triggered, logs: store.escalationLogs.slice(0, 150) });
    }

    // ---- G. DELIVERY LOGS ----
    if (route === "department-manager/delivery-logs" && method === "GET") {
      const sp = req.nextUrl.searchParams;
      const channel = sp.get("channel");
      const status = sp.get("status");
      let rows = [...store.notificationLogs];
      if (channel) rows = rows.filter((l) => l.channel === channel);
      if (status) rows = rows.filter((l) => l.status === status);
      return NextResponse.json(rows.slice(0, 250));
    }

    if (segs[1] === "delivery-logs" && segs.length === 4 && segs[3] === "retry" && method === "POST") {
      const lid = Number(segs[2]);
      const log = store.notificationLogs.find((l) => l.id === lid);
      if (!log) return err(404, "Delivery log not found");
      const updated = await retryNotificationLog(store, log);
      addAudit(store, admin.id, "retry_notification", "notification_log", lid, { status: updated.status });
      return NextResponse.json(updated);
    }
  }

  // =========================================================================
  // DEPARTMENT RESPONSE PORTAL (/api/v1/department-portal/*)
  // =========================================================================
  if (segs[0] === "department-portal") {
    const u = requireUser();
    if (u instanceof NextResponse) return u;
    if (u.role !== "department" && u.role !== "admin") {
      return err(403, "Department officer or administrator access required.");
    }
    if (u.role === "department" && !u.department_id) {
      return err(403, "Your account is not linked to a department yet. Contact an administrator.");
    }

    if (route === "department-portal/assignments" && method === "GET") {
      const sp = req.nextUrl.searchParams;
      const filterDeptId = u.role === "department" ? u.department_id! : sp.get("department_id") ? Number(sp.get("department_id")) : null;
      const dept = filterDeptId ? store.departments.find((d) => d.id === filterDeptId) ?? null : null;

      const list = store.incidentAssignments
        .filter((a) => !filterDeptId || a.department_id === filterDeptId || a.backup_department_id === filterDeptId)
        .slice(0, 200)
        .map((a) => {
          const inc = store.incidents.find((i) => i.id === a.incident_id);
          const responses = store.departmentResponses.filter((r) => r.assignment_id === a.id);
          return {
            assignment: a,
            incident: inc ? sanitizeIncidentForDepartment(inc) : null,
            responses,
          };
        });

      return NextResponse.json({
        department: dept,
        departments: u.role === "admin" ? store.departments : dept ? [dept] : [],
        items: list,
      });
    }

    if (segs[1] === "assignments" && segs.length === 4 && segs[3] === "respond" && method === "POST") {
      const aid = Number(segs[2]);
      const assignment = store.incidentAssignments.find((a) => a.id === aid);
      if (!assignment) return err(404, "Assignment not found");

      if (
        u.role === "department" &&
        assignment.department_id !== u.department_id &&
        assignment.backup_department_id !== u.department_id
      ) {
        return err(403, "You can only respond to reports assigned to your department.");
      }

      const inc = store.incidents.find((i) => i.id === assignment.incident_id);
      if (!inc) return err(404, "Linked incident not found");

      const body = (await req.json().catch(() => null)) as {
        action?: DepartmentResponseRecord["action"];
        status?: WorkflowStatus;
        assigned_personnel?: string | null;
        note?: string | null;
      } | null;
      if (!body || !body.action) return err(422, "action is required.");

      const allowedActions = new Set<DepartmentResponseRecord["action"]>([
        "accepted",
        "rejected",
        "request_info",
        "status_update",
        "assigned_personnel",
        "note",
        "resolved",
      ]);
      if (!allowedActions.has(body.action)) return err(422, "Invalid response action.");
      if (body.action === "rejected" && (!body.note || body.note.trim().length < 3)) {
        return err(422, "Please provide a reason when rejecting an assignment.");
      }

      const nowIso = new Date().toISOString();
      let nextStatus: WorkflowStatus = assignment.status;
      if (body.action === "accepted") {
        nextStatus = "accepted";
        assignment.acknowledged_at = assignment.acknowledged_at ?? nowIso;
      } else if (body.action === "rejected") {
        nextStatus = "rejected";
        assignment.acknowledged_at = assignment.acknowledged_at ?? nowIso;
      } else if (body.action === "resolved") {
        nextStatus = "resolved";
        assignment.acknowledged_at = assignment.acknowledged_at ?? nowIso;
        assignment.resolved_at = nowIso;
        inc.status = "resolved";
      } else if (body.action === "status_update" && body.status) {
        nextStatus = body.status;
        if (body.status === "accepted" || body.status === "in_progress") {
          assignment.acknowledged_at = assignment.acknowledged_at ?? nowIso;
        }
        if (body.status === "resolved") {
          assignment.resolved_at = nowIso;
          inc.status = "resolved";
        }
      }

      assignment.status = nextStatus;
      inc.workflow_status = nextStatus;
      if ("assigned_personnel" in body && body.assigned_personnel !== undefined) {
        assignment.assigned_personnel = body.assigned_personnel?.trim().slice(0, 120) || null;
      }
      assignment.updated_at = nowIso;

      const rec: DepartmentResponseRecord = {
        id: store.nextId.departmentResponse++,
        assignment_id: assignment.id,
        incident_id: inc.id,
        department_id: assignment.department_id,
        user_id: u.id,
        user_name: u.full_name || u.email,
        action: body.action,
        status_after: nextStatus,
        assigned_personnel: assignment.assigned_personnel,
        note: body.note?.trim().slice(0, 600) || null,
        created_at: nowIso,
      };
      store.departmentResponses.unshift(rec);
      if (store.departmentResponses.length > 1000) store.departmentResponses.length = 1000;

      inc.history = [
        ...(inc.history ?? []),
        {
          status: inc.status,
          by_role: `${assignment.department_name} (${u.full_name || u.email})`,
          note:
            rec.note ||
            `${body.action.replace(/_/g, " ")}${rec.assigned_personnel ? ` · Personnel: ${rec.assigned_personnel}` : ""}`,
          assigned_team: assignment.department_name,
          at: nowIso,
        },
      ];

      addAudit(store, u.id, `dept_${body.action}`, "incident_assignment", assignment.id, {
        incident_code: inc.code,
        status_after: nextStatus,
        personnel: rec.assigned_personnel,
      });

      if (body.action === "rejected" || body.action === "request_info") {
        if (body.action === "rejected") {
          inc.workflow_status = "unassigned";
          inc.assigned_department_id = null;
          inc.assigned_department_name = null;
          inc.assigned_team = null;
          inc.status = "under_review";
        }
        notifyAdmins(store, {
          kind: "incident",
          title:
            body.action === "rejected"
              ? `${assignment.department_name} rejected ${inc.code}`
              : `${assignment.department_name} requested info on ${inc.code}`,
          body: rec.note || "Action required in Department & Agent Manager.",
          link: "/admin/departments?tab=monitoring",
        });
      }

      // Notify citizen reporter if they opted into updates
      const reporter = inc.user_id !== null ? store.users.find((x) => x.id === inc.user_id) : null;
      if (reporter && reporter.notification_prefs.incident_updates) {
        pushNotification(store, {
          user_id: reporter.id,
          kind: "incident",
          title: `Update on ${inc.code}: ${nextStatus.replace(/_/g, " ")}`,
          body: `${assignment.department_name}${rec.note ? ` — ${rec.note.slice(0, 120)}` : ""}`,
          link: "/report#track",
        });
      }

      invalidateCache("incidents_public");
      return NextResponse.json({
        assignment,
        incident: sanitizeIncidentForDepartment(inc),
        response: rec,
      });
    }
  }

  return null;
}
