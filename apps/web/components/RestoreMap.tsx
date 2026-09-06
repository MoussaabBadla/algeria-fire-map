"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BurnScar, RestorationData } from "@/lib/api";
import { styleFor, type MapStyleKey } from "@/lib/mapStyles";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { dirFor, type Locale, type Translator } from "@/lib/i18n/config";
import wilayasData from "@/lib/wilayas.json";
import algeriaBorder from "@/lib/algeria-border.json";

const INITIAL_CENTER: [number, number] = [4.5, 35.5]; // biased to the forested north
const INITIAL_ZOOM = 5.4;

const WILAYA_SRC = "wilayas";
const WILAYA_LAYER = "wilaya-labels";
const MASK_SRC = "mask";
const BORDER_SRC = "algeria-border";
const SCAR_HULL_SRC = "scar-hulls";
const SCAR_POINT_SRC = "scar-points";
const SCAR_HULL_FILL = "scar-hull-fill";
const SCAR_HULL_LINE = "scar-hull-line";
const SCAR_POINT_LAYER = "scar-points-layer";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Restoration priority → green recovery ramp (deep green = more urgent to
// replant, light green = lower). Green/white identity for the recovery map,
// distinct from the fire map's yellow→red heat.
const PRIORITY_COLOR: maplibregl.ExpressionSpecification = [
  "match", ["get", "priority"],
  "high", "#15803d", "medium", "#22c55e", "low", "#86efac", "#22c55e",
];
// Fixed, readable brand green for white-text CTAs (directions button).
const BRAND_GREEN = "#16a34a";

let rtlPluginSet = false;
function ensureRTLPlugin() {
  if (rtlPluginSet) return;
  rtlPluginSet = true;
  try {
    maplibregl
      .setRTLTextPlugin("https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js", true)
      .catch(() => {});
  } catch {
    /* already set or unavailable */
  }
}

const WORLD_RING = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
const ALGERIA_RING = (algeriaBorder as { coordinates: number[][][] }).coordinates[0];
const MASK_FEATURE = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Polygon" as const, coordinates: [WORLD_RING, ALGERIA_RING] },
};

function wilayaTextField(locale: Locale): maplibregl.ExpressionSpecification {
  return ["get", locale === "ar" ? "name_ar" : "name"];
}

// Burn-scar centroids → point GeoJSON (carries everything the popup needs).
function scarPoints(d: RestorationData | undefined): GeoJSON.FeatureCollection {
  if (!d?.scars) return EMPTY_FC;
  return {
    type: "FeatureCollection",
    features: d.scars.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        priority: s.priority,
        area_ha: s.area_ha,
        max_frp: s.max_frp,
        days_since: s.days_since,
        wilaya_name: s.wilaya_name,
        wilaya_name_ar: s.wilaya_name_ar,
        nearest_community: s.nearest_community,
        nearest_community_ar: s.nearest_community_ar,
        nearest_community_m: s.nearest_community_m,
        population_nearby: s.population_nearby,
        lc_dominant: s.land_cover?.dominant ?? null,
        lc_forest: s.land_cover?.forest ?? null,
        lc_cropland: s.land_cover?.cropland ?? null,
      },
    })),
  };
}

// Land-cover class colours (mirror RestorePanel).
const LC_COLOR: Record<string, string> = {
  forest: "#15803d", cropland: "#d97706", grass: "#84cc16", shrub: "#4d7c0f", other: "#78716c",
};

// Burn-scar footprint hulls → polygon GeoJSON.
function scarHulls(d: RestorationData | undefined): GeoJSON.FeatureCollection {
  if (!d?.scars) return EMPTY_FC;
  return {
    type: "FeatureCollection",
    features: d.scars
      .filter((s) => s.hull)
      .map((s) => ({
        type: "Feature",
        geometry: s.hull as GeoJSON.Polygon,
        properties: { id: s.id, priority: s.priority },
      })),
  };
}

interface Props {
  data: RestorationData | undefined;
  styleKey: MapStyleKey;
  isMobile: boolean;
  focus: { lng: number; lat: number; zoom: number; nonce: number } | null;
  selectedId?: number | null;
  onSelectScar?: (id: number) => void;
}

export default function RestoreMap({ data, styleKey, isMobile, focus, selectedId = null, onSelectScar }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const dataRef = useRef(data);
  const styleKeyRef = useRef(styleKey);
  const isMobileRef = useRef(isMobile);
  const tRef = useRef<Translator>(t);
  const localeRef = useRef<Locale>(locale);
  const onSelectRef = useRef(onSelectScar);
  const selectedRef = useRef<number | null>(selectedId);
  dataRef.current = data;
  styleKeyRef.current = styleKey;
  isMobileRef.current = isMobile;
  tRef.current = t;
  localeRef.current = locale;
  onSelectRef.current = onSelectScar;

  function setupLayers(map: maplibregl.Map) {
    const isSatellite = styleKeyRef.current === "satellite";

    if (!map.getSource(MASK_SRC)) map.addSource(MASK_SRC, { type: "geojson", data: MASK_FEATURE });
    map.addLayer({
      id: "mask-fill",
      type: "fill",
      source: MASK_SRC,
      paint: { "fill-color": "#04050a", "fill-opacity": isSatellite ? 0.5 : 0.68 },
    });

    if (!map.getSource(BORDER_SRC)) map.addSource(BORDER_SRC, { type: "geojson", data: algeriaBorder as never });
    map.addLayer({
      id: "border-glow",
      type: "line",
      source: BORDER_SRC,
      paint: { "line-color": "#4ade80", "line-width": 3, "line-blur": 3, "line-opacity": 0.4 },
    });
    map.addLayer({
      id: "border-line",
      type: "line",
      source: BORDER_SRC,
      paint: { "line-color": "#bbf7d0", "line-width": 1.1, "line-opacity": 0.85 },
    });

    if (!map.getSource(WILAYA_SRC)) map.addSource(WILAYA_SRC, { type: "geojson", data: wilayasData as never });
    map.addLayer({
      id: WILAYA_LAYER,
      type: "symbol",
      source: WILAYA_SRC,
      layout: {
        "text-field": wilayaTextField(localeRef.current),
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9.5, 9, 13],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
        "text-max-width": 8,
        "text-padding": 6,
      },
      paint: {
        "text-color": isSatellite ? "#ffffff" : "#cbd5c0",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.4,
        "text-opacity": 0.9,
      },
    });

    // Burn-scar footprint hulls (fill + outline), coloured by restoration priority.
    if (!map.getSource(SCAR_HULL_SRC)) map.addSource(SCAR_HULL_SRC, { type: "geojson", data: scarHulls(dataRef.current) });
    map.addLayer({
      id: SCAR_HULL_FILL,
      type: "fill",
      source: SCAR_HULL_SRC,
      paint: { "fill-color": PRIORITY_COLOR, "fill-opacity": 0.18 },
    });
    map.addLayer({
      id: SCAR_HULL_LINE,
      type: "line",
      source: SCAR_HULL_SRC,
      paint: { "line-color": PRIORITY_COLOR, "line-width": 1.1, "line-opacity": 0.65 },
    });

    // Centroid points — radius grows with burned area (bigger job = bigger dot).
    // promoteId lets us drive the selected highlight via feature-state by scar id.
    if (!map.getSource(SCAR_POINT_SRC)) map.addSource(SCAR_POINT_SRC, { type: "geojson", data: scarPoints(dataRef.current), promoteId: "id" });
    map.addLayer({
      id: SCAR_POINT_LAYER,
      type: "circle",
      source: SCAR_POINT_SRC,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          5, ["*", ["case", ["boolean", ["feature-state", "selected"], false], 1.6, 1.0], ["interpolate", ["linear"], ["get", "area_ha"], 0, 3.5, 5000, 11]],
          10, ["*", ["case", ["boolean", ["feature-state", "selected"], false], 1.6, 1.0], ["interpolate", ["linear"], ["get", "area_ha"], 0, 6, 5000, 24]],
        ],
        "circle-color": PRIORITY_COLOR,
        "circle-opacity": 0.9,
        "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], "#ffffff", "#ffffff"],
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 4, ["match", ["get", "priority"], "high", 1.8, "medium", 1.2, 0.7]],
        "circle-stroke-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0.85],
      },
    });
    // Re-apply the selected highlight after the layer (re)builds.
    applySelected(map, selectedRef.current, null);
  }

  // Move the `selected` feature-state from `prev` to `next` (both scar ids).
  function applySelected(map: maplibregl.Map, next: number | null, prev: number | null) {
    if (!map.getSource(SCAR_POINT_SRC)) return;
    if (prev != null) map.setFeatureState({ source: SCAR_POINT_SRC, id: prev }, { selected: false });
    if (next != null) map.setFeatureState({ source: SCAR_POINT_SRC, id: next }, { selected: true });
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureRTLPlugin();
    const mobile = isMobileRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(styleKeyRef.current),
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 4,
      maxZoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    if (!mobile) {
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    }
    map.on("error", (e) => {
      const msg = e?.error?.message ?? "";
      if (/Failed to fetch|aborted|AbortError/i.test(msg)) return;
      console.error("[maplibre error]", msg || e);
    });

    map.on("style.load", () => {
      map.resize();
      setupLayers(map);
      readyRef.current = true;
    });

    // Burn-scar → restoration popup.
    const openScarPopup = (
      p: {
        priority: "high" | "medium" | "low"; area_ha: number; max_frp: number | null;
        days_since: number | null; wilaya_name: string | null; wilaya_name_ar: string | null;
        nearest_community: string | null; nearest_community_ar: string | null;
        nearest_community_m: number | null; population_nearby: number | null;
        lc_dominant: string | null; lc_forest: number | null; lc_cropland: number | null;
      },
      lng: number,
      lat: number
    ) => {
      const tr = tRef.current;
      const loc = localeRef.current;
      const dir = dirFor(loc);
      const wname = (loc === "ar" ? p.wilaya_name_ar : p.wilaya_name) || "";
      const community = (loc === "ar" ? p.nearest_community_ar : p.nearest_community) || p.nearest_community || "";
      // Readable-on-white greens for the popup dot; the CTA uses the fixed brand green.
      const color = p.priority === "high" ? "#15803d" : p.priority === "medium" ? "#16a34a" : "#22c55e";
      const prioLabel = tr(`restore.priority.${p.priority}`);
      const areaStr = Math.round(p.area_ha).toLocaleString(loc === "ar" ? "ar-DZ" : "en-US");
      const when = p.days_since != null
        ? (p.days_since <= 1 ? tr("restore.burnedRecently") : tr("restore.daysAgo", { n: String(p.days_since) }))
        : "—";
      const row = (label: string, val: string) =>
        `<div style="display:flex;justify-content:space-between;gap:14px;padding:2px 0;font-size:12px"><span style="color:#666">${label}</span><span style="font-weight:600;color:#111">${val}</span></div>`;
      const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      const html = `
        <div dir="${dir}" style="font:13px system-ui,sans-serif;min-width:216px;color:#111;text-align:start">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div style="font-weight:700;font-size:14px">${community || tr("restore.burnScar")}</div>
            <span style="font-size:11px;font-weight:700;color:${color}">● ${prioLabel}</span>
          </div>
          <div style="color:#777;font-size:11px;margin-bottom:8px">${tr("restore.burnScar")}${wname ? ` · ${wname}` : ""}</div>
          ${row(tr("restore.burnedArea"), tr("restore.hectares", { n: areaStr }))}
          ${p.lc_dominant ? `<div style="display:flex;justify-content:space-between;gap:14px;padding:2px 0;font-size:12px"><span style="color:#666">${tr("restore.landCoverLabel")}</span><span style="font-weight:700;color:${LC_COLOR[p.lc_dominant] || "#111"}">${tr(`restore.landCover.${p.lc_dominant}`)}${p.lc_forest ? ` · ${p.lc_forest}% ${tr("restore.landCover.forest").toLowerCase()}` : ""}</span></div>` : ""}
          ${row(tr("restore.burnedWhen"), when)}
          ${row(tr("restore.severity"), p.max_frp != null ? `${Math.round(p.max_frp)} MW` : "—")}
          ${p.population_nearby ? row(tr("restore.populationNearby"), p.population_nearby.toLocaleString(loc === "ar" ? "ar-DZ" : "en-US")) : ""}
          <a href="${gmaps}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:9px;padding:9px;border-radius:8px;background:${BRAND_GREEN};color:#fff;font-weight:700;font-size:12.5px;text-decoration:none"><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" style="flex-shrink:0"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>${tr("restore.directions")}</a>
          <div style="margin-top:7px;color:#999;font-size:10.5px;line-height:1.45">${tr("restore.advisoryShort")}</div>
        </div>`;
      new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat([lng, lat]).setHTML(html).addTo(map);
    };

    map.on("click", SCAR_POINT_LAYER, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const id = (f.properties as { id?: number }).id;
      if (id != null && onSelectRef.current) onSelectRef.current(Number(id));
      openScarPopup(f.properties as never, lng, lat);
    });
    map.on("mouseenter", SCAR_POINT_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", SCAR_POINT_LAYER, () => (map.getCanvas().style.cursor = ""));

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap switch.
  const firstStyle = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    readyRef.current = false;
    map.setStyle(styleFor(styleKey), { diff: false });
  }, [styleKey]);

  // Push new scar data (setData clears feature-state, so re-apply the selection).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const ps = map.getSource(SCAR_POINT_SRC) as maplibregl.GeoJSONSource | undefined;
    if (ps) ps.setData(scarPoints(data));
    const hs = map.getSource(SCAR_HULL_SRC) as maplibregl.GeoJSONSource | undefined;
    if (hs) hs.setData(scarHulls(data));
    applySelected(map, selectedRef.current, null);
  }, [data]);

  // Sync the selected highlight when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    const prev = selectedRef.current;
    selectedRef.current = selectedId;
    if (!map || !readyRef.current) return;
    applySelected(map, selectedId, prev);
  }, [selectedId]);

  // Re-label wilayas on locale change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer(WILAYA_LAYER)) map.setLayoutProperty(WILAYA_LAYER, "text-field", wilayaTextField(locale));
  }, [locale]);

  // Fly to a focus target.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.easeTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
