"use client";

import type { SelectedFire } from "@/lib/api";
import {
  confidenceMeta,
  dayNightLabel,
  formatAlgeriaTime,
  intensityForFrp,
  relativeTime,
  satelliteName,
} from "@/lib/fire";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</span>
      <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 500, textAlign: "right" }}>{children}</span>
    </div>
  );
}

export default function FireDetailPanel({ fire, onClose }: { fire: SelectedFire; onClose: () => void }) {
  const p = fire.properties;
  const level = intensityForFrp(p.frp);
  const conf = confidenceMeta(p.confidence);
  const frpPct = Math.min(100, (p.frp / 120) * 100);

  return (
    <aside
      className="glass panel-in"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        bottom: 16,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 20,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: level.color, boxShadow: `0 0 12px ${level.color}` }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>{level.label} intensity</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 12.5, marginBottom: 16 }}>🔥 Active fire detection</div>

      {/* Fire power hero */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{p.frp}</span>
          <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>MW</span>
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>Fire radiative power</div>
        <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${frpPct}%`, height: "100%", borderRadius: 99, background: "var(--accent-grad)" }} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Row label="Confidence">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: conf.color }} />
            {conf.label}
          </span>
        </Row>
        <Row label="Detected">
          <span>
            {relativeTime(p.acq_datetime)}
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {formatAlgeriaTime(p.acq_datetime)}</span>
          </span>
        </Row>
        <Row label="Satellite">{satelliteName(p)}</Row>
        <Row label="Time of day">{dayNightLabel(p.daynight)}</Row>
        {p.brightness != null && <Row label="Brightness">{Math.round(p.brightness)} K</Row>}
        <Row label="Coordinates">
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {fire.lat.toFixed(4)}, {fire.lng.toFixed(4)}
          </span>
        </Row>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 16, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5 }}>
        Source: NASA FIRMS (VIIRS / MODIS). Near-real-time — satellite detections can lag ~3 h and may be obscured by cloud.
      </div>
    </aside>
  );
}
