import { api } from "@/lib/api/client";
import { isDemo } from "@/lib/auth/token";
import { assess, DISCLAIMER as RISK_DISCLAIMER } from "@/lib/demo/riskEngine";
import { demoStore } from "@/lib/demo/store";
import type {
  AdminStats, AuditLog, ChatReply, Dataset, District, Incident, IncidentSeverity, IncidentStatus, IncidentType, Overview, Resource, ResourceInput, RiskAssessment, RiskInputs, Simulation, SimulationInput, SimulationResults, User,
} from "@/lib/types";

export type BoundaryProps = { district_id: number | null; name: string; source: string; verified: boolean };
export type BoundaryCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, BoundaryProps>;
export type BoundaryOrigin = "api" | "open-data";

// ---------- static open-data boundaries (geoBoundaries ADM2, CC BY 4.0) ----------
type OpenFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string; area_km2_approx: number; centroid: [number, number]; source: string }>;
export type OpenCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, OpenFeature["properties"]>;
let openCache: Promise<OpenCollection> | null = null;
export const loadOpenBoundaries = (): Promise<OpenCollection> => (openCache ??= fetch("/data/districts.geojson").then((r) => r.json() as Promise<OpenCollection>));
export const loadProvinceOutline = () => fetch("/data/balochistan.geojson").then((r) => r.json() as Promise<GeoJSON.Feature>);

async function demoDistricts(): Promise<District[]> {
  const fc = await loadOpenBoundaries();
  return fc.features.map((f, i) => ({
    id: i + 1, name: f.properties.name, province: "Balochistan", area_km2: f.properties.area_km2_approx, population: null,
    data_source: f.properties.source, verified: false, has_boundary: true,
  }));
}

export const auth = {
  login: (email: string, password: string) => api<{ access_token: string }>("/auth/login", { method: "POST", json: { email, password } }),
  register: (email: string, password: string, full_name?: string) => api<User>("/auth/register", { method: "POST", json: { email, password, full_name } }),
  me: () => api<User>("/auth/me"),
};

export const districts = {
  list: async (): Promise<District[]> => (isDemo() ? demoDistricts() : api<District[]>("/districts")),
  /** Boundaries for the map. Falls back to the bundled open-data set if none are stored in the backend yet. */
  boundaries: async (list: District[]): Promise<{ fc: BoundaryCollection; origin: BoundaryOrigin }> => {
    if (!isDemo()) {
      try {
        const fc = await api<GeoJSON.FeatureCollection>("/districts/boundaries/all");
        if (fc.features.length) return { fc: fc as unknown as BoundaryCollection, origin: "api" };
      } catch { /* fall through to open data */ }
    }
    const open = await loadOpenBoundaries();
    const byName = new Map(list.map((d) => [d.name.toLowerCase(), d]));
    return {
      origin: "open-data",
      fc: {
        type: "FeatureCollection",
        features: open.features.map((f) => {
          const d = byName.get(f.properties.name.toLowerCase());
          return { type: "Feature", geometry: f.geometry, properties: { district_id: d?.id ?? null, name: f.properties.name, source: f.properties.source, verified: false } };
        }),
      },
    };
  },
  create: (b: { name: string; area_km2?: number | null; population?: number | null; data_source?: string | null; verified?: boolean }) => api<District>("/districts", { method: "POST", json: b }),
  update: (id: number, b: Partial<Pick<District, "area_km2" | "population" | "data_source" | "verified">>) => api<District>(`/districts/${id}`, { method: "PATCH", json: b }),
  remove: (id: number) => api<void>(`/districts/${id}`, { method: "DELETE" }),
  setBoundary: (id: number, geometry: unknown, source: string) => api<void>(`/districts/${id}/boundary`, { method: "PUT", json: { geometry, source } }),
};

export const resources = {
  list: async (p: { type?: string; q?: string; district_id?: number } = {}): Promise<Resource[]> => {
    if (isDemo()) return []; // no verified resource data is bundled; nothing is invented
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
    return api<Resource[]>(`/resources?${qs}`);
  },
  create: (b: ResourceInput) => api<Resource>("/resources", { method: "POST", json: b }),
  update: (id: number, b: ResourceInput) => api<Resource>(`/resources/${id}`, { method: "PUT", json: b }),
  remove: (id: number) => api<void>(`/resources/${id}`, { method: "DELETE" }),
  bulk: (items: ResourceInput[]) => api<{ created: number }>("/resources/bulk", { method: "POST", json: { items } }),
};

export const risk = {
  assess: async (b: RiskInputs): Promise<RiskAssessment> => {
    if (!isDemo()) return api<RiskAssessment>("/risk/assess", { method: "POST", json: b });
    const { district_id, input_status, ...inputs } = b;
    const result = assess(inputs, input_status);
    return demoStore.add<RiskAssessment>("assessments", { district_id, inputs: inputs as Record<string, number | null>, result, score: result.score, category: result.category, created_at: new Date().toISOString() });
  },
  list: async (): Promise<RiskAssessment[]> => (isDemo() ? demoStore.list<RiskAssessment>("assessments") : api<RiskAssessment[]>("/risk/assessments")),
};

const SIM_ASSUMPTIONS = [
  "Rainfall is treated as uniform over the whole district for the stated duration.",
  "The rainfall factor uses the heaviest 24-hour accumulation of the scenario, compared against a fixed 200 mm reference.",
  "Terrain, history and exposure factors use only the values supplied; absent values are excluded, not zeroed.",
];
const SIM_LIMITS = [
  "This is an indicator-based scenario, not a hydrological or hydraulic flood inundation model.",
  "It does not model drainage networks, soil saturation, upstream inflow, dams or river channels.",
  "Results must not be used for evacuation or operational decisions.",
];

export const simulations = {
  create: async (b: SimulationInput): Promise<Simulation> => {
    if (!isDemo()) return api<Simulation>("/simulations", { method: "POST", json: b });
    const { input_status, district_id, ...p } = b;
    const open = await loadOpenBoundaries();
    const name = (await demoDistricts()).find((d) => d.id === district_id)?.name;
    const geom = open.features.find((f) => f.properties.name === name)?.geometry ?? null;
    const peak = Math.min(p.rainfall_intensity_mm_h * Math.min(p.duration_h, 24), 1000);
    const indicators = assess({ rainfall_mm_24h: peak, elevation_m: p.elevation_m, slope_deg: p.slope_deg, flood_history_index: p.flood_history_index, exposure_index: p.exposure_index }, { rainfall_mm_24h: "assumption", ...input_status });
    const results: SimulationResults = {
      total_rainfall_mm: Math.round(p.rainfall_intensity_mm_h * p.duration_h * 10) / 10, risk_indicators: indicators,
      visualization: geom ? { type: "Feature", geometry: geom, properties: { category: indicators.category, score: indicators.score } } : null,
      visualization_note: geom ? null : "No boundary available.", assumptions: SIM_ASSUMPTIONS, limitations: SIM_LIMITS, processing_status: "completed",
    };
    return demoStore.add<Simulation>("simulations", { district_id, params: b as unknown as Record<string, unknown>, status: "completed", results, created_at: new Date().toISOString() });
  },
  list: async (): Promise<Simulation[]> => (isDemo() ? demoStore.list<Simulation>("simulations") : api<Simulation[]>("/simulations")),
  results: async (id: number): Promise<Simulation> => {
    if (isDemo()) return demoStore.list<Simulation>("simulations").find((s) => s.id === id)!;
    const r = await api<{ simulation_id: number; parameters: Record<string, unknown>; status: string; results: SimulationResults | null }>(`/simulations/${id}/results`);
    return { id: r.simulation_id, district_id: Number(r.parameters.district_id), params: r.parameters, status: r.status, results: r.results, created_at: "" };
  },
  pdf: (id: number) => api<Blob>(`/reports/simulations/${id}/pdf`),
};

export const assistant = {
  chat: (b: { message: string; language: "en" | "ur"; district_id?: number | null; simulation_id?: number | null; assessment_id?: number | null }) => api<ChatReply>("/assistant/chat", { method: "POST", json: b }),
};

export const reports = {
  overview: () => api<Overview>("/reports/overview"),
  risk: () => api<{ total: number; by_category: Record<string, number>; disclaimer: string }>("/reports/risk"),
};

export const datasets = {
  list: () => api<Dataset[]>("/datasets"),
  create: (b: Omit<Dataset, "id" | "created_at">) => api<Dataset>("/datasets", { method: "POST", json: b }),
  update: (id: number, b: Omit<Dataset, "id" | "created_at">) => api<Dataset>(`/datasets/${id}`, { method: "PUT", json: b }),
  remove: (id: number) => api<void>(`/datasets/${id}`, { method: "DELETE" }),
};

export const admin = {
  users: () => api<User[]>("/admin/users"),
  updateUser: (id: number, b: { role?: "user" | "admin"; is_active?: boolean }) => api<User>(`/admin/users/${id}`, { method: "PATCH", json: b }),
  audit: (limit = 200) => api<AuditLog[]>(`/admin/audit-logs?limit=${limit}`),
  stats: () => api<AdminStats>("/admin/stats"),
};

export { RISK_DISCLAIMER };

// ---------- incident reports ----------
export type IncidentForm = {
  type: IncidentType; severity: IncidentSeverity; description: string; latitude: number; longitude: number; accuracy_m?: number | null;
  location_source: "gps" | "map_pin" | "search" | "manual"; place_text?: string; contact_phone?: string; people_affected?: number | null; observed_at?: string;
};
export const incidents = {
  /** Demo mode keeps reports in this browser only (never sent anywhere) and says so in the UI. */
  submit: async (f: IncidentForm, photos: File[]): Promise<Incident> => {
    if (isDemo()) {
      const { blobToDataUrl } = await import("@/lib/image");
      const thumbs = await Promise.all(photos.slice(0, 3).map((p) => blobToDataUrl(p)));
      const code = `DEMO-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      const row = demoStore.add<Incident>("incidents", {
        code, type: f.type, severity: f.severity, description: f.description, latitude: f.latitude, longitude: f.longitude, place_text: f.place_text ?? null,
        district_id: null, district_name: null, status: "pending", created_at: new Date().toISOString(), observed_at: f.observed_at ?? null, photo_count: thumbs.length,
        accuracy_m: f.accuracy_m ?? null, location_source: f.location_source, contact_phone: f.contact_phone ?? null, people_affected: f.people_affected ?? null,
        media: thumbs.map((local, i) => ({ id: i + 1, width: 0, height: 0, size: local.length, sha256: "", local })),
      });
      return row;
    }
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") fd.append(k, String(v)); });
    photos.forEach((p) => fd.append("photos", p, p.name));
    return api<Incident>("/incidents", { method: "POST", body: fd });
  },
  mine: async (): Promise<Incident[]> => (isDemo() ? demoStore.list<Incident>("incidents") : api<Incident[]>("/incidents/mine")),
  public: async (): Promise<Incident[]> => (isDemo() ? [] : api<Incident[]>("/incidents/public")),
  list: (status?: IncidentStatus | "") => api<Incident[]>(`/incidents${status ? `?status=${status}` : ""}`),
  stats: () => api<{ total: number; pending: number; verified: number; rejected: number; resolved: number }>("/incidents/stats"),
  review: (id: number, b: { status?: IncidentStatus; severity?: IncidentSeverity; admin_note?: string }) => api<Incident>(`/incidents/${id}`, { method: "PATCH", json: b }),
  remove: (id: number) => api<void>(`/incidents/${id}`, { method: "DELETE" }),
  /** Photos need the auth header, so they are fetched as blobs and shown through object URLs. */
  photo: async (iid: number, mid: number): Promise<string> => URL.createObjectURL(await api<Blob>(`/incidents/${iid}/media/${mid}`)),
};
