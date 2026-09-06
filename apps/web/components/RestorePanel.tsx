"use client";

import { useMemo, useState } from "react";
import type { BurnScar, RestorationData } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { CloseIcon, DirectionsIcon } from "./Icons";

interface Props {
  data: RestorationData | undefined;
  onSelect: (s: BurnScar) => void;
  isMobile: boolean;
  onClose?: () => void;
}

// Green recovery ramp, legible on the dark glass panel (high = deepest).
const PRIORITY_COLOR: Record<string, string> = { high: "#16a34a", medium: "#22c55e", low: "#86efac" };
const BRAND_GREEN = "#16a34a"; // fixed, readable behind white-text CTAs

function displayCommunity(s: BurnScar, locale: string): string {
  const name = locale === "ar" ? s.nearest_community_ar || s.nearest_community : s.nearest_community;
  return name || "";
}

function gmapsUrl(s: BurnScar): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
}

export default function RestorePanel({ data, onSelect, isMobile, onClose }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();
  const ar = locale === "ar";

  const scars = data?.scars ?? [];
  const fmtNum = (n: number) => Math.round(n).toLocaleString(ar ? "ar-DZ" : "en-US");

  // Wilaya filter — only wilayas that actually have scars, most-burned first.
  const [wilaya, setWilaya] = useState<number | "all">("all");
  const wilayaOptions = useMemo(() => {
    const m = new Map<number, { code: number; name: string; count: number; area: number }>();
    for (const s of scars) {
      if (s.wilaya_code == null) continue;
      const name = (ar ? s.wilaya_name_ar : s.wilaya_name) || String(s.wilaya_code);
      const e = m.get(s.wilaya_code) ?? { code: s.wilaya_code, name, count: 0, area: 0 };
      e.count += 1;
      e.area += s.area_ha;
      m.set(s.wilaya_code, e);
    }
    return [...m.values()].sort((a, b) => b.area - a.area);
  }, [scars, ar]);

  const activeWilaya = wilaya !== "all" && wilayaOptions.some((w) => w.code === wilaya) ? wilaya : "all";
  const shown = useMemo(() => {
    const list = activeWilaya === "all" ? scars : scars.filter((s) => s.wilaya_code === activeWilaya);
    return [...list].sort((a, b) => b.priority_score - a.priority_score);
  }, [scars, activeWilaya]);

  const counts = { high: 0, medium: 0, low: 0 };
  let totalArea = 0;
  for (const s of shown) {
    counts[s.priority] += 1;
    totalArea += s.area_ha;
  }

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", insetInlineStart: 8, insetInlineEnd: 8, maxWidth: 560, marginInline: "auto", top: "calc(env(safe-area-inset-top) + 78px)", bottom: "calc(env(safe-area-inset-bottom) + 12px)", zIndex: 21, padding: 14, display: "flex", flexDirection: "column" }
    // Desktop: sit BELOW the full-width header (which is at top:16) so they never overlap.
    : { position: "absolute", top: 88, insetInlineEnd: 16, zIndex: 19, padding: 16, width: 308, maxHeight: "calc(100vh - 104px)", display: "flex", flexDirection: "column" };

  const card = (color: string, n: number, label: string) => (
    <div style={{ flex: 1, borderRadius: 10, border: `1px solid ${color}66`, background: `${color}22`, padding: isMobile ? "6px 8px" : "7px 10px", minWidth: 0 }}>
      <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 800, color, lineHeight: 1.1 }}>{fmtNum(n)}</div>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
    </div>
  );

  return (
    <div className={`glass ${isMobile ? "sheet-in" : "animate-in"}`} style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 700 }}>
          {t("restore.title")}
        </span>
        {onClose && (
          <button onClick={onClose} aria-label={t("common.close")} style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      {/* Headline: total burned area needing restoration (for the current filter). */}
      {scars.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: isMobile ? 24 : 26, fontWeight: 800, color: "#22c55e", lineHeight: 1.05 }}>
            {t("restore.hectares", { n: fmtNum(totalArea) })}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
            {t("restore.summary", { scars: String(shown.length) })}
          </div>
        </div>
      )}

      {/* Wilaya filter — only affected wilayas (most-burned first). */}
      {wilayaOptions.length > 1 && (
        <select
          value={activeWilaya}
          onChange={(e) => setWilaya(e.target.value === "all" ? "all" : Number(e.target.value))}
          aria-label={t("restore.filterWilaya")}
          style={{ width: "100%", marginBottom: 10, padding: isMobile ? "11px 12px" : "9px 11px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text)", fontSize: isMobile ? 14 : 13, fontWeight: 600, cursor: "pointer" }}
        >
          <option value="all">{t("restore.allWilayas", { n: scars.length })}</option>
          {wilayaOptions.map((w) => (
            <option key={w.code} value={w.code}>{`${w.name} (${w.count})`}</option>
          ))}
        </select>
      )}

      {/* Priority counts: high / medium / low (for the current filter) */}
      <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
        {card(PRIORITY_COLOR.high, counts.high, t("restore.priority.high"))}
        {card(PRIORITY_COLOR.medium, counts.medium, t("restore.priority.medium"))}
        {card(PRIORITY_COLOR.low, counts.low, t("restore.priority.low"))}
      </div>

      {scars.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.4 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, background: BRAND_GREEN, flexShrink: 0 }}>
            <DirectionsIcon size={12} color="#fff" />
          </span>
          {t("restore.helper")}
        </div>
      )}

      {scars.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "10px 0", lineHeight: 1.5 }}>
          {t("restore.none")}
        </div>
      ) : (
        <div style={{ overflowY: "auto", margin: "0 -4px", flex: 1, WebkitOverflowScrolling: "touch" }}>
          {shown.map((s) => {
            const color = PRIORITY_COLOR[s.priority];
            const wname = (ar ? s.wilaya_name_ar : s.wilaya_name) || "";
            const community = displayCommunity(s, locale);
            const when = s.days_since != null
              ? (s.days_since <= 1 ? t("restore.burnedRecently") : t("restore.daysAgo", { n: String(s.days_since) }))
              : "";
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "stretch", gap: 8, borderTop: "1px solid var(--border)", borderInlineStart: `3px solid ${color}`, background: s.priority === "high" ? `${color}12` : "transparent" }}>
                <button
                  onClick={() => onSelect(s)}
                  style={{ flex: 1, minWidth: 0, textAlign: "start", background: "none", border: "none", cursor: "pointer", padding: isMobile ? "11px 6px 11px 10px" : "8px 4px 8px 8px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: isMobile ? 14.5 : 13, color: "var(--text)", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {community || wname || t("restore.burnScar")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {t("restore.ha", { n: fmtNum(s.area_ha) })}
                    </span>
                  </div>
                  {/* Wilaya + when it burned, small. */}
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {wname}
                    {when ? ` · ${when}` : ""}
                  </div>
                </button>
                <a
                  href={gmapsUrl(s)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("restore.directions")}
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, alignSelf: "center", width: isMobile ? 62 : 52, minHeight: isMobile ? 46 : 40, margin: isMobile ? "5px 6px 5px 0" : "4px 4px 4px 0", flexShrink: 0, color: "#fff", background: BRAND_GREEN, borderRadius: 10, textDecoration: "none" }}
                >
                  <DirectionsIcon size={16} color="#fff" />
                  <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1 }}>{t("restore.go")}</span>
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", lineHeight: 1.5 }}>
        {t("restore.advisory")}
      </div>
    </div>
  );
}
