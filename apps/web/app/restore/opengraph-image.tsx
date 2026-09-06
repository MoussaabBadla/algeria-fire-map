import { ImageResponse } from "next/og";

export const alt = "Algeria Reforestation & Land Recovery Map — burned areas to replant";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "radial-gradient(1000px 500px at 85% -10%, #0d3a1a 0%, #07080c 60%)",
          color: "#f5f6f8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: 26,
              background: "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21v-8" />
              <path d="M12 13c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z" />
              <path d="M12 11c0-3 2.5-5 6-5 0 3-2.5 5-6 5Z" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, color: "#4ade80", fontWeight: 700, letterSpacing: 2 }}>GREEN RECOVERY</div>
            <div style={{ fontSize: 26, color: "#a4a7b2" }}>Algeria · NASA FIRMS + ESA WorldCover</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -1 }}>Reforestation &amp; Recovery</div>
          <div style={{ fontSize: 34, color: "#c9ccd6" }}>
            Recent burned areas across Algeria, priority-ranked for replanting
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 28, color: "#4ade80", fontWeight: 700 }}>algeriafiremap.site/restore</div>
          <div style={{ display: "flex", gap: 10 }}>
            {["#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d"].map((c) => (
              <div key={c} style={{ width: 26, height: 26, borderRadius: 26, background: c }} />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
