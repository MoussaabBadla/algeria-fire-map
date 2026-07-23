"use client";

import type { FireFeature, SelectedFire } from "@/lib/api";
import { intensityForFrp, relativeTime } from "@/lib/fire";
import { nearestWilayaName } from "@/lib/wilayaAssign";
import { CloseIcon } from "./Icons";

interface Props {
  fires: FireFeature[]; // already newest-first, sliced
  onSelect: (f: SelectedFire) => void;
  isMobile: boolean;
  onClose?: () => void;
}

export default function LatestFires({ fires, onSelect, isMobile, onClose }: Props) {
  if (fires.length === 0) return null;

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", left: 12, right: 12, top: "calc(env(safe-area-inset-top) + 82px)", zIndex: 21, padding: 16 }
    : { position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 19, padding: "14px 16px", width: 288, maxWidth: "calc(100vw - 480px)" };

  return (
    <div className={`glass ${isMobile ? "sheet-in" : "animate-in"}`} style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--live)", animation: "livePulse 2s ease-in-out infinite" }} />
          Latest fires
        </span>
        {onClose && (
          <button onClick={onClose} aria-label="Close" style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>
      {fires.map((f) => {
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        const level = intensityForFrp(p.frp);
        return (
          <button
            key={`${lng},${lat},${p.acq_datetime}`}
            onClick={() => onSelect({ id: `${lng},${lat}`, lng, lat, properties: p })}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "8px 0", textAlign: "left" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: level.color, boxShadow: `0 0 8px ${level.color}aa`, flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nearestWilayaName(lng, lat)}
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)" }}>
                {p.frp} MW · {relativeTime(p.acq_datetime)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
