// Domain helpers for interpreting FIRMS fire detections.
import type { Confidence, FireProperties } from "./api";

export interface IntensityLevel {
  key: "low" | "moderate" | "high" | "very-high" | "extreme";
  label: string;
  color: string;
  min: number; // FRP MW lower bound
}

// Sequential fire-power ramp (must match --fire-* in globals.css and the map layer).
export const INTENSITY_LEVELS: IntensityLevel[] = [
  { key: "low", label: "Low", color: "#ffe066", min: 0 },
  { key: "moderate", label: "Moderate", color: "#ffa630", min: 5 },
  { key: "high", label: "High", color: "#fb5607", min: 20 },
  { key: "very-high", label: "Very high", color: "#e01e37", min: 50 },
  { key: "extreme", label: "Extreme", color: "#a4133c", min: 100 },
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

export interface FireFilterDef {
  key: FireFilterKey;
  label: string;
  description: string;
}

export const FIRE_FILTERS: FireFilterDef[] = [
  { key: "confirmed", label: "Confirmed", description: "High confidence · strong intensity — real wildfires" },
  { key: "notable", label: "Notable", description: "Nominal+ confidence · ≥8 MW" },
  { key: "all", label: "All", description: "Every satellite hotspot" },
];

export function passesFilter(p: { confidence: Confidence; frp: number }, key: FireFilterKey): boolean {
  if (key === "all") return true;
  if (key === "notable") return p.confidence !== "low" && p.frp >= 8;
  // confirmed
  return p.confidence === "high" && p.frp >= 15;
}

// Human-readable explanation of the "Confirmed" methodology (shown in a popover).
export const CONFIRMED_EXPLAINER =
  "We show only Confirmed fires: NASA FIRMS detections flagged high-confidence with a fire radiative power of 15 MW or more. " +
  "This removes low-confidence noise and small agricultural burns, leaving detections that are almost certainly real, active wildfires.";

// ---- Timing / recency ----
export type DurationKey = "live" | "24h" | "48h";

export interface DurationDef {
  key: DurationKey;
  label: string;
  apiDays: number; // days to request from the API
  maxAgeHours: number; // client-side recency cutoff
}

export const DURATIONS: DurationDef[] = [
  { key: "live", label: "Live", apiDays: 1, maxAgeHours: 6 },
  { key: "24h", label: "24h", apiDays: 1, maxAgeHours: 24 },
  { key: "48h", label: "48h", apiDays: 2, maxAgeHours: 48 },
];

export function durationFor(key: DurationKey): DurationDef {
  return DURATIONS.find((d) => d.key === key) ?? DURATIONS[1];
}

export function withinAge(iso: string | null, maxAgeHours: number): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() <= maxAgeHours * 3600_000;
}

const CONFIDENCE_META: Record<Confidence, { label: string; color: string }> = {
  low: { label: "Low", color: "#a4a7b2" },
  nominal: { label: "Nominal", color: "#ffa630" },
  high: { label: "High", color: "#34d399" },
};

export function confidenceMeta(c: Confidence) {
  return CONFIDENCE_META[c] ?? CONFIDENCE_META.nominal;
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

// Absolute time in Algeria (Africa/Algiers, UTC+1).
export function formatAlgeriaTime(iso: string | null): string {
  if (!iso) return "Unknown";
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
    return "Unknown";
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "unknown time";
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.round(diffMin / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function dayNightLabel(d: string): string {
  return d === "D" ? "Daytime" : d === "N" ? "Nighttime" : "—";
}
