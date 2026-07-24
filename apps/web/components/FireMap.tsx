"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FireCollection, RiskData, SelectedFire } from "@/lib/api";
import { riskColor, riskLabel } from "@/lib/risk";
import { styleFor, type MapStyleKey } from "@/lib/mapStyles";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { dirFor, type Locale, type Translator } from "@/lib/i18n/config";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import wilayasData from "@/lib/wilayas.json";
import algeriaBorder from "@/lib/algeria-border.json";

const INITIAL_CENTER: [number, number] = [3.2, 34.9];
const INITIAL_ZOOM = 5.3;

const FIRES_SRC = "fires";
const HEAT_LAYER = "fires-heat";
const CIRCLE_LAYER = "fires-circles";
const WILAYA_SRC = "wilayas";
const WILAYA_LAYER = "wilaya-labels";
const RISK_SRC = "risk";
const RISK_LAYER = "risk-circles";
const MASK_SRC = "mask";
const BORDER_SRC = "algeria-border";

const EMPTY: FireCollection = {
  type: "FeatureCollection",
  features: [],
  properties: { generated_at: "", days: 1, count: 0, sources: [], aoi_bbox: "" },
};

// Arabic (and other RTL) labels need this plugin to shape/join glyphs correctly;
// without it Arabic renders as disconnected, reversed letters. Set once, globally.
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

// Mask = whole world with Algeria punched out → dims neighbouring countries.
const WORLD_RING = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
const ALGERIA_RING = (algeriaBorder as { coordinates: number[][][] }).coordinates[0];
const MASK_FEATURE = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Polygon" as const, coordinates: [WORLD_RING, ALGERIA_RING] },
};

const FRP_COLOR: maplibregl.ExpressionSpecification = [
  "interpolate", ["linear"], ["get", "frp"],
  0, "#ffe066", 5, "#ffa630", 20, "#fb5607", 50, "#e01e37", 100, "#a4133c",
];

interface Props {
  data: FireCollection | undefined;
  selected: SelectedFire | null;
  onSelect: (fire: SelectedFire | null) => void;
  styleKey: MapStyleKey;
  isMobile: boolean;
  focus: { lng: number; lat: number; zoom: number; nonce: number } | null;
  riskData: RiskData | undefined;
  showRisk: boolean;
}

const RISK_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  "match", ["get", "class"],
  "very-low", "#16a34a",
  "low", "#84cc16",
  "moderate", "#eab308",
  "high", "#f97316",
  "very-high", "#ef4444",
  "extreme", "#991b1b",
  "#eab308",
];

// Wilaya labels: Arabic uses the `name_ar` property (shaped by the RTL text
// plugin); every other locale uses the Latin `name`.
function wilayaTextField(locale: Locale): maplibregl.ExpressionSpecification {
  return ["get", locale === "ar" ? "name_ar" : "name"];
}

function riskGeoJSON(risk: RiskData | undefined): GeoJSON.FeatureCollection {
  if (!risk) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: risk.wilayas.map((w) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [w.lng, w.lat] },
      properties: { code: w.code, name: w.name, fwi: w.fwi, class: w.class, temp: w.temp, rh: w.rh, wind: w.wind, forecast: JSON.stringify(w.forecast ?? []) },
    })),
  };
}

export default function FireMap({ data, selected, onSelect, styleKey, isMobile, focus, riskData, showRisk }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const riskDataRef = useRef(riskData);
  const showRiskRef = useRef(showRisk);
  riskDataRef.current = riskData;
  showRiskRef.current = showRisk;
  // The map click handler is bound once; read the latest translator/locale
  // through refs so popups always render in the current language.
  const tRef = useRef<Translator>(t);
  const localeRef = useRef<Locale>(locale);
  tRef.current = t;
  localeRef.current = locale;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const dataRef = useRef<FireCollection | undefined>(data);
  const onSelectRef = useRef(onSelect);
  const styleKeyRef = useRef(styleKey);
  onSelectRef.current = onSelect;
  styleKeyRef.current = styleKey;
  dataRef.current = data;

  // (Re)build all overlay sources & layers on top of whatever basemap is loaded.
  function setupLayers(map: maplibregl.Map) {
    const isSatellite = styleKeyRef.current === "satellite";

    if (!map.getSource(MASK_SRC)) map.addSource(MASK_SRC, { type: "geojson", data: MASK_FEATURE });
    map.addLayer({
      id: "mask-fill",
      type: "fill",
      source: MASK_SRC,
      paint: { "fill-color": "#04050a", "fill-opacity": isSatellite ? 0.55 : 0.72 },
    });

    if (!map.getSource(BORDER_SRC)) map.addSource(BORDER_SRC, { type: "geojson", data: algeriaBorder as never });
    map.addLayer({
      id: "border-glow",
      type: "line",
      source: BORDER_SRC,
      paint: { "line-color": "#ff9e3d", "line-width": 3, "line-blur": 3, "line-opacity": 0.5 },
    });
    map.addLayer({
      id: "border-line",
      type: "line",
      source: BORDER_SRC,
      paint: { "line-color": "#ffd9a0", "line-width": 1.2, "line-opacity": 0.9 },
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
        "text-color": isSatellite ? "#ffffff" : "#f2c98a",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.4,
        "text-opacity": 0.92,
      },
    });

    // Fire-risk (FWI) circles per wilaya — under the fires, toggled via visibility.
    if (!map.getSource(RISK_SRC)) map.addSource(RISK_SRC, { type: "geojson", data: riskGeoJSON(riskDataRef.current) });
    map.addLayer({
      id: RISK_LAYER,
      type: "circle",
      source: RISK_SRC,
      layout: { visibility: showRiskRef.current ? "visible" : "none" },
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          5, ["interpolate", ["linear"], ["get", "fwi"], 0, 7, 60, 17],
          9, ["interpolate", ["linear"], ["get", "fwi"], 0, 12, 60, 34],
        ],
        "circle-color": RISK_COLOR_EXPR,
        "circle-opacity": 0.5,
        "circle-blur": 0.3,
        "circle-stroke-color": RISK_COLOR_EXPR,
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.9,
      },
    });

    if (!map.getSource(FIRES_SRC)) map.addSource(FIRES_SRC, { type: "geojson", data: EMPTY, generateId: true });
    map.addLayer({
      id: HEAT_LAYER,
      type: "heatmap",
      source: FIRES_SRC,
      maxzoom: 9,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, 0.25, 60, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 9, 1.6],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(10,6,0,0)", 0.2, "rgba(255,224,102,0.35)", 0.4, "rgba(255,166,48,0.6)",
          0.6, "rgba(251,86,7,0.75)", 0.8, "rgba(224,30,55,0.85)", 1, "#a4133c",
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 14, 9, 30],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.9, 8.5, 0],
      },
    });
    map.addLayer({
      id: CIRCLE_LAYER,
      type: "circle",
      source: FIRES_SRC,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          5, ["interpolate", ["linear"], ["get", "frp"], 0, 2.5, 100, 7],
          11, ["interpolate", ["linear"], ["get", "frp"], 0, 6, 100, 18],
        ],
        "circle-color": FRP_COLOR,
        "circle-blur": 0.35,
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0, 7, 0.92],
        "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], "#ffffff", "rgba(255,255,255,0.25)"],
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 0.6],
      },
    });

    // Push current data onto the freshly-created source.
    const src = map.getSource(FIRES_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src && dataRef.current) src.setData(dataRef.current as unknown as GeoJSON.FeatureCollection);
  }

  // Init map once.
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
      // On mobile, keep attribution clear of the top pill / bottom dock.
      attributionControl: false,
    });
    mapRef.current = map;
    // On mobile every corner is used by the UI, so credit is shown in the dock instead.
    if (!mobile) {
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    }
    map.on("error", (e) => {
      const msg = e?.error?.message ?? "";
      if (/Failed to fetch|aborted|AbortError/i.test(msg)) return;
      console.error("[maplibre error]", msg || e);
    });

    // style.load fires on first load AND after every setStyle → (re)build overlays.
    map.on("style.load", () => {
      map.resize();
      setupLayers(map);
      readyRef.current = true;
    });

    // Single click handler with a tap tolerance so small fire dots are easy to hit
    // (bigger padding on touch to respect finger size).
    map.on("click", (e) => {
      const pad = isMobileRef.current ? 14 : 6;
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - pad, e.point.y - pad],
        [e.point.x + pad, e.point.y + pad],
      ];
      const hits = map.queryRenderedFeatures(box, { layers: [CIRCLE_LAYER] });
      if (hits.length === 0) {
        onSelectRef.current(null);
        return;
      }
      // Pick the hit nearest the tap point.
      let best = hits[0];
      let bestD = Infinity;
      for (const f of hits) {
        const c = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const pt = map.project(c as [number, number]);
        const d = (pt.x - e.point.x) ** 2 + (pt.y - e.point.y) ** 2;
        if (d < bestD) { bestD = d; best = f; }
      }
      const [lng, lat] = (best.geometry as GeoJSON.Point).coordinates as [number, number];
      onSelectRef.current({ id: best.id ?? `${lng},${lat}`, lng, lat, properties: best.properties as never });
    });
    map.on("mouseenter", CIRCLE_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", CIRCLE_LAYER, () => (map.getCanvas().style.cursor = ""));

    // Risk circle → FWI popup.
    map.on("click", RISK_LAYER, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { code: number; name: string; fwi: number; class: string; temp: number; rh: number; wind: number; forecast?: string };
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const t = tRef.current;
      const loc = localeRef.current;
      const dir = dirFor(loc);
      const name = wilayaName(p.code, loc) || p.name;
      let forecast: { fwi: number; class: string }[] = [];
      try {
        forecast = p.forecast ? JSON.parse(p.forecast) : [];
      } catch {
        forecast = [];
      }
      const labels = [t("mapPopup.today"), t("mapPopup.tomorrow"), t("mapPopup.in2Days")];
      const outlook = forecast.length
        ? `<div style="margin-top:9px;padding-top:8px;border-top:1px solid #eee">
             <div style="color:#777;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${t("mapPopup.outlook")}</div>
             ${forecast
               .map(
                 (d, i) =>
                   `<div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0;font-size:12px"><span style="color:#666">${labels[i] ?? ""}</span><span style="font-weight:600;color:${riskColor(d.class)}">${riskLabel(d.class, t)} · ${d.fwi}</span></div>`
               )
               .join("")}
           </div>`
        : "";
      const html = `
        <div dir="${dir}" style="font:13px system-ui,sans-serif;min-width:186px;color:#111;text-align:start">
          <div style="font-weight:700;font-size:14px">${name}</div>
          <div style="color:#777;font-size:11px;margin-bottom:8px">${t("mapPopup.fireWeatherRiskFwi")}</div>
          <div style="display:flex;align-items:baseline;gap:7px">
            <span style="font-size:26px;font-weight:800">${p.fwi}</span>
            <span style="font-weight:700;color:${riskColor(p.class)}">${riskLabel(p.class, t)}</span>
          </div>
          <div style="color:#666;font-size:12px;margin-top:7px">${p.temp}°C · ${p.rh}% ${t("mapPopup.rh")} · ${p.wind} km/h ${t("mapPopup.wind")}</div>
          ${outlook}
        </div>`;
      new maplibregl.Popup({ closeButton: true, maxWidth: "240px" }).setLngLat([lng, lat]).setHTML(html).addTo(map);
    });
    map.on("mouseenter", RISK_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", RISK_LAYER, () => (map.getCanvas().style.cursor = ""));

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap style (skips the very first render — map already has it).
  const firstStyle = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    readyRef.current = false;
    // diff:false forces a full reload so `style.load` fires and our overlays are re-added.
    map.setStyle(styleFor(styleKey), { diff: false });
  }, [styleKey]);

  // Push new fire data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !data) return;
    const src = map.getSource(FIRES_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data as unknown as GeoJSON.FeatureCollection);
  }, [data]);

  // Push risk data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource(RISK_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(riskGeoJSON(riskData));
  }, [riskData]);

  // Toggle risk layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer(RISK_LAYER)) map.setLayoutProperty(RISK_LAYER, "visibility", showRisk ? "visible" : "none");
  }, [showRisk]);

  // Re-label wilayas when the locale changes (Arabic ⇄ Latin).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer(WILAYA_LAYER)) map.setLayoutProperty(WILAYA_LAYER, "text-field", wilayaTextField(locale));
  }, [locale]);

  // Fly to a requested focus target (wilaya / search). `nonce` forces re-fire.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.easeTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // Selection → pulsing marker + ease-to.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!selected) return;

    const el = document.createElement("div");
    el.className = "fire-marker";
    markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([selected.lng, selected.lat]).addTo(map);

    const wide = typeof window !== "undefined" && window.innerWidth > 720;
    map.easeTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(map.getZoom(), 7.5),
      offset: wide ? [-190, 0] : [0, -140],
      duration: 700,
    });
  }, [selected]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
