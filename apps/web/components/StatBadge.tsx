"use client";

import { useState } from "react";
import { CONFIRMED_EXPLAINER, DETECTION_EXPLAINER } from "@/lib/fire";

interface Props {
  shownCount: number;
  totalCount: number;
  generatedAt: string | undefined;
  loading: boolean;
  error?: string;
  compact?: boolean;
}

function lastUpdated(iso: string | undefined): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export default function StatBadge({ shownCount, totalCount, generatedAt, loading, error, compact }: Props) {
  const [showInfo, setShowInfo] = useState(false);

  if (error) return <div style={{ color: "var(--fire-4)", fontSize: 13 }}>{error}</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: compact ? 26 : 34, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {shownCount.toLocaleString()}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          active fires
          {/* Subtle info affordance → methodology popover */}
          <span style={{ position: "relative", display: "inline-flex" }}>
            <button
              aria-label="How fires are confirmed"
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
                      { position: "fixed", left: 12, right: 12, top: "calc(env(safe-area-inset-top) + 82px)", zIndex: 40, padding: 14, borderRadius: 14, background: "var(--surface-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)", fontWeight: 400, textAlign: "left" }
                    : { position: "absolute", top: "calc(100% + 8px)", left: 0, width: 290, zIndex: 40, padding: 14, borderRadius: 12, background: "var(--surface-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)", fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)", fontWeight: 400, textAlign: "left" }
                }
              >
                <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>How fires are detected</div>
                <div style={{ marginBottom: 10 }}>{DETECTION_EXPLAINER}</div>
                <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>How we confirm them</div>
                {CONFIRMED_EXPLAINER}
              </div>
            )}
          </span>
        </span>
      </div>

      {!compact && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
          of {totalCount.toLocaleString()} hotspots · updated {lastUpdated(generatedAt)}
        </div>
      )}
    </div>
  );
}
