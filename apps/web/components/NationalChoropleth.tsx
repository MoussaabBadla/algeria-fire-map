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

// Value → colour, scaled to the data max so it works for any metric/year.
function fillColor(maxV: number): maplibregl.ExpressionSpecification {
  const m = Math.max(maxV, 1);
  return [
    "interpolate", ["linear"], ["coalesce", ["get", "confirmed"], 0],
    0, "#334155",
    Math.max(1, m * 0.02), "#ffe066",
    m * 0.12, "#ffa630",
    m * 0.3, "#fb5607",
    m * 0.6, "#e01e37",
    m, "#a4133c",
  ];
}

function buildData(totals: { code: number; confirmed: number }[]) {
  const byCode = new Map(totals.map((w) => [w.code, w.confirmed]));
  return {
    type: "FeatureCollection" as const,
    features: BASE_FEATURES.map((f) => ({ ...f, properties: { code: f.properties.code, confirmed: byCode.get(f.properties.code) ?? 0 } })),
  };
}

export default function NationalChoropleth({ totals, unit }: { totals: { code: number; confirmed: number }[]; unit: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const router = useRouter();
  const { locale } = useLocale();
  const t = useTranslations();
  const localeRef = useRef(locale); localeRef.current = locale;
  const unitRef = useRef(unit); unitRef.current = unit;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const data = buildData(totals);
    const bounds = new maplibregl.LngLatBounds();
    for (const f of data.features) {
      const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
      const rings = g.type === "Polygon" ? [(g.coordinates as number[][][])[0]] : (g.coordinates as number[][][][]).map((p) => p[0]);
      for (const r of rings) for (const c of r) bounds.extend(c as [number, number]);
    }
    const map = new maplibregl.Map({ container: containerRef.current, style: STYLE, bounds, fitBoundsOptions: { padding: 20 }, attributionControl: false, dragRotate: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });

    map.on("style.load", () => {
      map.resize();
      map.fitBounds(bounds, { padding: 20, animate: false });
      const max = Math.max(...totals.map((w) => w.confirmed), 1);
      map.addSource("wil", { type: "geojson", data: data as unknown as GeoJSON.FeatureCollection, promoteId: "code" });
      map.addLayer({ id: "wil-fill", type: "fill", source: "wil", paint: { "fill-color": fillColor(max), "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.92, 0.72] } });
      map.addLayer({ id: "wil-line", type: "line", source: "wil", paint: { "line-color": "#0b0e14", "line-width": 0.6, "line-opacity": 0.6 } });
      map.addLayer({ id: "wil-hover-line", type: "line", source: "wil", paint: { "line-color": "#ffffff", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.8, 0] } });
      readyRef.current = true;
    });

    let hovered: number | null = null;
    const setHover = (code: number | null) => {
      if (hovered !== null) map.setFeatureState({ source: "wil", id: hovered }, { hover: false });
      hovered = code;
      if (code !== null) map.setFeatureState({ source: "wil", id: code }, { hover: true });
    };
    map.on("mousemove", "wil-fill", (e) => {
      const f = e.features?.[0]; if (!f) return;
      const code = f.properties?.code as number;
      const val = f.properties?.confirmed as number;
      setHover(code);
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat).setHTML(`<div style="font:12px system-ui;color:#111"><b>${wilayaName(code, localeRef.current)}</b><br>${val.toLocaleString(localeRef.current === "ar" ? "ar-DZ" : "en-US")} ${unitRef.current}</div>`).addTo(map);
    });
    map.on("mouseleave", "wil-fill", () => { setHover(null); map.getCanvas().style.cursor = ""; popup.remove(); });
    map.on("click", "wil-fill", (e) => {
      const code = e.features?.[0]?.properties?.code as number | undefined;
      if (code && code <= 58) router.push(`/stats/${code}`);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to filter changes: update fills + colour scale.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("wil") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(buildData(totals) as unknown as GeoJSON.FeatureCollection);
    const max = Math.max(...totals.map((w) => w.confirmed), 1);
    if (map.getLayer("wil-fill")) map.setPaintProperty("wil-fill", "fill-color", fillColor(max));
  }, [totals]);

  return <div ref={containerRef} style={{ width: "100%", height: 360, borderRadius: 14, overflow: "hidden" }} />;
}
