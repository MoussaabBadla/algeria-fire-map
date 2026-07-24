"use client";

import type { WilayaCount } from "@/lib/wilayaAssign";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import { CloseIcon } from "./Icons";

interface Props {
  items: WilayaCount[];
  onSelect: (w: WilayaCount) => void;
  isMobile: boolean;
  onClose?: () => void;
}

export default function WilayaRanking({ items, onSelect, isMobile, onClose }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();
  if (items.length === 0) return null;
  const max = items[0].count || 1;

  const shell: React.CSSProperties = isMobile
    ? { position: "absolute", insetInlineStart: 12, insetInlineEnd: 12, maxWidth: 520, marginInline: "auto", top: "calc(env(safe-area-inset-top) + 82px)", zIndex: 21, padding: 16 }
    : { position: "absolute", top: 16, insetInlineEnd: 16, zIndex: 19, padding: 16, width: 250 };

  return (
    <div className={`glass ${isMobile ? "sheet-in" : "animate-in"}`} style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 700 }}>
          {t("wilayaRanking.mostAffected")}
        </span>
        {onClose && (
          <button onClick={onClose} aria-label={t("common.close")} style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>
      {items.map((w, i) => (
        <button
          key={w.code}
          onClick={() => onSelect(w)}
          style={{ display: "block", width: "100%", textAlign: "start", background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
              <span style={{ color: "var(--text-muted)", marginInlineEnd: 7 }}>{i + 1}</span>
              {wilayaName(w.code, locale) || w.name}
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
