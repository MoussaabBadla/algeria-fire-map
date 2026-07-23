"use client";

import { DURATIONS, type DurationKey } from "@/lib/fire";
import { MAP_STYLES, type MapStyleKey } from "@/lib/mapStyles";
import Segmented from "./Segmented";
import StatBadge from "./StatBadge";
import RiskLegend from "./RiskLegend";
import { ClockIcon, FlameIcon } from "./Icons";

interface Props {
  isMobile: boolean;
  styleKey: MapStyleKey;
  onStyleChange: (k: MapStyleKey) => void;
  duration: DurationKey;
  onDurationChange: (d: DurationKey) => void;
  shownCount: number;
  totalCount: number;
  generatedAt: string | undefined;
  loading: boolean;
  error?: string;
  historyMode: boolean;
  onEnterHistory: () => void;
  onToggleRanking: () => void;
  showRisk: boolean;
  onToggleRisk: () => void;
}

const styleOpts = MAP_STYLES.map((s) => ({ key: s.key, label: s.label }));
const durationOpts = DURATIONS.map((d) => ({
  key: d.key,
  label: d.label,
  activeColor: d.key === "live" ? "#10b981" : undefined,
}));

function Brand({ small }: { small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: small ? 34 : 40, height: small ? 34 : 40, borderRadius: small ? 10 : 12, background: "var(--accent)", display: "grid", placeItems: "center", boxShadow: "0 2px 10px rgba(255,122,26,0.28)", flexShrink: 0 }}>
        <FlameIcon size={small ? 18 : 21} color="#fff" />
      </div>
      {!small && (
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>Algeria Fire Map</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Live wildfire monitoring</div>
        </div>
      )}
    </div>
  );
}

function InlineLegend() {
  return (
    <div style={{ padding: "2px 2px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Fire power</span>
        <span>Low to Extreme</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: "linear-gradient(90deg,#ffe066,#ffa630,#fb5607,#e01e37,#a4133c)" }} />
    </div>
  );
}

function LiveDot() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--live)", animation: "livePulse 2s ease-in-out infinite" }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--live)", letterSpacing: "0.06em" }}>LIVE</span>
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  flex: 1,
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-secondary)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const activeToggle: React.CSSProperties = {
  border: "1px solid rgba(255,122,26,0.5)",
  background: "rgba(255,122,26,0.14)",
  color: "#ff9e3d",
};

export default function TopBar(props: Props) {
  const { isMobile, styleKey, onStyleChange, duration, onDurationChange, historyMode, onEnterHistory, onToggleRanking, showRisk, onToggleRisk } = props;

  if (isMobile) {
    return (
      <>
        <div className="glass animate-in" style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top))", left: 12, right: 12, zIndex: 20, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Brand small />
            <StatBadge {...props} compact />
          </div>
          <LiveDot />
        </div>

        {!historyMode && (
          <div className="glass animate-in" style={{ position: "absolute", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 20, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {showRisk ? <RiskLegend horizontal /> : <InlineLegend />}
            <Segmented options={durationOpts} value={duration} onChange={onDurationChange} big />
            <Segmented options={styleOpts} value={styleKey} onChange={onStyleChange} big />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={secondaryBtn} onClick={onToggleRanking}>{showRisk ? "Top risk" : "Affected"}</button>
              <button style={{ ...secondaryBtn, ...(showRisk ? activeToggle : {}) }} onClick={onToggleRisk}>Risk</button>
              <button style={secondaryBtn} onClick={onEnterHistory}><ClockIcon size={15} /> Replay</button>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--text-muted)", textAlign: "center", opacity: 0.8 }}>
              Map © OpenStreetMap · Esri · Fires: NASA FIRMS
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop card
  return (
    <div className="glass animate-in" style={{ position: "absolute", top: 16, left: 16, zIndex: 20, padding: 18, width: 300, maxWidth: "calc(100vw - 32px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Brand />
        <LiveDot />
      </div>
      <div style={{ marginBottom: 14 }}>
        <StatBadge {...props} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>Map</div>
        <Segmented options={styleOpts} value={styleKey} onChange={onStyleChange} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>Period</div>
        <Segmented options={durationOpts} value={duration} onChange={onDurationChange} />
      </div>
      <button style={{ ...secondaryBtn, width: "100%", marginBottom: 8, ...(showRisk ? activeToggle : {}) }} onClick={onToggleRisk}>
        <FlameIcon size={14} color={showRisk ? "#ff9e3d" : "var(--text-secondary)"} /> Fire risk (FWI){showRisk ? " · on" : ""}
      </button>
      {!historyMode && (
        <button style={{ ...secondaryBtn, width: "100%" }} onClick={onEnterHistory}>
          <ClockIcon size={15} /> Replay last 5 days
        </button>
      )}
    </div>
  );
}
