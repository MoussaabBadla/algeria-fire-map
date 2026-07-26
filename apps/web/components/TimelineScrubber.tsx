"use client";

import { useMemo, useRef, useState } from "react";
import type { FireFeature } from "@/lib/api";
import { formatAlgeriaTime } from "@/lib/fire";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { BarsIcon, GraphIcon, PauseIcon, PlayIcon } from "./Icons";
import Segmented from "./Segmented";

const BINS = 96;

interface Props {
  features: FireFeature[]; // 7-day confirmed fires (for the activity histogram)
  minTime: number;
  maxTime: number;
  cursor: number;
  windowMs: number;
  shownCount: number;
  playing: boolean;
  onCursor: (t: number) => void;
  onPlayToggle: () => void;
  onExit: () => void;
  isMobile: boolean;
}

export default function TimelineScrubber({
  features,
  minTime,
  maxTime,
  cursor,
  windowMs,
  shownCount,
  playing,
  onCursor,
  onPlayToggle,
  onExit,
  isMobile,
}: Props) {
  const t = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const range = Math.max(1, maxTime - minTime);
  const [view, setView] = useState<"candles" | "graph">("graph");

  const series = useMemo(() => {
    const times = features
      .map((f) => (f.properties.acq_datetime ? new Date(f.properties.acq_datetime).getTime() : NaN))
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);

    const binMs = range / BINS;
    const raw = new Array(BINS).fill(0);
    const rolling = new Array(BINS).fill(0);

    for (let i = 0; i < BINS; i++) {
      const edge = minTime + (i + 1) * binMs;
      const start = edge - windowMs;
      let inBin = 0;
      let inWin = 0;
      for (const t of times) {
        if (t > edge - binMs && t <= edge) inBin++;
        if (t > start && t <= edge) inWin++;
      }
      raw[i] = inBin;
      rolling[i] = inWin;
    }
    const rawMax = Math.max(1, ...raw);
    const rollMax = Math.max(1, ...rolling);
    return {
      raw,
      rolling,
      rawNorm: raw.map((c) => Math.sqrt(c / rawMax)),
      rollNorm: rolling.map((c) => c / rollMax),
    };
  }, [features, minTime, range, windowMs]);

  const frac = Math.max(0, Math.min(1, (cursor - minTime) / range));
  const winStartFrac = Math.max(0, Math.min(1, (cursor - windowMs - minTime) / range));
  const winEndFrac = frac;

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onCursor(minTime + f * range);
  };

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", insetInlineStart: 12, insetInlineEnd: 12, maxWidth: 640, marginInline: "auto", bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 22, padding: 14 }
    : { position: "absolute", insetInlineStart: 232, insetInlineEnd: 72, bottom: 16, zIndex: 22, padding: 14, maxWidth: 720, margin: "0 auto" };

  return (
    <div className="glass animate-in" style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {formatAlgeriaTime(new Date(cursor).toISOString())}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("timeline.firesInWindow", { n: shownCount })}</span>
          <button
            onClick={onExit}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99, border: "none", background: "#10b981", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 2px 10px rgba(16,185,129,0.35)" }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: "livePulse 2s ease-in-out infinite" }} />
            {t("timeline.goLive")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onPlayToggle}
          aria-label={playing ? t("timeline.pause") : t("timeline.play")}
          style={{ width: 38, height: 38, borderRadius: 999, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: "0 2px 10px rgba(255,122,26,0.3)" }}
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>

        {/* Track with activity histogram + playhead */}
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            setFromClientX(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && setFromClientX(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          style={{ position: "relative", flex: 1, height: 44, cursor: "pointer", touchAction: "none", direction: "ltr" }}
        >
          {/* Shaded 12h window that the fire count is computed over */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${winStartFrac * 100}%`,
              width: `${Math.max(0, (winEndFrac - winStartFrac) * 100)}%`,
              background: "rgba(255,150,70,0.10)",
              borderRight: "1px solid rgba(255,150,70,0.35)",
              pointerEvents: "none",
            }}
          />
          {view === "candles" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 1 }}>
              {series.rawNorm.map((h, i) => {
                const center = (i + 0.5) / BINS;
                const inWindow = center >= winStartFrac && center <= winEndFrac;
                return (
                  <div
                    key={i}
                    title={`${series.raw[i]}`}
                    style={{
                      flex: 1,
                      height: `${8 + h * 92}%`,
                      borderRadius: 2,
                      background: inWindow ? "rgba(255,150,70,0.9)" : "rgba(255,255,255,0.10)",
                    }}
                  />
                );
              })}
            </div>
          )}
          {view === "graph" && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              {(() => {
                const pts = series.rollNorm.map((h, i) => {
                  const x = (i / (BINS - 1)) * 100;
                  const y = 100 - (8 + h * 92);
                  return `${x.toFixed(2)},${y.toFixed(2)}`;
                });
                const area = `0,100 ${pts.join(" ")} 100,100`;
                return (
                  <>
                    <polygon points={area} fill="rgba(255,150,70,0.18)" />
                    <polyline points={pts.join(" ")} fill="none" stroke="rgba(255,150,70,0.9)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </>
                );
              })()}
            </svg>
          )}
          {/* Playhead */}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${frac * 100}%`, width: 2, background: "#fff", transform: "translateX(-1px)", pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: -5, left: -5, width: 12, height: 12, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px rgba(255,255,255,0.6)" }} />
          </div>
        </div>

        {/* Vertical view toggle on the right end facing the Play button */}
        <Segmented
          vertical
          options={[
            { key: "candles", icon: <BarsIcon size={14} />, ariaLabel: t("timeline.viewBars") },
            { key: "graph", icon: <GraphIcon size={14} />, ariaLabel: t("timeline.viewGraph") },
          ]}
          value={view}
          onChange={(v) => setView(v as "candles" | "graph")}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--text-muted)", direction: "ltr" }}>
        <span>{formatAlgeriaTime(new Date(minTime).toISOString())}</span>
        <span>{t("timeline.dragOrPlay")}</span>
        <span>{t("timeline.now")}</span>
      </div>
    </div>
  );
}
