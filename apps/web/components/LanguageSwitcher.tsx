"use client";

import { LOCALES } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Compact segmented language picker. Adding a locale to LOCALES makes a new
// button appear here automatically — no edits needed.
export default function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();

  return (
    <div style={{ display: "flex", gap: 3, padding: compact ? 2 : 3, background: "rgba(255,255,255,0.06)", borderRadius: 10, flexShrink: 0 }}>
      {LOCALES.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            onClick={() => setLocale(l.code)}
            aria-label={l.label}
            aria-pressed={active}
            style={{
              minWidth: compact ? 30 : 40,
              minHeight: compact ? 26 : 30,
              padding: compact ? "0 6px" : "0 8px",
              borderRadius: 7,
              border: active ? "1px solid rgba(255,255,255,0.10)" : "1px solid transparent",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 12,
              transition: "background 0.18s ease, color 0.18s ease",
              background: active ? "rgba(255,255,255,0.16)" : "transparent",
              color: active ? "#fff" : "var(--text-secondary)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.4)" : "none",
            }}
          >
            {l.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
