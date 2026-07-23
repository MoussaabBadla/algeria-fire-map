"use client";

import { useState } from "react";
import { CONFIRMED_EXPLAINER } from "@/lib/fire";

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

  if (error) return <div style={{ color: "var(--fire-4)", fontSize: 13 }}>⚠️ {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: compact ? 26 : 34, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {shownCount.toLocaleString()}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          active fires
          {loading && <span style={{ color: "var(--text-muted)" }}> · updating…</span>}
        </span>
      </div>

      <div style={{ position: "relative", display: "inline-flex", marginTop: 6 }}>
        <button
          onMouseEnter={() => setShowInfo(true)}
          onMouseLeave={() => setShowInfo(false)}
          onClick={() => setShowInfo((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", minHeight: 28, borderRadius: 99, background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.3)", color: "#5fe3ab", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          ✓ Confirmed only
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "grid", placeItems: "center", fontSize: 9, color: "var(--text-secondary)" }}>i</span>
        </button>
        {showInfo && (
          <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: 268, maxWidth: "78vw", zIndex: 40, padding: 12, borderRadius: 12, background: "var(--surface-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)", fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>How we confirm fires</div>
            {CONFIRMED_EXPLAINER}
          </div>
        )}
      </div>

      {!compact && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
          of {totalCount.toLocaleString()} hotspots · updated {lastUpdated(generatedAt)}
        </div>
      )}
    </div>
  );
}
