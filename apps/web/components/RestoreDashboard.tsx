"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import useSWR from "swr";
import { fetchRestoration, restorationKey, type BurnScar, type LandCoverClass, type RestorationData } from "@/lib/api";
import type { MapStyleKey } from "@/lib/mapStyles";
import { useIsMobile } from "@/lib/useIsMobile";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import Segmented from "./Segmented";
import LanguageSwitcher from "./LanguageSwitcher";
import NavMenu from "./NavMenu";
import RestorePanel from "./RestorePanel";
import { SproutIcon, FlameIcon } from "./Icons";

function MapLoading() {
  const t = useTranslations();
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 14 }}>
      {t("common.loadingMap")}
    </div>
  );
}

const RestoreMap = dynamic(() => import("./RestoreMap"), { ssr: false, loading: () => <MapLoading /> });

type WindowKey = "30" | "60" | "120";
const WINDOW_DAYS: Record<WindowKey, number> = { "30": 30, "60": 60, "120": 120 };

type Focus = { lng: number; lat: number; zoom: number; nonce: number } | null;

export default function RestoreDashboard() {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const [styleKey, setStyleKey] = useState<MapStyleKey>("dark");
  const [win, setWin] = useState<WindowKey>("120");
  const [panelOpen, setPanelOpen] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const focusNonce = useRef(0);

  // Filters + selection are owned here so the MAP and the panel stay in sync.
  const [wilaya, setWilaya] = useState<number | "all">("all");
  const [landType, setLandType] = useState<LandCoverClass | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Measure the (full-width) header so the desktop panel can sit just below it,
  // regardless of how tall the header gets (locale, wrapping, control widths).
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(72);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, [isMobile]);
  const desktopPanelTop = 16 + headerH + 8; // header top(16) + its height + gap

  const { data } = useSWR<RestorationData>(restorationKey(WINDOW_DAYS[win]), fetchRestoration, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const flyTo = (lng: number, lat: number, zoom: number) => {
    focusNonce.current += 1;
    setFocus({ lng, lat, zoom, nonce: focusNonce.current });
  };

  // Map data follows the active filters (wilaya + land type) — not just the list.
  const mapData = useMemo<RestorationData | undefined>(() => {
    if (!data?.scars) return data;
    let scars = wilaya === "all" ? data.scars : data.scars.filter((s) => s.wilaya_code === wilaya);
    if (landType !== "all") scars = scars.filter((s) => s.land_cover?.dominant === landType);
    return { ...data, scars };
  }, [data, wilaya, landType]);

  // Selecting from the list → highlight on the map + fly to it (close sheet on mobile).
  const selectScar = (s: BurnScar) => {
    setSelectedId(s.id);
    flyTo(s.lng, s.lat, 9.5);
    if (isMobile) setPanelOpen(false);
  };
  // Selecting from the map (tap a scar) → highlight, keep the view.
  const selectFromMap = (id: number) => setSelectedId(id);

  const windowOptions: { key: WindowKey; label: string }[] = [
    { key: "30", label: t("restore.window.30") },
    { key: "60", label: t("restore.window.60") },
    { key: "120", label: t("restore.window.120") },
  ];
  const styleOptions: { key: MapStyleKey; label: string }[] = [
    { key: "dark", label: t("mapStyle.dark") },
    { key: "satellite", label: t("mapStyle.satellite") },
    { key: "light", label: t("mapStyle.light") },
  ];

  return (
    <main style={{ position: "fixed", inset: 0, background: "var(--bg)" }}>
      <RestoreMap data={mapData} styleKey={styleKey} isMobile={isMobile} focus={focus} selectedId={selectedId} onSelectScar={selectFromMap} />

      {/* Header */}
      <div
        ref={headerRef}
        className="glass"
        style={{
          position: "absolute", top: isMobile ? "calc(env(safe-area-inset-top) + 8px)" : 16,
          insetInlineStart: isMobile ? 8 : 16, insetInlineEnd: isMobile ? 8 : 16,
          zIndex: 20, padding: isMobile ? "8px 10px" : "10px 14px",
          display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: "#16a34a", flexShrink: 0 }}>
            <SproutIcon size={17} color="#fff" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 13.5 : 15, fontWeight: 800, color: "var(--text)", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t("restore.title")}
            </div>
            {!isMobile && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{t("restore.subtitle")}</div>
            )}
          </div>
        </div>

        {/* Control cluster: kept together so it wraps as a unit on narrow desktop. */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, whiteSpace: "nowrap" }}>
            <span style={{ width: 1, height: 26, background: "var(--border)" }} aria-hidden />
            <Segmented options={windowOptions} value={win} onChange={setWin} />
            <Segmented options={styleOptions} value={styleKey} onChange={setStyleKey} />
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Link
            href="/"
            aria-label={t("restore.toFireMap")}
            title={t("restore.toFireMap")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: isMobile ? 34 : 38, padding: isMobile ? "0 10px" : "0 13px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,122,26,0.10)", color: "var(--text)", textDecoration: "none", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            <FlameIcon size={15} color="#ff7a1a" />
            {!isMobile && t("restore.toFireMap")}
          </Link>
          <LanguageSwitcher compact />
          <NavMenu size={isMobile ? 34 : 38} />
        </div>
      </div>

      {/* Mobile window selector row */}
      {isMobile && (
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 56px)", insetInlineStart: 8, insetInlineEnd: 8, zIndex: 19 }}>
          <Segmented options={windowOptions} value={win} onChange={setWin} big />
        </div>
      )}

      {/* Panel: always shown on desktop; toggled sheet on mobile */}
      {!isMobile && (
        <RestorePanel
          data={data} onSelect={selectScar} isMobile={false} desktopTop={desktopPanelTop}
          wilaya={wilaya} onWilaya={setWilaya} landType={landType} onLandType={setLandType} selectedId={selectedId}
        />
      )}
      {isMobile && panelOpen && (
        <RestorePanel
          data={data} onSelect={selectScar} isMobile onClose={() => setPanelOpen(false)}
          wilaya={wilaya} onWilaya={setWilaya} landType={landType} onLandType={setLandType} selectedId={selectedId}
        />
      )}

      {/* Mobile open-list button */}
      {isMobile && !panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          style={{
            position: "absolute", bottom: "calc(env(safe-area-inset-bottom) + 14px)", insetInlineStart: "50%", transform: "translateX(-50%)",
            zIndex: 20, display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 999,
            border: "none", background: "#16a34a", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 6px 20px rgba(22,163,74,0.5)",
          }}
        >
          <SproutIcon size={17} color="#fff" />
          {t("restore.showList", { n: mapData?.scars?.length ?? data?.totals?.scars ?? 0 })}
        </button>
      )}
    </main>
  );
}
