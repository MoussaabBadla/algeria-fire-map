"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import type { Translator } from "@/lib/i18n/config";

interface Props {
  shownCount: number;
  totalCount: number;
  generatedAt: string | undefined;
  loading: boolean;
  error?: string;
  compact?: boolean;
}

function lastUpdated(iso: string | undefined, t: Translator): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minAgo", { n: mins });
  return t("time.hAgo", { n: Math.round(mins / 60) });
}

// Shimmer skeleton block shown while the first fetch is in flight.
function Skeleton({ w, h, r = 6 }: { w: number; h: number; r?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: w,
        height: h,
        borderRadius: r,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.14) 37%, rgba(255,255,255,0.06) 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.4s ease-in-out infinite",
      }}
    />
  );
}

// Loading state for the first fetch: skeleton + "loading…", escalating to
// "waking the live feed…" after a few seconds to explain slow cold starts.
function LoadingBadge({ compact }: { compact?: boolean }) {
  const t = useTranslations();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div aria-busy="true" aria-live="polite">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <Skeleton w={compact ? 42 : 58} h={compact ? 26 : 34} r={8} />
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          {slow ? t("statBadge.wakingFeed") : t("statBadge.loadingCount")}
        </span>
      </div>
      {!compact && <div style={{ marginTop: 10 }}><Skeleton w={180} h={12} /></div>}
    </div>
  );
}

export default function StatBadge({ shownCount, totalCount, generatedAt, loading, error, compact }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const t = useTranslations();

  if (error) return <div style={{ color: "var(--fire-4)", fontSize: 13 }}>{error}</div>;

  // First load, no data yet → show a skeleton instead of a confident, wrong "0".
  // A cold backend (Railway idle spin-up) can take 20–30s, so after a few seconds
  // escalate the copy to make clear it's a slow fetch, not "zero fires".
  if (loading) {
    return <LoadingBadge compact={compact} />;
  }

  return (
    <div aria-live="polite">
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
