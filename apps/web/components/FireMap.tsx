"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FireCollection, SelectedFire } from "@/lib/api";
import { styleFor, type MapStyleKey } from "@/lib/mapStyles";
import wilayasData from "@/lib/wilayas.json";
import algeriaBorder from "@/lib/algeria-border.json";

const INITIAL_CENTER: [number, number] = [3.2, 34.9];
const INITIAL_ZOOM = 5.3;

const FIRES_SRC = "fires";
const HEAT_LAYER = "fires-heat";
const CIRCLE_LAYER = "fires-circles";
const WILAYA_SRC = "wilayas";
const WILAYA_LAYER = "wilaya-labels";
const MASK_SRC = "mask";
const BORDER_SRC = "algeria-border";

const EMPTY: FireCollection = {
  type: "FeatureCollection",
  features: [],
  properties: { generated_at: "", days: 1, count: 0, sources: [], aoi_bbox: "" },
};

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
}

export default function FireMap({ data, selected, onSelect, styleKey }: Props) {
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
        "text-field": ["get", "name"],
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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(styleKeyRef.current),
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 4,
      maxZoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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

    // Bind interaction handlers once (they target layer ids that persist across styles).
    const pick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      onSelectRef.current({ id: f.id ?? `${lng},${lat}`, lng, lat, properties: f.properties as never });
    };
    map.on("click", CIRCLE_LAYER, pick);
    map.on("click", (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: [CIRCLE_LAYER] }).length === 0) onSelectRef.current(null);
    });
    map.on("mouseenter", CIRCLE_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", CIRCLE_LAYER, () => (map.getCanvas().style.cursor = ""));

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
