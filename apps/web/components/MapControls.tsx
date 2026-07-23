"use client";

import type { FireCollectionMeta } from "@/lib/api";

const RANGES = [
  { label: "24h", days: 1 },
  { label: "48h", days: 2 },
  { label: "7d", days: 7 },
];

const LEGEND = [
  { color: "#ffeda0", label: "Low (0–5 MW)" },
  { color: "#feb24c", label: "5–20 MW" },
  { color: "#fc4e2a", label: "20–50 MW" },
  { color: "#bd0026", label: "50–100 MW" },
  { color: "#800026", label: "Very high (100+ MW)" },
];

function lastUpdated(iso: string | undefined): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

interface Props {
  days: number;
  onDaysChange: (days: number) => void;
  meta: FireCollectionMeta | undefined;
  loading: boolean;
  error?: string;
}

export default function MapControls({ days, onDaysChange, meta, loading, error }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        background: "rgba(255,255,255,0.95)",
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
        font: "13px/1.4 system-ui,sans-serif",
        color: "#1a1a1a",
        maxWidth: 240,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
        🇩🇿🔥 Algeria Fire Map
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => onDaysChange(r.days)}
            style={{
              flex: 1,
              padding: "5px 0",
              borderRadius: 6,
              border: "1px solid #d0d0d0",
              cursor: "pointer",
              background: days === r.days ? "#bd0026" : "#fff",
              color: days === r.days ? "#fff" : "#333",
              fontWeight: 600,
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 10, color: "#444" }}>
        {error ? (
          <span style={{ color: "#bd0026" }}>⚠️ {error}</span>
        ) : (
          <>
            <div>
              <b>{meta?.count ?? 0}</b> active detections
              {loading && <span style={{ color: "#999" }}> · refreshing…</span>}
            </div>
            <div style={{ color: "#777", fontSize: 12 }}>
              Updated {lastUpdated(meta?.generated_at)}
            </div>
          </>
        )}
      </div>

      <div style={{ borderTop: "1px solid #eee", paddingTop: 8 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "#888", marginBottom: 4 }}>
          Fire power
        </div>
        {LEGEND.map((l) => (
          <div key={l.color} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: l.color,
                border: "0.5px solid #4a0011",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12 }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
