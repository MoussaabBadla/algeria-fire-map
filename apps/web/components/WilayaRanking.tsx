"use client";

import type { WilayaCount } from "@/lib/wilayaAssign";
import { CloseIcon } from "./Icons";

interface Props {
  items: WilayaCount[];
  onSelect: (w: WilayaCount) => void;
  isMobile: boolean;
  onClose?: () => void;
}

export default function WilayaRanking({ items, onSelect, isMobile, onClose }: Props) {
  if (items.length === 0) return null;
  const max = items[0].count || 1;

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", left: 12, right: 12, top: "calc(env(safe-area-inset-top) + 82px)", zIndex: 21, padding: 16 }
    : { position: "absolute", top: 16, right: 16, zIndex: 19, padding: 16, width: 250 };

  return (
    <div className={`glass ${isMobile ? "sheet-in" : "animate-in"}`} style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 700 }}>
          Most affected wilayas
        </span>
        {onClose && (
          <button onClick={onClose} aria-label="Close" style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>
      {items.map((w, i) => (
        <button
          key={w.name}
          onClick={() => onSelect(w)}
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
              <span style={{ color: "var(--text-muted)", marginRight: 7 }}>{i + 1}</span>
              {w.name}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{w.count}</span>
          </div>
          <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ width: `${(w.count / max) * 100}%`, height: "100%", borderRadius: 99, background: "var(--accent)" }} />
          </div>
        </button>
      ))}
    </div>
  );
}
