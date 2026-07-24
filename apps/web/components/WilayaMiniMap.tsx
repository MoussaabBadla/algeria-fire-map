"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import polys from "@/lib/wilaya-polygons.json";
import { eventsKey, fetchEvents, type EventCollection } from "@/lib/api";

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const WORLD_RING = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

interface Geom { type: string; coordinates: number[][][] | number[][][][] }
interface Feat { type: "Feature"; properties: { code: number }; geometry: Geom }

const FEATURES = (polys as unknown as { features: Feat[] }).features;

function outerRings(geom: Geom): number[][][] {
  if (geom.type === "Polygon") return [(geom.coordinates as number[][][])[0]];
  if (geom.type === "MultiPolygon") return (geom.coordinates as number[][][][]).map((p) => p[0]);
  return [];
}

function boundsOf(geom: Geom): maplibregl.LngLatBounds {
  const b = new maplibregl.LngLatBounds();
  for (const ring of outerRings(geom)) for (const c of ring) b.extend(c as [number, number]);
  return b;
}

// Whether the map has a polygon for this wilaya (codes 1–58; 59–69 are delegated
// wilayas without their own boundary and simply render no map).
export function hasWilayaPolygon(code: number): boolean {
  return FEATURES.some((f) => f.properties.code === code);
}

export default function WilayaMiniMap({ code }: { code: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);

  const feature = FEATURES.find((f) => f.properties.code === code);
  const { data: incidents } = useSWR<EventCollection>(
    feature ? eventsKey({ wilaya: code, days: 3650, limit: 500 }) : null,
    fetchEvents,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !feature) return;
    const bounds = boundsOf(feature.geometry);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      bounds,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("style.load", () => {
      // Mask everything outside this wilaya (world with the wilaya punched out).
      const mask = {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Polygon" as const, coordinates: [WORLD_RING, ...outerRings(feature.geometry)] },
      };
      map.addSource("mask", { type: "geojson", data: mask });
      map.addLayer({ id: "mask", type: "fill", source: "mask", paint: { "fill-color": "#04050a", "fill-opacity": 0.72 } });

      map.addSource("wilaya", { type: "geojson", data: feature as unknown as GeoJSON.Feature });
      map.addLayer({ id: "wilaya-fill", type: "fill", source: "wilaya", paint: { "fill-color": "#ff7a1a", "fill-opacity": 0.06 } });
      map.addLayer({ id: "wilaya-line", type: "line", source: "wilaya", paint: { "line-color": "#ff9e3d", "line-width": 1.6, "line-opacity": 0.9 } });

      map.addSource("inc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "inc-points", type: "circle", source: "inc",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "detection_count"], 1, 4, 200, 13],
          "circle-color": ["case", ["boolean", ["get", "is_active"], false], "#fb5607", "#64748b"],
          "circle-opacity": 0.8, "circle-stroke-color": "#fff", "circle-stroke-width": 0.7, "circle-stroke-opacity": 0.7,
        },
      });
      readyRef.current = true;
      map.resize(); // container may have grown after the dynamic import mounted
      map.fitBounds(bounds, { padding: 24, animate: false });
      const src = map.getSource("inc") as maplibregl.GeoJSONSource | undefined;
      if (src && incidents) src.setData(incidents as unknown as GeoJSON.FeatureCollection);
    });

    // Keep the canvas matched to the container (responsive / late layout).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Push incidents when they load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !incidents) return;
    const src = map.getSource("inc") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(incidents as unknown as GeoJSON.FeatureCollection);
  }, [incidents]);

  if (!feature) return null;
  return <div ref={containerRef} style={{ width: "100%", height: 300, borderRadius: 14, overflow: "hidden" }} />;
}
