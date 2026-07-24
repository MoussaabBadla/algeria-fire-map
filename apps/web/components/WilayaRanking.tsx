"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import type { WilayaCount } from "@/lib/wilayaAssign";
import { searchWilayas } from "@/lib/wilayaAssign";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import { getFollowed, toggleFollow, isFollowed } from "@/lib/followedWilayas";
import { CloseIcon, SearchIcon, BellIcon, BellFilledIcon } from "./Icons";

interface Props {
  items: WilayaCount[];
  onSelect: (w: WilayaCount) => void;
  isMobile: boolean;
  onClose?: () => void;
}

export default function WilayaRanking({ items, onSelect, isMobile, onClose }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const [, forceUpdate] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    return searchWilayas(query.trim(), locale);
  }, [query, locale]);

  const max = items[0]?.count || 1;
  const displayItems = filtered ?? items;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < displayItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displayItems.length - 1));
    } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < displayItems.length) {
      e.preventDefault();
      onSelect(displayItems[selectedIndex]);
    }
  }, [displayItems, onSelect, selectedIndex]);

  const handleItemClick = useCallback((w: WilayaCount, i: number) => {
    setSelectedIndex(i);
    onSelect(w);
  }, [onSelect]);

  const toggleExpand = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const collapse = useCallback(() => {
    setExpanded(false);
    setQuery("");
    setSelectedIndex(-1);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    inputRef.current?.focus();
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        collapse();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, collapse]);

  const handleToggleFollow = (e: React.MouseEvent, code: number) => {
    e.stopPropagation();
    toggleFollow(code);
    forceUpdate((n) => n + 1);
  };

  const [inputFocused, setInputFocused] = useState(false);

  const sharedPanelContent = (
    <>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 700 }}>
            {filtered ? t("wilayaRanking.fires") : t("wilayaRanking.mostAffected")}
          </span>
          <button onClick={onClose || collapse} aria-label={t("common.close")} style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-secondary)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <CloseIcon size={13} />
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(-1); }}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => { setInputFocused(false); setSelectedIndex(-1); }}
            placeholder={t("wilayaRanking.searchPlaceholder")}
            aria-label={t("wilayaRanking.searchPlaceholder")}
            style={{
              width: "100%", padding: "8px 10px 8px 30px", fontSize: 12, borderRadius: 8,
              border: `1px solid ${inputFocused ? "var(--accent)" : "var(--border)"}`,
              boxShadow: inputFocused ? "0 0 0 1px var(--accent)" : "none",
              background: "var(--surface-hover)", color: "var(--text)", outline: "none",
              transition: "border-color 0.15s, box-shadow 0.15s", boxSizing: "border-box",
            }}
          />
          <span style={{ position: "absolute", insetInlineStart: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "flex", pointerEvents: "none" }}>
            <SearchIcon size={13} />
          </span>
        </div>
      </div>
      {filtered && filtered.length > 0 && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 6, letterSpacing: "0.02em" }}>
          {t("wilayaRanking.notifyHint")}
        </div>
      )}
      <div ref={listRef}>
        {displayItems.map((w: any, i: number) => {
          const followed = isFollowed(w.code);
          const fireCount = "count" in w ? w.count : 0;
          const isSelected = filtered && selectedIndex === i;
          return (
            <div key={w.code} style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 6, background: isSelected ? "var(--surface-hover)" : "transparent" }}
                 onMouseEnter={() => setSelectedIndex(i)} onMouseLeave={() => setSelectedIndex(-1)}>
              <button onClick={(e) => handleToggleFollow(e, w.code)}
                aria-label={followed ? t("alerts.unfollow") : t("alerts.follow")}
                title={followed ? t("alerts.unfollow") : t("alerts.follow")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: followed ? "var(--accent)" : "var(--text-muted)", display: "flex", flexShrink: 0, opacity: followed ? 1 : 0.5, transition: "opacity 0.2s", width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                {followed ? <BellFilledIcon size={14} /> : <BellIcon size={14} />}
              </button>
              <button onClick={() => handleItemClick(w, i)}
                style={{ display: "block", width: "100%", textAlign: "start", background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                    {!filtered && <span style={{ color: "var(--text-muted)", marginInlineEnd: 7 }}>{i + 1}</span>}
                    {wilayaName(w.code, locale) || w.name}
                  </span>
                  {!!fireCount && <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{fireCount}</span>}
                </div>
                {!filtered && (
                  <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                    <div style={{ width: `${(fireCount / max) * 100}%`, height: "100%", borderRadius: 99, background: "var(--accent)" }} />
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
      {filtered?.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>
          {t("common.unknown")}
        </div>
      )}
    </>
  );

  const iconBtn: React.CSSProperties = {
    position: "absolute", zIndex: 19,
    width: 48, height: 48, borderRadius: 12,
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)",
    cursor: "pointer", display: "grid", placeItems: "center",
    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    transition: "background 0.15s, color 0.15s",
  };

  if (isMobile) {
    return (
      <>
        {!expanded && (
          <button
            onClick={toggleExpand}
            aria-label={t("wilayaRanking.searchPlaceholder")}
            title={t("wilayaRanking.searchPlaceholder")}
            style={{ ...iconBtn, bottom: 100, insetInlineEnd: 16 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <SearchIcon size={22} />
          </button>
        )}
        <div
          ref={panelRef}
          className="glass"
          style={{
            position: "fixed", insetInlineStart: 12, insetInlineEnd: 12, bottom: 0, zIndex: 22,
            padding: 16, borderRadius: "16px 16px 0 0",
            maxHeight: "70vh", overflowY: "auto",
            opacity: expanded ? 1 : 0,
            transform: expanded ? "translateY(0)" : "translateY(20px)",
            pointerEvents: expanded ? "auto" : "none",
            transition: "opacity 0.2s ease, transform 0.2s ease",
            transformOrigin: "bottom center",
          }}
        >
          {sharedPanelContent}
        </div>
      </>
    );
  }

  return (
    <>
      {!expanded && (
        <button
          onClick={toggleExpand}
          aria-label={t("wilayaRanking.searchPlaceholder")}
          title={t("wilayaRanking.searchPlaceholder")}
          style={{ ...iconBtn, top: 16, insetInlineEnd: 16 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        >
          <SearchIcon size={22} />
        </button>
      )}
      <div
        ref={panelRef}
        className="glass"
        style={{
          position: "absolute", top: 16, insetInlineEnd: 16, zIndex: 19,
          padding: 16, width: 340, borderRadius: 12,
          opacity: expanded ? 1 : 0,
          transform: expanded ? "scale(1) translateY(0)" : "scale(0.95) translateY(-4px)",
          pointerEvents: expanded ? "auto" : "none",
          transition: "opacity 0.2s ease, transform 0.2s ease",
          transformOrigin: "top right",
        }}
      >
        {sharedPanelContent}
      </div>
    </>
  );
}