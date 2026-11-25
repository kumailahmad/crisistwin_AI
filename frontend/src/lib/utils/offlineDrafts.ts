import type { IncidentSeverity, IncidentType } from "../types";

export interface OfflineIncidentDraft {
  local_id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  location_source: "gps" | "map_pin" | "search" | "manual";
  place_text?: string;
  contact_phone?: string;
  people_affected?: number | null;
  saved_at: string;
  sync_state: "local_draft_unsubmitted";
}

const KEY = "ct_offline_incident_drafts";

export function parseDrafts(raw: string | null): OfflineIncidentDraft[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is OfflineIncidentDraft =>
        Boolean(x) &&
        typeof x.local_id === "string" &&
        typeof x.description === "string" &&
        typeof x.latitude === "number" &&
        typeof x.longitude === "number" &&
        x.sync_state === "local_draft_unsubmitted"
    );
  } catch {
    return [];
  }
}

export function createOfflineDraft(input: {
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  location_source: "gps" | "map_pin" | "search" | "manual";
  place_text?: string;
  contact_phone?: string;
  people_affected?: number | null;
}): OfflineIncidentDraft {
  return {
    local_id: `DRAFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: input.type,
    severity: input.severity,
    description: input.description.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_m: input.accuracy_m ?? null,
    location_source: input.location_source,
    place_text: input.place_text?.trim() || undefined,
    contact_phone: input.contact_phone?.trim() || undefined,
    people_affected: input.people_affected ?? null,
    saved_at: new Date().toISOString(),
    sync_state: "local_draft_unsubmitted",
  };
}

export function loadOfflineDrafts(): OfflineIncidentDraft[] {
  if (typeof window === "undefined") return [];
  return parseDrafts(window.localStorage.getItem(KEY));
}

export function saveOfflineDraft(draft: OfflineIncidentDraft): OfflineIncidentDraft[] {
  const next = [draft, ...loadOfflineDrafts().filter((d) => d.local_id !== draft.local_id)].slice(0, 20);
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeOfflineDraft(localId: string): OfflineIncidentDraft[] {
  const next = loadOfflineDrafts().filter((d) => d.local_id !== localId);
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
