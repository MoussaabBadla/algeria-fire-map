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
