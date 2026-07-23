"use client";

import useSWR from "swr";
import { fetchPlace, placeKey, type PlaceInfo, type SelectedFire } from "@/lib/api";
import {
  confidenceMeta,
  dayNightLabel,
  formatAlgeriaTime,
  intensityForFrp,
  relativeTime,
  satelliteName,
} from "@/lib/fire";
import { CloseIcon, FlameIcon, PinIcon } from "./Icons";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</span>
      <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 500, textAlign: "right" }}>{children}</span>
    </div>
  );
}

export default function FireDetailPanel({
  fire,
  onClose,
  isMobile,
}: {
  fire: SelectedFire;
  onClose: () => void;
  isMobile: boolean;
}) {
  const p = fire.properties;
  const level = intensityForFrp(p.frp);
  const conf = confidenceMeta(p.confidence);
  const frpPct = Math.min(100, (p.frp / 120) * 100);

  const { data: place, isLoading: placeLoading } = useSWR<PlaceInfo>(placeKey(fire.lat, fire.lng), fetchPlace, {
    revalidateOnFocus: false,
    dedupingInterval: 3600_000,
  });
  const placeLine = [place?.town, place?.wilaya].filter(Boolean).join(", ");

  const shell: React.CSSProperties = isMobile
    ? {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "64vh",
        zIndex: 30,
        padding: "8px 20px calc(20px + env(safe-area-inset-bottom))",
        borderRadius: "20px 20px 0 0",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }
    : {
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
        overflowY: "auto",
      };

  return (
    <aside className={`glass ${isMobile ? "sheet-in" : "panel-in"}`} style={shell}>
      {isMobile && <div style={{ width: 40, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.25)", margin: "2px auto 12px" }} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: level.color, boxShadow: `0 0 12px ${level.color}` }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>{level.label} intensity</span>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center" }}>
          <CloseIcon size={15} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 12.5, marginBottom: 14 }}>
        <FlameIcon size={13} color="var(--accent)" /> Active fire detection
      </div>

      {/* Location */}
      <div style={{ marginBottom: 16, padding: "12px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
          <PinIcon size={12} /> Location
        </div>
        {placeLoading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Locating…</div>
        ) : placeLine ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{place?.town ?? place?.wilaya}</div>
            {place?.wilaya && place?.town && (
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 1 }}>
                Wilaya of {place.wilaya}
                {place?.district ? ` · ${place.district}` : ""}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>Remote area</div>
        )}
      </div>

      {/* Fire power hero */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{p.frp}</span>
          <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>MW</span>
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>Fire radiative power</div>
        <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${frpPct}%`, height: "100%", borderRadius: 99, background: level.color }} />
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
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fire.lat.toFixed(4)}, {fire.lng.toFixed(4)}</span>
        </Row>
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5, borderTop: "1px solid var(--border)" }}>
        Source: NASA FIRMS (VIIRS / MODIS). Near-real-time — detections can lag ~3 h and may be obscured by cloud.
      </div>
    </aside>
  );
}
