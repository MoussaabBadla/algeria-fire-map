// Approximate wilaya assignment for fires, using the 69 wilaya centroids.
// (Nearest-centroid — good enough for a "most affected" ranking; exact
// point-in-polygon would need wilaya boundary polygons we don't ship yet.)
import wilayasData from "./wilayas.json";
import type { FireFeature } from "./api";
import type { Locale } from "./i18n/config";

interface WilayaPoint {
  code: number;
  name: string; // Latin name — kept as a stable key; display uses wilayaName(code, locale)
  lng: number;
  lat: number;
}

export const WILAYAS: WilayaPoint[] = (wilayasData as unknown as {
  features: { geometry: { coordinates: number[] }; properties: { code: number; name: string } }[];
}).features.map((f) => ({
  code: f.properties.code,
  name: f.properties.name,
  lng: f.geometry.coordinates[0],
  lat: f.geometry.coordinates[1],
}));

function nearestWilaya(lng: number, lat: number): WilayaPoint {
  let best = WILAYAS[0];
  let bestD = Infinity;
  for (const w of WILAYAS) {
    // Squared distance in degrees, cos-corrected for longitude — fine for ranking.
    const dLat = lat - w.lat;
    const dLng = (lng - w.lng) * Math.cos((lat * Math.PI) / 180);
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

export function nearestWilayaCode(lng: number, lat: number): number {
  return nearestWilaya(lng, lat).code;
}

export interface WilayaCount {
  code: number;
  name: string; // Latin name — stable key; display uses wilayaName(code, locale)
  lng: number;
  lat: number;
  count: number;
}

export function rankWilayas(features: FireFeature[], top = 6): WilayaCount[] {
  const map = new Map<number, WilayaCount>();
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    const w = nearestWilaya(lng, lat);
    const existing = map.get(w.code);
    if (existing) existing.count += 1;
    else map.set(w.code, { code: w.code, name: w.name, lng: w.lng, lat: w.lat, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, top);
}

const wilayaByCode = new Map(WILAYAS.map((w) => [w.code, w]));

export function searchWilayas(query: string, locale: Locale): WilayaCount[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  // Build a searchable entry per wilaya with both Latin and Arabic names
  const searchIndex = (wilayasData as unknown as {
    features: { properties: { code: number; name: string; name_ar: string } }[];
  }).features.map((f) => ({
    code: f.properties.code,
    name: f.properties.name,
    nameAr: f.properties.name_ar,
  }));
  return searchIndex
    .filter((w) => {
      const latinMatch = w.name.toLowerCase().includes(q);
      const arabicMatch = locale === "ar" && w.nameAr.includes(q);
      return latinMatch || arabicMatch;
    })
    .map((w) => {
      const coords = wilayaByCode.get(w.code);
      return { code: w.code, name: w.name, lng: coords?.lng ?? 0, lat: coords?.lat ?? 0, count: 0 };
    });
}
