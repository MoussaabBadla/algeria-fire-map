"use client";

import { RISK_CLASSES } from "@/lib/risk";

export default function RiskLegend({ horizontal }: { horizontal?: boolean }) {
  if (horizontal) {
    return (
      <div style={{ padding: "2px 2px 4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Fire-weather risk</span>
          <span>Low to Extreme</span>
        </div>
        <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden" }}>
          {RISK_CLASSES.map((c) => (
            <div key={c.key} style={{ flex: 1, background: c.color }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="glass animate-in" style={{ position: "absolute", left: 16, bottom: 16, zIndex: 20, padding: 16, width: 192 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)", marginBottom: 12 }}>
        Fire-weather risk
      </div>
      {RISK_CLASSES.slice().reverse().map((c) => (
        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.color, boxShadow: `0 0 8px ${c.color}88` }} />
          <span style={{ fontSize: 12.5 }}>{c.label}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Fire Weather Index from live weather. Tap a wilaya for details.
      </div>
    </div>
  );
}
