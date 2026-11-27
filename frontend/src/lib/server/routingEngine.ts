import type {
  Department,
  EscalationRule,
  IncidentAssignment,
  IncidentSeverity,
  IncidentType,
  RoutingRule,
} from "@/lib/types";

export interface RoutingCandidateInput {
  category: IncidentType;
  district_id: number | null;
  severity: IncidentSeverity;
  people_affected: number | null;
  photo_count: number;
  description: string;
  ai_summary?: string | null;
}

export interface RuleMatchEvaluation {
  rule: RoutingRule;
  department: Department;
  backup_department: Department | null;
  matched: boolean;
  specificity: number;
  reasons: string[];
}

export interface RoutingDecision {
  matched: boolean;
  rule: RoutingRule | null;
  department: Department | null;
  backup_department: Department | null;
  effective_priority: IncidentSeverity;
  escalation_minutes: number | null;
  send_notification: boolean;
  specificity: number;
  reasons: string[];
  evaluated: RuleMatchEvaluation[];
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Deterministic routing rule matcher.
 * Resolves conflicting active rules by:
 *   1. Non-fallback rules always beat fallback rules.
 *   2. Higher specificity (more matched conditions) wins.
 *   3. Lower explicit rule priority_order (1 = highest) breaks ties.
 *   4. Higher department priority_weight breaks remaining ties.
 */
export function evaluateRoutingRules(
  input: RoutingCandidateInput,
  rules: RoutingRule[],
  departments: Department[]
): RoutingDecision {
  const activeDepts = new Map<number, Department>();
  for (const d of departments) {
    if (d.is_active) activeDepts.set(d.id, d);
  }

  const combinedText = `${input.description} ${input.ai_summary ?? ""}`.toLowerCase();
  const evaluated: RuleMatchEvaluation[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const dept = activeDepts.get(rule.target_department_id);
    if (!dept) continue;

    const backupId = rule.backup_department_id ?? dept.backup_department_id ?? null;
    const backup = backupId ? activeDepts.get(backupId) ?? null : null;

    if (rule.is_fallback) {
      evaluated.push({
        rule,
        department: dept,
        backup_department: backup,
        matched: true,
        specificity: 0,
        reasons: ["Fallback rule active"],
      });
      continue;
    }

    let matched = true;
    let specificity = 0;
    const reasons: string[] = [];

    if (rule.incident_categories.length > 0) {
      specificity += 2;
      if (rule.incident_categories.includes(input.category)) {
        reasons.push(`Category = ${input.category}`);
      } else {
        matched = false;
      }
    }

    if (rule.district_ids.length > 0) {
      specificity += 2;
      if (input.district_id !== null && rule.district_ids.includes(input.district_id)) {
        reasons.push(`District #${input.district_id}`);
      } else {
        matched = false;
      }
    }

    if (rule.severities.length > 0) {
      specificity += 1;
      if (rule.severities.includes(input.severity)) {
        reasons.push(`Severity = ${input.severity}`);
      } else {
        matched = false;
      }
    }

    if (rule.min_people_affected !== null && rule.min_people_affected !== undefined && rule.min_people_affected > 0) {
      specificity += 1;
      if ((input.people_affected ?? 0) >= rule.min_people_affected) {
        reasons.push(`People >= ${rule.min_people_affected}`);
      } else {
        matched = false;
      }
    }

    if (rule.require_photos) {
      specificity += 1;
      if (input.photo_count > 0) {
        reasons.push("Has attached photos");
      } else {
        matched = false;
      }
    }

    if (rule.keywords && rule.keywords.trim().length > 0) {
      specificity += 1;
      const kws = rule.keywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const hit = kws.find((kw) => combinedText.includes(kw));
      if (hit) {
        reasons.push(`Keyword "${hit}"`);
      } else {
        matched = false;
      }
    }

    // If a rule has zero conditions and is not marked fallback, verify department capability alignment
    if (specificity === 0) {
      const catOk =
        dept.supported_categories.length === 0 || dept.supported_categories.includes(input.category);
      const distOk =
        dept.assigned_district_ids.length === 0 ||
        (input.district_id !== null && dept.assigned_district_ids.includes(input.district_id));
      if (!catOk || !distOk) matched = false;
      else reasons.push("Matches department coverage");
    }

    evaluated.push({
      rule,
      department: dept,
      backup_department: backup,
      matched,
      specificity,
      reasons,
    });
  }

  const winners = evaluated
    .filter((e) => e.matched)
    .sort((a, b) => {
      if (a.rule.is_fallback !== b.rule.is_fallback) return a.rule.is_fallback ? 1 : -1;
      if (b.specificity !== a.specificity) return b.specificity - a.specificity;
      if (a.rule.priority_order !== b.rule.priority_order) return a.rule.priority_order - b.rule.priority_order;
      return (b.department.priority_weight ?? 0) - (a.department.priority_weight ?? 0);
    });

  const best = winners[0] ?? null;
  if (!best) {
    return {
      matched: false,
      rule: null,
      department: null,
      backup_department: null,
      effective_priority: input.severity,
      escalation_minutes: null,
      send_notification: false,
      specificity: 0,
      reasons: [],
      evaluated,
    };
  }

  const rulePriority = best.rule.set_priority ?? input.severity;
  const effectivePriority =
    SEVERITY_RANK[rulePriority] >= SEVERITY_RANK[input.severity] ? rulePriority : input.severity;

  return {
    matched: true,
    rule: best.rule,
    department: best.department,
    backup_department: best.backup_department,
    effective_priority: effectivePriority,
    escalation_minutes: best.rule.escalation_minutes ?? null,
    send_notification: best.rule.send_notification,
    specificity: best.specificity,
    reasons: best.reasons,
    evaluated,
  };
}

export interface EscalationCandidate {
  assignment: IncidentAssignment;
  rule: EscalationRule;
  elapsedMinutes: number;
}

/**
 * Pure helper to identify unacknowledged assignments that exceeded configured escalation timeouts.
 * Never treats "assigned" or "notified" as responded.
 */
export function findEscalationCandidates(
  assignments: IncidentAssignment[],
  rules: EscalationRule[],
  nowMs = Date.now()
): EscalationCandidate[] {
  const out: EscalationCandidate[] = [];
  const activeRules = rules.filter((r) => r.enabled);
  if (activeRules.length === 0) return out;

  for (const a of assignments) {
    // Only unacknowledged assignments can escalate
    if (a.status !== "assigned" && a.status !== "notified") continue;
    const assignedAtMs = new Date(a.assigned_at).getTime();
    if (!Number.isFinite(assignedAtMs)) continue;
    const elapsedMinutes = Math.max(0, Math.floor((nowMs - assignedAtMs) / 60_000));

    for (const r of activeRules) {
      if (r.severity !== a.priority) continue;
      if (r.department_id !== null && r.department_id !== a.department_id) continue;
      const customTimeout = a.escalation_minutes ?? r.timeout_minutes;
      const effectiveTimeout = Math.min(r.timeout_minutes, customTimeout);
      if (elapsedMinutes < effectiveTimeout) continue;
      if (a.escalation_level > 0 && a.last_escalated_at) {
        // Require at least another timeout interval before re-escalating
        const sinceLast = (nowMs - new Date(a.last_escalated_at).getTime()) / 60_000;
        if (sinceLast < effectiveTimeout) continue;
      }
      out.push({ assignment: a, rule: r, elapsedMinutes });
      break;
    }
  }
  return out;
}
