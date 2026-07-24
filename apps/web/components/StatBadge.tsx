"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import type { Translator } from "@/lib/i18n/config";

interface Props {
  shownCount: number;
  totalCount: number;
  generatedAt: string | undefined;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  compact?: boolean;
}

function lastUpdated(iso: string | undefined, t: Translator): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minAgo", { n: mins });
  return t("time.hAgo", { n: Math.round(mins / 60) });
}

export default function StatBadge({ shownCount, totalCount, generatedAt, loading, error, onRetry, compact }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const t = useTranslations();

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(224, 30, 55, 0.1)", borderRadius: 10, border: "1px solid rgba(224, 30, 55, 0.25)" }}>
      <span style={{ fontSize: 13, color: "var(--fire-4)", flex: 1, minWidth: 0 }}>{error}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>Retry</button>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: compact ? 26 : 34, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {shownCount.toLocaleString()}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {t("statBadge.activeFires")}
          {/* Subtle info affordance → methodology popover */}
          <span style={{ position: "relative", display: "inline-flex" }}>
            <button
              aria-label={t("statBadge.howDetectedAria")}
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              onClick={() => setShowInfo((v) => !v)}
              style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 10, lineHeight: 1, display: "grid", placeItems: "center", padding: 0 }}
            >
              i
            </button>
            {showInfo && (
              <div
                style={
                  compact
                    ? // Mobile: span the viewport width so it never overflows.
                      { position: "fixed", insetInlineStart: 12, insetInlineEnd: 12, top: "calc(env(safe-area-inset-top) + 82px)", zIndex: 40, padding: 14, borderRadius: 14, background: "var(--surface-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)", fontWeight: 400, textAlign: "start" }
                    : { position: "absolute", top: "calc(100% + 8px)", insetInlineStart: 0, width: 290, zIndex: 40, padding: 14, borderRadius: 12, background: "var(--surface-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)", fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)", fontWeight: 400, textAlign: "start" }
                }
              >
                <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>{t("statBadge.howDetectedTitle")}</div>
                <div style={{ marginBottom: 10 }}>{t("explainers.detection")}</div>
                <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>{t("statBadge.howConfirmedTitle")}</div>
                {t("explainers.confirmed")}
              </div>
            )}
          </span>
        </span>
      </div>

      {!compact && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
          {t("statBadge.ofHotspotsUpdated", { total: totalCount.toLocaleString(), time: lastUpdated(generatedAt, t) })}
        </div>
      )}
    </div>
  );
}
