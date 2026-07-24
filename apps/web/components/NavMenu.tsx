"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { MenuIcon, MapIcon, ChartIcon, GitHubIcon, CloseIcon } from "./Icons";

const REPO = "https://github.com/MoussaabBadla/algeria-fire-map";

// Compact navigation menu: a menu icon that opens a dropdown of pages. Central
// place to reach the map / stats / (future pages) without cluttering the map UI.
export default function NavMenu({ size = 38 }: { size?: number }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { href: "/", label: t("nav.map"), icon: <MapIcon size={17} /> },
    { href: "/stats", label: t("nav.stats"), icon: <ChartIcon size={17} /> },
  ];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("nav.menu")}
        aria-expanded={open}
        style={{
          width: size, height: size, borderRadius: 11,
          border: "1px solid var(--border)", background: "rgba(255,255,255,0.05)",
          color: "var(--text-primary)", cursor: "pointer",
          display: "grid", placeItems: "center",
        }}
      >
        {open ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
      </button>

      {open && (
        <div
          className="glass animate-in"
          style={{
            position: "absolute", top: size + 8, insetInlineEnd: 0, zIndex: 50,
            minWidth: 208, padding: 8, borderRadius: 14,
            display: "flex", flexDirection: "column", gap: 2,
          }}
        >
          {items.map((it) => {
            const active = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "10px 12px", borderRadius: 9, textDecoration: "none",
                  fontSize: 13.5, fontWeight: 600,
                  color: active ? "#ff9e3d" : "var(--text-primary)",
                  background: active ? "rgba(255,122,26,0.12)" : "transparent",
                }}
              >
                <span style={{ color: active ? "#ff9e3d" : "var(--text-secondary)" }}>{it.icon}</span>
                {it.label}
              </Link>
            );
          })}
          <div style={{ height: 1, background: "var(--border)", margin: "6px 4px" }} />
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "10px 12px", borderRadius: 9, textDecoration: "none",
              fontSize: 13.5, fontWeight: 600, color: "var(--text-secondary)",
            }}
          >
            <GitHubIcon size={16} /> {t("nav.source")}
          </a>
        </div>
      )}
    </div>
  );
}
