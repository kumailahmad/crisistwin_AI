import type { District } from "@/lib/types";

export type StaticDistrictMeta = {
  id: number;
  name: string;
  area_km2: number;
  centroid: [number, number]; // [lon, lat]
  source: string;
};

export const STATIC_DISTRICTS: readonly StaticDistrictMeta[] = [
  { id: 1, name: "Awaran", area_km2: 24566, centroid: [65.4399, 26.1931], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 2, name: "Barkhan", area_km2: 2993, centroid: [69.606, 29.8717], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 3, name: "Chagai", area_km2: 47224, centroid: [63.3249, 28.9949], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 4, name: "Dera Bugti", area_km2: 9373, centroid: [69.0681, 28.8799], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 5, name: "Gwadar", area_km2: 13119, centroid: [63.1519, 25.4134], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 6, name: "Jhal Magsi", area_km2: 3824, centroid: [67.5655, 28.3508], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 7, name: "Kachhi", area_km2: 8665, centroid: [67.7684, 29.1664], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 8, name: "Kalat", area_km2: 13469, centroid: [66.659, 28.8438], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 9, name: "Kech", area_km2: 24761, centroid: [63.0733, 26.0219], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 10, name: "Kharan", area_km2: 47160, centroid: [64.6675, 27.9428], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 11, name: "Khuzdar", area_km2: 29538, centroid: [66.6959, 27.4179], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 12, name: "Kohlu", area_km2: 9108, centroid: [68.7887, 29.5443], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 13, name: "Lasbela", area_km2: 15597, centroid: [66.6831, 25.848], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 14, name: "Loralai", area_km2: 9855, centroid: [68.8075, 30.2461], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 15, name: "Mastung", area_km2: 5673, centroid: [66.9023, 29.7364], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 16, name: "Musakhel", area_km2: 4957, centroid: [69.9224, 30.8042], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 17, name: "Nasirabad", area_km2: 3192, centroid: [68.1512, 28.5295], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 18, name: "Nushki", area_km2: 6467, centroid: [65.8537, 29.4681], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 19, name: "Panjgur", area_km2: 18299, centroid: [64.1991, 26.7543], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 20, name: "Pishin", area_km2: 5018, centroid: [67.3397, 30.7778], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 21, name: "Qilla Abdullah", area_km2: 7025, centroid: [66.7448, 30.7181], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 22, name: "Qilla Saifullah", area_km2: 11795, centroid: [68.3826, 30.9067], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 23, name: "Quetta", area_km2: 2790, centroid: [66.8192, 30.1108], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 24, name: "Sibi", area_km2: 6378, centroid: [67.8864, 29.8834], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 25, name: "Zhob", area_km2: 16540, centroid: [69.1213, 31.3695], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
  { id: 26, name: "Ziarat", area_km2: 1406, centroid: [67.5767, 30.3953], source: "geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), simplified" },
];

export const STATIC_DISTRICT_OPTIONS: District[] = STATIC_DISTRICTS.map((d) => ({
  id: d.id,
  name: d.name,
  province: "Balochistan",
  area_km2: d.area_km2,
  population: null,
  data_source: d.source,
  verified: false,
  has_boundary: true,
}));

export function findStaticDistrictName(id: number | null | undefined): string | null {
  if (!id) return null;
  return STATIC_DISTRICTS.find((d) => d.id === id)?.name ?? null;
}

export function findStaticDistrictCentroid(name: string): [number, number] | null {
  return STATIC_DISTRICTS.find((d) => d.name === name)?.centroid ?? null;
}
