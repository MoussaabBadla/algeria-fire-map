"use client";

import { useState } from "react";
import { RISK_CLASSES } from "@/lib/risk";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

function InfoButton({ horizontal }: { horizontal?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations();
  const popStyle: React.CSSProperties = horizontal
    ? { position: "fixed", insetInlineStart: 12, insetInlineEnd: 12, top: "calc(env(safe-area-inset-top) + 82px)", zIndex: 40 }
    : { position: "absolute", bottom: "calc(100% + 8px)", insetInlineStart: 0, width: 250, zIndex: 40 };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        aria-label={t("riskLegend.whatIsFwiAria")}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        style={{ width: 15, height: 15, borderRadius: "50%", border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 9.5, lineHeight: 1, display: "grid", placeItems: "center", padding: 0 }}
      >
        i
      </button>
      {open && (
        <div style={{ ...popStyle, padding: 13, borderRadius: 12, background: "var(--surface-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)", fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)", textAlign: "start" }}>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{t("riskLegend.whatIsFwiTitle")}</div>
          {t("explainers.fwi")}
        </div>
      )}
    </span>
  );
}

export default function RiskLegend({ horizontal }: { horizontal?: boolean }) {
  const t = useTranslations();
  if (horizontal) {
    return (
      <div style={{ padding: "2px 2px 4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("riskLegend.fireWeatherRisk")} <InfoButton horizontal />
          </span>
          <span>{t("riskLegend.lowToExtreme")}</span>
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
    <div className="glass animate-in" style={{ position: "absolute", insetInlineStart: 16, bottom: 16, zIndex: 20, padding: 16, width: 192 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
          {t("riskLegend.fireWeatherRisk")}
        </span>
        <InfoButton />
      </div>
      {RISK_CLASSES.slice().reverse().map((c) => (
        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.color, boxShadow: `0 0 8px ${c.color}88` }} />
          <span style={{ fontSize: 12.5 }}>{t(`riskClass.${c.key}`)}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {t("riskLegend.tapWilaya")}
      </div>
    </div>
  );
}
