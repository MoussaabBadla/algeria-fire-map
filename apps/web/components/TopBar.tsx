"use client";

import { DURATIONS, type DurationKey } from "@/lib/fire";
import { MAP_STYLES, type MapStyleKey } from "@/lib/mapStyles";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import Segmented from "./Segmented";
import StatBadge from "./StatBadge";
import RiskLegend from "./RiskLegend";
import LanguageSwitcher from "./LanguageSwitcher";
import { ClockIcon, FlameIcon, GitHubIcon, PinIcon } from "./Icons";

const REPO_URL = "https://github.com/MoussaabBadla/algeria-fire-map";
const AUTHOR_URL = "https://github.com/MoussaabBadla";
const AUTHOR_NAME = "Moussaab Badla";

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
  onToggleLatest: () => void;
  showRisk: boolean;
  onToggleRisk: () => void;
  showIncidents: boolean;
  onToggleIncidents: () => void;
}

type T = ReturnType<typeof useTranslations>;

function Brand({ small, t }: { small?: boolean; t: T }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: small ? 34 : 40, height: small ? 34 : 40, borderRadius: small ? 10 : 12, background: "var(--accent)", display: "grid", placeItems: "center", boxShadow: "0 2px 10px rgba(255,122,26,0.28)", flexShrink: 0 }}>
        <FlameIcon size={small ? 18 : 21} color="#fff" />
      </div>
      {!small && (
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{t("common.appName")}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{t("common.tagline")}</div>
        </div>
      )}
    </div>
  );
}

function InlineLegend({ t }: { t: T }) {
  return (
    <div style={{ padding: "2px 2px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("legend.firePowerMw")}</span>
        <span>{t("riskLegend.lowToExtreme")}</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: "linear-gradient(90deg,#ffe066,#ffa630,#fb5607,#e01e37,#a4133c)" }} />
    </div>
  );
}

function LiveDot({ replay, t }: { replay?: boolean; t: T }) {
  if (replay) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em" }}>{t("topBar.replayBadge")}</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--live)", animation: "livePulse 2s ease-in-out infinite" }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--live)", letterSpacing: "0.06em" }}>{t("topBar.live")}</span>
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

function GitHubLink({ top, t }: { top?: boolean; t: T }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        fontSize: 11.5,
        padding: "8px 0 0",
        marginTop: top ? 8 : 0,
        borderTop: top ? "1px solid var(--border)" : "none",
      }}
    >
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", fontWeight: 600, textDecoration: "none" }}>
        <GitHubIcon size={14} /> {t("common.openSource")}
      </a>
      <span style={{ color: "var(--text-muted)" }}>·</span>
      <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
        {t("common.by", { name: AUTHOR_NAME })}
      </a>
    </div>
  );
}

const activeToggle: React.CSSProperties = {
  border: "1px solid rgba(255,122,26,0.5)",
  background: "rgba(255,122,26,0.14)",
  color: "#ff9e3d",
};

export default function TopBar(props: Props) {
  const { isMobile, styleKey, onStyleChange, duration, onDurationChange, historyMode, onEnterHistory, onToggleRanking, onToggleLatest, showRisk, onToggleRisk, showIncidents, onToggleIncidents } = props;
  const t = useTranslations();

  const styleOpts = MAP_STYLES.map((s) => ({ key: s.key, label: t(`mapStyle.${s.key}`) }));
  const durationOpts = DURATIONS.map((d) => ({
    key: d.key,
    label: t(`duration.${d.key}`),
    activeColor: d.key === "live" ? "#10b981" : undefined,
  }));

  if (isMobile) {
    return (
      <>
        <div className="glass animate-in" style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top))", insetInlineStart: 12, insetInlineEnd: 12, maxWidth: 640, marginInline: "auto", zIndex: 20, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <Brand small t={t} />
            <StatBadge {...props} compact />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <LanguageSwitcher compact />
            <LiveDot replay={historyMode} t={t} />
          </div>
        </div>

        {!historyMode && (
          <div className="glass animate-in" style={{ position: "absolute", insetInlineStart: 12, insetInlineEnd: 12, maxWidth: 640, marginInline: "auto", bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 20, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {showRisk ? <RiskLegend horizontal /> : <InlineLegend t={t} />}
            <Segmented options={durationOpts} value={duration} onChange={onDurationChange} big />
            <Segmented options={styleOpts} value={styleKey} onChange={onStyleChange} big />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={secondaryBtn} onClick={onToggleLatest}>{t("topBar.latest")}</button>
              <button style={secondaryBtn} onClick={onToggleRanking}>{showRisk ? t("topBar.topRisk") : t("topBar.affected")}</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...secondaryBtn, ...(showRisk ? activeToggle : {}) }} onClick={onToggleRisk}>{t("topBar.risk")}</button>
              <button style={{ ...secondaryBtn, ...(showIncidents ? activeToggle : {}) }} onClick={onToggleIncidents}>{t("topBar.incidents")}</button>
              <button style={secondaryBtn} onClick={onEnterHistory}><ClockIcon size={15} /> {t("topBar.replay")}</button>
            </div>
            <GitHubLink t={t} />
            <div style={{ fontSize: 9.5, color: "var(--text-muted)", textAlign: "center", opacity: 0.8 }}>
              {t("common.mapAttribution")}
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop card
  return (
    <div className="glass animate-in" style={{ position: "absolute", top: 16, insetInlineStart: 16, zIndex: 20, padding: 18, width: 300, maxWidth: "calc(100vw - 32px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Brand t={t} />
        <LiveDot replay={historyMode} t={t} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <StatBadge {...props} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>{t("topBar.map")}</div>
        <Segmented options={styleOpts} value={styleKey} onChange={onStyleChange} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>{t("topBar.period")}</div>
        <Segmented options={durationOpts} value={duration} onChange={onDurationChange} />
      </div>
      <button style={{ ...secondaryBtn, width: "100%", marginBottom: 8, ...(showRisk ? activeToggle : {}) }} onClick={onToggleRisk}>
        <FlameIcon size={14} color={showRisk ? "#ff9e3d" : "var(--text-secondary)"} /> {t("topBar.fireRiskFwi")}{showRisk ? ` · ${t("topBar.on")}` : ""}
      </button>
      <button style={{ ...secondaryBtn, width: "100%", marginBottom: 8, ...(showIncidents ? activeToggle : {}) }} onClick={onToggleIncidents}>
        <PinIcon size={14} color={showIncidents ? "#ff9e3d" : "var(--text-secondary)"} /> {t("topBar.incidents")}{showIncidents ? ` · ${t("topBar.on")}` : ""}
      </button>
      {!historyMode && (
        <button style={{ ...secondaryBtn, width: "100%" }} onClick={onEnterHistory}>
          <ClockIcon size={15} /> {t("topBar.replayLast5Days")}
        </button>
      )}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
        <LanguageSwitcher />
      </div>
      <GitHubLink top t={t} />
    </div>
  );
}
