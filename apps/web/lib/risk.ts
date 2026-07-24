// Fire Weather Index danger classes (EFFIS scale). Green → dark red gradient,
// deliberately distinct from the yellow→crimson fire-power ramp.
import type { Translator } from "./i18n/config";

export type RiskKey = "very-low" | "low" | "moderate" | "high" | "very-high" | "extreme";

export interface RiskClass {
  key: RiskKey; // display label comes from t(`riskClass.${key}`)
  color: string;
}

export const RISK_CLASSES: RiskClass[] = [
  { key: "very-low", color: "#16a34a" },
  { key: "low", color: "#84cc16" },
  { key: "moderate", color: "#eab308" },
  { key: "high", color: "#f97316" },
  { key: "very-high", color: "#ef4444" },
  { key: "extreme", color: "#991b1b" },
];

const byKey = new Map(RISK_CLASSES.map((c) => [c.key, c]));

export function riskColor(cls: string): string {
  return byKey.get(cls as RiskKey)?.color ?? "#eab308";
}

// Localized danger-class label. Falls back to "moderate" for unknown classes.
export function riskLabel(cls: string, t: Translator): string {
  const key = byKey.has(cls as RiskKey) ? cls : "moderate";
  return t(`riskClass.${key}`);
}
