// Typed client for the FastAPI backend. The frontend is stateless and holds
// no secrets — it only calls this public API.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Confidence = "low" | "nominal" | "high";

export interface FireProperties {
  frp: number;
  confidence: Confidence;
  acq_datetime: string | null;
  satellite: string;
  instrument: string;
  daynight: string;
  brightness: number | null;
}

export interface FireFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: FireProperties;
}

export interface FireCollectionMeta {
  generated_at: string;
  days: number;
  count: number;
  sources: string[];
  aoi_bbox: string;
}

export interface FireCollection {
  type: "FeatureCollection";
  features: FireFeature[];
  properties: FireCollectionMeta;
}

export interface SelectedFire {
  id: number | string;
  lng: number;
  lat: number;
  properties: FireProperties;
}

export async function fetchFires(url: string): Promise<FireCollection> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function firesKey(days: number): string {
  return `${API_URL}/fires?days=${days}`;
}

export interface PlaceInfo {
  wilaya: string | null;
  town: string | null;
  district: string | null;
  country: string | null;
  display: string | null;
}

export function placeKey(lat: number, lng: number): string {
  return `${API_URL}/place?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`;
}

export async function fetchPlace(url: string): Promise<PlaceInfo> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("place lookup failed");
  return res.json();
}

// --- Incidents (clustered fire_events, persisted server-side) ---
export interface EventProperties {
  id: number;
  first_seen: string | null;
  last_seen: string | null;
  detection_count: number;
  max_frp: number | null;
  total_frp: number | null;
  is_active: boolean;
  wilaya_code: number | null;
  wilaya_name: string | null;
  wilaya_name_ar: string | null;
  hull?: { type: "Polygon"; coordinates: number[][][] };
}

export interface EventFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: EventProperties;
}

export interface EventCollection {
  type: "FeatureCollection";
  features: EventFeature[];
  properties: { count: number; enabled: boolean };
}

export function eventsKey(opts: { activeOnly?: boolean; days?: number; limit?: number } = {}): string {
  const p = new URLSearchParams();
  if (opts.activeOnly) p.set("active_only", "true");
  if (opts.days != null) p.set("days", String(opts.days));
  if (opts.limit != null) p.set("limit", String(opts.limit));
  const qs = p.toString();
  return `${API_URL}/events${qs ? `?${qs}` : ""}`;
}

export async function fetchEvents(url: string): Promise<EventCollection> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("events fetch failed");
  return res.json();
}

export interface RiskDay {
  fwi: number;
  class: string;
}

export interface RiskWilaya {
  code: number;
  name: string;
  lat: number;
  lng: number;
  fwi: number;
  class: string;
  temp: number;
  rh: number;
  wind: number;
  forecast?: RiskDay[]; // [today, +1d, +2d]
}

export interface RiskData {
  generated_at: string;
  wilayas: RiskWilaya[];
}

export function riskKey(): string {
  return `${API_URL}/risk`;
}

export async function fetchRisk(url: string): Promise<RiskData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("risk fetch failed");
  return res.json();
}
