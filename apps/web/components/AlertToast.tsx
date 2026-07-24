"use client";

import { useEffect, useState, useRef } from "react";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import type { Locale } from "@/lib/i18n/config";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { intensityForFrp } from "@/lib/fire";

export interface WilayaAlert {
  wilayaCode: number;
  frps: number[];
}

interface Props {
  alerts: WilayaAlert[];
  locale: Locale;
  onView: (code: number) => void;
  onDismiss: () => void;
}

const CYCLE_MS = 10_000;

export default function AlertToast({ alerts, locale, onView, onDismiss }: Props) {
  const t = useTranslations();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const advance = useRef<(skipView?: boolean) => void>(undefined);

  useEffect(() => {
    if (alerts.length === 0) return;
    setIndex(0);
    requestAnimationFrame(() => setVisible(true));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); setVisible(false); setIndex(0); };
  }, [alerts]);

  useEffect(() => {
    advance.current = (skipView?: boolean) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIndex((prev) => {
        const n = prev + 1;
        if (n >= alerts.length) {
          setVisible(false);
          setTimeout(onDismiss, 400);
          return prev;
        }
        if (!skipView) timerRef.current = setTimeout(() => advance.current?.(), CYCLE_MS);
        return n;
      });
    };
  }, [alerts, onDismiss]);

  useEffect(() => {
    if (alerts.length === 0) return;
    if (alerts.length <= 1) return;
    timerRef.current = setTimeout(() => advance.current?.(), CYCLE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [alerts]);

  if (alerts.length === 0) return null;

  const current = alerts[index];

  const handleAdvance = () => {
    advance.current?.(true);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        insetInlineEnd: 16,
        zIndex: 999,
        width: 290,
        transform: visible ? "translateX(0) translateY(0)" : "translateX(0) translateY(20px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease, transform 0.3s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        className="glass"
        onClick={handleAdvance}
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          borderRadius: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0, marginInlineEnd: 4 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>🔥</span>
          {alerts.length > 1 && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>
              {index + 1}/{alerts.length}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, marginBottom: 5 }}>
            {wilayaName(current.wilayaCode, locale)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {current.frps.slice(0, 5).map((frp, i) => {
              const level = intensityForFrp(frp);
              return (
                <span key={i} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                  background: level.color + "22", color: level.color,
                  border: `1px solid ${level.color}44`,
                }}>
                  {frp.toFixed(1)} MW
                </span>
              );
            })}
            {current.frps.length > 5 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                +{current.frps.length - 5}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onView(current.wilayaCode); advance.current?.(true); }}
          style={{
            fontSize: 13, fontWeight: 600, color: "var(--accent)", background: "none",
            border: "1px solid var(--accent)", borderRadius: 8, padding: "6px 14px",
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {t("alerts.view")}
        </button>
      </div>
    </div>
  );
}