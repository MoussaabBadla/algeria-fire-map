// Domain helpers for interpreting FIRMS fire detections.
import type { Confidence, FireProperties } from "./api";
import type { Translator } from "./i18n/config";

export type IntensityKey = "low" | "moderate" | "high" | "very-high" | "extreme";

export interface IntensityLevel {
  key: IntensityKey; // display label comes from t(`intensity.${key}`)
  color: string;
  min: number; // FRP MW lower bound
}

// Sequential fire-power ramp (must match --fire-* in globals.css and the map layer).
export const INTENSITY_LEVELS: IntensityLevel[] = [
  { key: "low", color: "#ffe066", min: 0 },
  { key: "moderate", color: "#ffa630", min: 5 },
  { key: "high", color: "#fb5607", min: 20 },
  { key: "very-high", color: "#e01e37", min: 50 },
  { key: "extreme", color: "#a4133c", min: 100 },
];

export function intensityForFrp(frp: number): IntensityLevel {
  let level = INTENSITY_LEVELS[0];
  for (const l of INTENSITY_LEVELS) if (frp >= l.min) level = l;
  return level;
}

// ---- Fire filter modes ----
// FIRMS returns many low-confidence / low-intensity hotspots (often agricultural
// burning), which aren't the wildfires people care about. These modes trim to the
// real, significant fires.
export type FireFilterKey = "confirmed" | "notable" | "all";

export function passesFilter(p: { confidence: Confidence; frp: number }, key: FireFilterKey): boolean {
  if (key === "all") return true;
  if (key === "notable") return p.confidence !== "low" && p.frp >= 8;
  // confirmed
  return p.confidence === "high" && p.frp >= 15;
}

// ---- Timing / recency ----
export type DurationKey = "live" | "24h" | "48h";

export interface DurationDef {
  key: DurationKey; // display label comes from t(`duration.${key}`)
  apiDays: number; // days to request from the API
  maxAgeHours: number; // client-side recency cutoff
}

export const DURATIONS: DurationDef[] = [
  { key: "live", apiDays: 1, maxAgeHours: 6 },
  { key: "24h", apiDays: 1, maxAgeHours: 24 },
  { key: "48h", apiDays: 2, maxAgeHours: 48 },
];

export function durationFor(key: DurationKey): DurationDef {
  return DURATIONS.find((d) => d.key === key) ?? DURATIONS[1];
}

export function withinAge(iso: string | null, maxAgeHours: number): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() <= maxAgeHours * 3600_000;
}

// Colors only; the label comes from t(`confidence.${key}`).
const CONFIDENCE_COLOR: Record<Confidence, string> = {
  low: "#a4a7b2",
  nominal: "#ffa630",
  high: "#34d399",
};

export function confidenceMeta(c: Confidence): { key: Confidence; color: string } {
  const key = c in CONFIDENCE_COLOR ? c : "nominal";
  return { key, color: CONFIDENCE_COLOR[key] };
}

// FIRMS satellite codes → friendly names.
export function satelliteName(p: Pick<FireProperties, "satellite" | "instrument">): string {
  const s = (p.satellite || "").toUpperCase();
  const map: Record<string, string> = {
    N20: "NOAA-20",
    N21: "NOAA-21",
    N: "Suomi-NPP",
    "1": "Terra",
    T: "Terra",
    A: "Aqua",
    AQUA: "Aqua",
    TERRA: "Terra",
  };
  const sat = map[s] || p.satellite || "—";
  const instr = p.instrument || (s.startsWith("N") ? "VIIRS" : "MODIS");
  return `${sat} · ${instr}`;
}

// Absolute time in Algeria (Africa/Algiers, UTC+1). Kept in Latin digits
// (en-GB) to match the tabular-nums figures used across the UI; the locale
// only controls surrounding copy, not the numerals.
export function formatAlgeriaTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Algiers",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

// Localized relative time. Pass the translator (keys under `time.*`).
export function relativeTime(iso: string | null, t: Translator): string {
  if (!iso) return t("time.unknown");
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return t("time.justNow");
  if (diffMin < 60) return t("time.minAgo", { n: diffMin });
  const h = Math.round(diffMin / 60);
  if (h < 48) return t("time.hAgo", { n: h });
  return t("time.dAgo", { n: Math.round(h / 24) });
}

// Normalizes the FIRMS day/night flag to a message key: t(`dayNight.${key}`).
export function dayNightKey(d: string): "D" | "N" | "unknown" {
  return d === "D" ? "D" : d === "N" ? "N" : "unknown";
}

// Great-circle distance in km.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
