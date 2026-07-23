"use client";

// Shared segmented control. `big` bumps touch targets to ~44px for mobile.
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent,
  big,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent?: boolean;
  big?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 4, padding: 3, background: "rgba(255,255,255,0.05)", borderRadius: 12 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              flex: 1,
              minHeight: big ? 44 : undefined,
              padding: big ? "0" : "7px 0",
              borderRadius: 9,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: big ? 13.5 : 12,
              transition: "all 0.2s ease",
              background: active ? (accent ? "var(--accent-grad)" : "rgba(255,255,255,0.16)") : "transparent",
              color: active ? "#fff" : "var(--text-secondary)",
              boxShadow: active && accent ? "0 2px 10px rgba(224,30,55,0.35)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
