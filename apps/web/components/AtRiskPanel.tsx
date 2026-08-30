"use client";

import type { AtRiskCommunity, AtRiskData } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { CloseIcon, DirectionsIcon } from "./Icons";

interface Props {
  data: AtRiskData | undefined;
  onSelect: (c: AtRiskCommunity) => void;
  isMobile: boolean;
  onClose?: () => void;
}

const TIER_COLOR: Record<string, string> = { severe: "#b91c1c", immediate: "#ef4444", warning: "#f59e0b" };

// The OSM `name` sometimes concatenates scripts (Arabic + Tifinagh); prefer the
// clean per-language field for the current locale, falling back sensibly.
function displayName(c: AtRiskCommunity, locale: string): string {
  if (locale === "ar") return c.name_ar || c.name;
  return c.name_en || c.name;
}

function gmapsUrl(c: AtRiskCommunity): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
}

export default function AtRiskPanel({ data, onSelect, isMobile, onClose }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();
  const ar = locale === "ar";

  const communities = data?.communities ?? [];
  const counts = data?.counts;
  const fmtDist = (m: number) => (m < 1000 ? t("atRisk.metres", { n: Math.round(m) }) : t("atRisk.km", { n: (m / 1000).toFixed(1) }));
  const fmtNum = (n: number) => n.toLocaleString(ar ? "ar-DZ" : "en-US");

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", insetInlineStart: 8, insetInlineEnd: 8, maxWidth: 560, marginInline: "auto", top: "calc(env(safe-area-inset-top) + 78px)", bottom: "calc(env(safe-area-inset-bottom) + 12px)", zIndex: 21, padding: 14, display: "flex", flexDirection: "column" }
    : { position: "absolute", top: 16, insetInlineEnd: 16, zIndex: 19, padding: 16, width: 300, maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column" };

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
          {t("atRisk.title")}
        </span>
        {onClose && (
          <button onClick={onClose} aria-label={t("common.close")} style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      {/* Tier counts: severe / immediate / warning */}
      <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
        {card(TIER_COLOR.severe, counts?.severe ?? 0, t("atRisk.severe"))}
        {card(TIER_COLOR.immediate, counts?.immediate ?? 0, t("atRisk.immediate"))}
        {card(TIER_COLOR.warning, counts?.warning ?? 0, t("atRisk.warning"))}
      </div>

      {communities.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.4 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, background: "var(--accent)", flexShrink: 0 }}>
            <DirectionsIcon size={12} color="#fff" />
          </span>
          {t("atRisk.helper")}
        </div>
      )}

      {communities.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "10px 0", lineHeight: 1.5 }}>
          {t("atRisk.none")}
        </div>
      ) : (
        <div style={{ overflowY: "auto", margin: "0 -4px", flex: 1, WebkitOverflowScrolling: "touch" }}>
          {communities.map((c) => {
            const color = TIER_COLOR[c.tier];
            const wilaya = (ar ? c.wilaya_name_ar : c.wilaya_name) || "";
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "stretch", gap: 8, borderTop: "1px solid var(--border)", borderInlineStart: `3px solid ${color}`, background: c.tier === "severe" ? `${color}12` : "transparent" }}>
                <button
                  onClick={() => onSelect(c)}
                  style={{ flex: 1, minWidth: 0, textAlign: "start", background: "none", border: "none", cursor: "pointer", padding: isMobile ? "11px 6px 11px 10px" : "8px 4px 8px 8px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: isMobile ? 14.5 : 13, color: "var(--text)", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName(c, locale)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {c.tier === "severe" ? `${Math.round(c.on_frp)} MW` : fmtDist(c.nearest_fire_m)}
                    </span>
                  </div>
                  {/* Wilaya name under the community, small — plus population when known. */}
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {wilaya}
                    {c.population ? ` · ${t("atRisk.people", { n: fmtNum(c.population) })}` : ""}
                  </div>
                </button>
                <a
                  href={gmapsUrl(c)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("atRisk.directions")}
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, alignSelf: "center", width: isMobile ? 62 : 52, minHeight: isMobile ? 46 : 40, margin: isMobile ? "5px 6px 5px 0" : "4px 4px 4px 0", flexShrink: 0, color: "#fff", background: color, borderRadius: 10, textDecoration: "none" }}
                >
                  <DirectionsIcon size={16} color="#fff" />
                  <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1 }}>{t("atRisk.go")}</span>
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", lineHeight: 1.5 }}>
        {t("atRisk.advisory")}
      </div>
    </div>
  );
}
