"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import polys from "@/lib/wilaya-polygons.json";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";

const STYLE = "https://tiles.openfreemap.org/styles/dark";

interface Feat { type: "Feature"; properties: { code: number; confirmed?: number }; geometry: unknown }
const BASE_FEATURES = (polys as unknown as { features: Feat[] }).features;

// Value → colour: 0 = muted grey, then the app's fire ramp (yellow → crimson),
// so the choropleth reads with the same semantics as the fire-power legend.
const FILL_COLOR: maplibregl.ExpressionSpecification = [
  "interpolate", ["linear"], ["coalesce", ["get", "confirmed"], 0],
  0, "#334155", 1, "#ffe066", 100, "#ffa630", 400, "#fb5607", 900, "#e01e37", 1700, "#a4133c",
];

export default function NationalChoropleth({ totals }: { totals: { code: number; confirmed: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const router = useRouter();
  const { locale } = useLocale();
  const t = useTranslations();
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const byCode = new Map(totals.map((w) => [w.code, w.confirmed]));
    const features = BASE_FEATURES.map((f) => ({
      ...f,
      properties: { code: f.properties.code, confirmed: byCode.get(f.properties.code) ?? 0 },
    }));
    const data = { type: "FeatureCollection" as const, features };

    const bounds = new maplibregl.LngLatBounds();
    for (const f of features) {
      const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
      const rings = g.type === "Polygon" ? [(g.coordinates as number[][][])[0]] : (g.coordinates as number[][][][]).map((p) => p[0]);
      for (const r of rings) for (const c of r) bounds.extend(c as [number, number]);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      bounds,
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });

    map.on("style.load", () => {
      map.resize();
      map.fitBounds(bounds, { padding: 20, animate: false });
      map.addSource("wil", { type: "geojson", data: data as unknown as GeoJSON.FeatureCollection, promoteId: "code" });
      map.addLayer({ id: "wil-fill", type: "fill", source: "wil", paint: { "fill-color": FILL_COLOR, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.92, 0.72] } });
      map.addLayer({ id: "wil-line", type: "line", source: "wil", paint: { "line-color": "#0b0e14", "line-width": 0.6, "line-opacity": 0.6 } });
      map.addLayer({ id: "wil-hover-line", type: "line", source: "wil", paint: { "line-color": "#ffffff", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.8, 0] } });
    });

    let hovered: number | null = null;
    const setHover = (code: number | null) => {
      if (hovered !== null) map.setFeatureState({ source: "wil", id: hovered }, { hover: false });
      hovered = code;
      if (code !== null) map.setFeatureState({ source: "wil", id: code }, { hover: true });
    };

    map.on("mousemove", "wil-fill", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const code = f.properties?.code as number;
      const conf = f.properties?.confirmed as number;
      setHover(code);
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat).setHTML(
        `<div style="font:12px system-ui;color:#111"><b>${wilayaName(code, localeRef.current)}</b><br>${conf.toLocaleString(localeRef.current === "ar" ? "ar-DZ" : "en-US")} ${t("stats.topWilayas.confirmed")}</div>`
      ).addTo(map);
    });
    map.on("mouseleave", "wil-fill", () => { setHover(null); map.getCanvas().style.cursor = ""; popup.remove(); });
    map.on("click", "wil-fill", (e) => {
      const code = e.features?.[0]?.properties?.code as number | undefined;
      if (code && code <= 58) router.push(`/stats/${code}`);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: 380, borderRadius: 14, overflow: "hidden" }} />;
}
