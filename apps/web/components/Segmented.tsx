"use client";

// Shared segmented control (Apple-style: neutral track, solid raised active
// segment — no gradients). An option may set `activeColor` to tint its active
// state (e.g. green for "Live"). `big` bumps touch targets to ~44px for mobile.
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  big,
  vertical,
}: {
  options: { key: T; label?: string; icon?: React.ReactNode; ariaLabel?: string; activeColor?: string }[];
  value: T;
  onChange: (v: T) => void;
  big?: boolean;
  vertical?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: 3, padding: 3, background: "rgba(255,255,255,0.06)", borderRadius: 10 }}>
      {options.map((o) => {
        const active = value === o.key;
        const bg = active ? o.activeColor ?? "rgba(255,255,255,0.16)" : "transparent";
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-label={o.ariaLabel ?? o.label}
            title={o.ariaLabel ?? o.label}
            style={{
              flex: vertical ? undefined : 1,
              minHeight: big ? 44 : vertical ? 19 : undefined,
              minWidth: vertical ? 24 : undefined,
              padding: big ? "0" : vertical ? "2px 5px" : "7px 0",
              borderRadius: 7,
              border: active && !o.activeColor ? "1px solid rgba(255,255,255,0.10)" : "1px solid transparent",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: big ? 13.5 : 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "background 0.18s ease, color 0.18s ease",
              background: bg,
              color: active ? "#fff" : "var(--text-secondary)",
              boxShadow: active ? (o.activeColor ? `0 2px 10px ${o.activeColor}55` : "0 1px 2px rgba(0,0,0,0.4)") : "none",
            }}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
