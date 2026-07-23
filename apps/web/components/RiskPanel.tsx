"use client";

import type { RiskWilaya } from "@/lib/api";
import { riskColor, riskLabel } from "@/lib/risk";
import { CloseIcon } from "./Icons";

interface Props {
  items: RiskWilaya[];
  onSelect: (w: RiskWilaya) => void;
  isMobile: boolean;
  onClose?: () => void;
}

export default function RiskPanel({ items, onSelect, isMobile, onClose }: Props) {
  if (!items.length) return null;

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", left: 12, right: 12, top: "calc(env(safe-area-inset-top) + 82px)", zIndex: 21, padding: 16 }
    : { position: "absolute", top: 16, right: 16, zIndex: 19, padding: 16, width: 252 };

  return (
    <div className={`glass ${isMobile ? "sheet-in" : "animate-in"}`} style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 700 }}>
          Highest fire-risk
        </span>
        {onClose && (
          <button onClick={onClose} aria-label="Close" style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>
      {items.slice(0, 6).map((w) => (
        <button
          key={w.code}
          onClick={() => onSelect(w)}
          style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "7px 0" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: riskColor(w.class), flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: riskColor(w.class) }}>{riskLabel(w.class)}</span>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{w.fwi}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
