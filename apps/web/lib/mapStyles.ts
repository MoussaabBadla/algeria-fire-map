// Basemap styles the user can switch between.
import type { StyleSpecification } from "maplibre-gl";

export type MapStyleKey = "dark" | "satellite" | "light";

const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// Free satellite imagery (Esri World Imagery) as a raster style.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "sat", type: "raster", source: "sat" }],
};

export interface MapStyleDef {
  key: MapStyleKey; // display label comes from t(`mapStyle.${key}`)
  style: string | StyleSpecification;
}

export const MAP_STYLES: MapStyleDef[] = [
  { key: "dark", style: "https://tiles.openfreemap.org/styles/dark" },
  { key: "satellite", style: SATELLITE_STYLE },
  { key: "light", style: "https://tiles.openfreemap.org/styles/positron" },
];

export function styleFor(key: MapStyleKey): string | StyleSpecification {
  return (MAP_STYLES.find((s) => s.key === key) ?? MAP_STYLES[0]).style;
}
