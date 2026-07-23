"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FireCollection } from "@/lib/api";
import type { SelectedFire } from "@/lib/api";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const INITIAL_CENTER: [number, number] = [3.2, 34.9];
const INITIAL_ZOOM = 5.3;

const SOURCE_ID = "fires";
const HEAT_LAYER = "fires-heat";
const CIRCLE_LAYER = "fires-circles";

const EMPTY: FireCollection = {
  type: "FeatureCollection",
  features: [],
  properties: { generated_at: "", days: 1, count: 0, sources: [], aoi_bbox: "" },
};

// Fire-power ramp — mirrors --fire-* tokens and lib/fire.ts.
const FRP_COLOR: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "frp"],
  0, "#ffe066",
  5, "#ffa630",
  20, "#fb5607",
  50, "#e01e37",
  100, "#a4133c",
];

interface Props {
  data: FireCollection | undefined;
  selected: SelectedFire | null;
  onSelect: (fire: SelectedFire | null) => void;
}

export default function FireMap({ data, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const selectedIdRef = useRef<number | string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 4,
      maxZoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("error", (e) => {
      // Ignore benign tile aborts that happen during fast pan/zoom.
      const msg = e?.error?.message ?? "";
      if (/Failed to fetch|aborted|AbortError/i.test(msg)) return;
      console.error("[maplibre error]", msg || e);
    });

    map.on("load", () => {
      map.resize();
      map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY, generateId: true });

      // Density glow — dominant at overview zoom, fades out as you zoom in.
      map.addLayer({
        id: HEAT_LAYER,
        type: "heatmap",
        source: SOURCE_ID,
        maxzoom: 9,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, 0.25, 60, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 9, 1.6],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(10,6,0,0)",
            0.2, "rgba(255,224,102,0.35)",
            0.4, "rgba(255,166,48,0.6)",
            0.6, "rgba(251,86,7,0.75)",
            0.8, "rgba(224,30,55,0.85)",
            1, "#a4133c",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 14, 9, 30],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.9, 8.5, 0],
        },
      });

      // Precise glowing points — fade in as heatmap fades out.
      map.addLayer({
        id: CIRCLE_LAYER,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            5, ["interpolate", ["linear"], ["get", "frp"], 0, 2.5, 100, 7],
            11, ["interpolate", ["linear"], ["get", "frp"], 0, 6, 100, 18],
          ],
          "circle-color": FRP_COLOR,
          "circle-blur": 0.35,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0, 7, 0.92],
          "circle-stroke-color": [
            "case", ["boolean", ["feature-state", "selected"], false], "#ffffff", "rgba(255,255,255,0.25)",
          ],
          "circle-stroke-width": [
            "case", ["boolean", ["feature-state", "selected"], false], 2.5, 0.6,
          ],
        },
      });

      readyRef.current = true;
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (src && data) src.setData(data as unknown as GeoJSON.FeatureCollection);

      const pick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        onSelectRef.current({ id: f.id ?? `${lng},${lat}`, lng, lat, properties: f.properties as never });
      };
      map.on("click", CIRCLE_LAYER, pick);
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: [CIRCLE_LAYER] });
        if (hits.length === 0) onSelectRef.current(null);
      });
      map.on("mouseenter", CIRCLE_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", CIRCLE_LAYER, () => (map.getCanvas().style.cursor = ""));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new fire data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !data) return;
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data as unknown as GeoJSON.FeatureCollection);
  }, [data]);

  // Reflect selection: feature-state highlight + pulsing marker + ease-to.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (selectedIdRef.current != null) {
      map.setFeatureState({ source: SOURCE_ID, id: selectedIdRef.current }, { selected: false });
      selectedIdRef.current = null;
    }
    markerRef.current?.remove();
    markerRef.current = null;

    if (!selected) return;

    if (selected.id != null && typeof selected.id !== "string") {
      map.setFeatureState({ source: SOURCE_ID, id: selected.id }, { selected: true });
      selectedIdRef.current = selected.id;
    }

    const el = document.createElement("div");
    el.className = "fire-marker";
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([selected.lng, selected.lat])
      .addTo(map);

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
