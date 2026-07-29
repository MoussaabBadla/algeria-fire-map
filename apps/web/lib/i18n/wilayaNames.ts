// Localized wilaya names. wilayas.json already ships both the Latin `name`
// and the Arabic `name_ar`, keyed by the official wilaya `code`; this maps a
// code (+ locale) to the right label. Fires are matched to a wilaya by code
// (see wilayaAssign.ts), so display names stay locale-correct everywhere.
import wilayasData from "@/lib/wilayas.json";
import type { Locale } from "./config";

interface WilayaProps {
  code: number;
  name: string;
  name_ar: string;
}

const BY_CODE = new Map<number, WilayaProps>(
  (wilayasData as unknown as { features: { properties: WilayaProps }[] }).features.map((f) => [
    f.properties.code,
    f.properties,
  ])
);

export function wilayaName(code: number, locale: Locale): string {
  const w = BY_CODE.get(code);
  if (!w) return "";
  return locale === "ar" ? w.name_ar || w.name : w.name;
}

// All wilayas as `{ code, name }`, localised and sorted by display name so a
// picker lists them alphabetically in the active locale.
export function allWilayas(locale: Locale): { code: number; name: string }[] {
  return Array.from(BY_CODE.keys())
    .map((code) => ({ code, name: wilayaName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale === "ar" ? "ar" : "en"));
}
