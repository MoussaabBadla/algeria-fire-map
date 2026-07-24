"use client";

import { useMemo, useRef } from "react";
import type { FireFeature } from "@/lib/api";
import { formatAlgeriaTime } from "@/lib/fire";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { PauseIcon, PlayIcon } from "./Icons";

const BINS = 48;

interface Props {
  features: FireFeature[]; // 7-day confirmed fires (for the activity histogram)
  minTime: number;
  maxTime: number;
  cursor: number;
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

  const hist = useMemo(() => {
    const bins = new Array(BINS).fill(0);
    for (const f of features) {
      const t = f.properties.acq_datetime ? new Date(f.properties.acq_datetime).getTime() : NaN;
      if (isNaN(t)) continue;
      const b = Math.min(BINS - 1, Math.max(0, Math.floor(((t - minTime) / range) * BINS)));
      bins[b] += 1;
    }
    const max = Math.max(1, ...bins);
    return bins.map((c) => c / max);
  }, [features, minTime, range]);

  const frac = Math.max(0, Math.min(1, (cursor - minTime) / range));

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
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("timeline.fires", { n: shownCount })}</span>
          <button
            onClick={onExit}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99, border: "none", background: "#10b981", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 2px 10px rgba(16,185,129,0.35)" }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: "livePulse 2s ease-in-out infinite" }} />
            {t("timeline.goLive")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 1 }}>
            {hist.map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${8 + h * 92}%`, borderRadius: 2, background: i / BINS <= frac ? "rgba(255,150,70,0.55)" : "rgba(255,255,255,0.10)" }} />
            ))}
          </div>
          {/* Playhead */}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${frac * 100}%`, width: 2, background: "#fff", transform: "translateX(-1px)", pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: -5, left: -5, width: 12, height: 12, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px rgba(255,255,255,0.6)" }} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--text-muted)", direction: "ltr" }}>
        <span>{formatAlgeriaTime(new Date(minTime).toISOString())}</span>
        <span>{t("timeline.dragOrPlay")}</span>
        <span>{t("timeline.now")}</span>
      </div>
    </div>
  );
}
