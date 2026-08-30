"use client";

import type { AtRiskCommunity, AtRiskData } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { CloseIcon } from "./Icons";

interface Props {
  data: AtRiskData | undefined;
  onSelect: (c: AtRiskCommunity) => void;
  isMobile: boolean;
  onClose?: () => void;
}

const TIER_COLOR: Record<string, string> = { immediate: "#ef4444", warning: "#f59e0b" };

// The OSM `name` sometimes concatenates scripts (Arabic + Tifinagh); prefer the
// clean per-language field for the current locale, falling back sensibly.
function displayName(c: AtRiskCommunity, locale: string): string {
  if (locale === "ar") return c.name_ar || c.name;
  return c.name_en || c.name;
}

function fmtDist(m: number, t: ReturnType<typeof useTranslations>): string {
  return m < 1000 ? t("atRisk.metres", { n: Math.round(m) }) : t("atRisk.km", { n: (m / 1000).toFixed(1) });
}

export default function AtRiskPanel({ data, onSelect, isMobile, onClose }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();

  const communities = data?.communities ?? [];
  const counts = data?.counts;

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", insetInlineStart: 12, insetInlineEnd: 12, maxWidth: 520, marginInline: "auto", top: "calc(env(safe-area-inset-top) + 82px)", bottom: 96, zIndex: 21, padding: 16, display: "flex", flexDirection: "column" }
    : { position: "absolute", top: 16, insetInlineEnd: 16, zIndex: 19, padding: 16, width: 288, maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column" };

  return (
    <div className={`glass ${isMobile ? "sheet-in" : "animate-in"}`} style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 700 }}>
          {t("atRisk.title")}
        </span>
        {onClose && (
          <button onClick={onClose} aria-label={t("common.close")} style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      {/* Tier counts */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, borderRadius: 10, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", padding: "7px 10px" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#ef4444", lineHeight: 1.1 }}>{counts?.immediate ?? 0}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>{t("atRisk.immediate")}</div>
        </div>
        <div style={{ flex: 1, borderRadius: 10, border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.12)", padding: "7px 10px" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#f59e0b", lineHeight: 1.1 }}>{counts?.warning ?? 0}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>{t("atRisk.warning")}</div>
        </div>
      </div>

      {communities.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "10px 0", lineHeight: 1.5 }}>
          {t("atRisk.none")}
        </div>
      ) : (
        <div style={{ overflowY: "auto", margin: "0 -4px", flex: 1 }}>
          {communities.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              style={{ display: "block", width: "100%", textAlign: "start", background: "none", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", padding: "8px 4px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLOR[c.tier], flexShrink: 0, boxShadow: c.tier === "immediate" ? "0 0 0 3px rgba(239,68,68,0.18)" : "none" }} />
                <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName(c, locale)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: TIER_COLOR[c.tier], fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {fmtDist(c.nearest_fire_m, t)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginInlineStart: 16, marginTop: 2 }}>
                {(locale === "ar" ? c.wilaya_name_ar : c.wilaya_name) || ""}
                {c.population ? ` · ${t("atRisk.people", { n: c.population.toLocaleString(locale === "ar" ? "ar-DZ" : "en-US") })}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", lineHeight: 1.5 }}>
        {t("atRisk.advisory")}
      </div>
    </div>
  );
}
