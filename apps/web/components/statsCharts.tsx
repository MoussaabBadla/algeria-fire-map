"use client";

// Shared, data-decoupled stats UI: SVG charts + tiles, used by both the
// national (/stats) and per-wilaya (/stats/[code]) pages.
import { useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { SeasonalCurve } from "@/lib/api";

export const FRP_RAMP = ["#ffe066", "#ffa630", "#fb5607", "#e01e37", "#a4133c"];
export const IN_SEASON = "#fb5607";
export const OFF_SEASON = "#3d4a63";
export const ACCENT = "#ff7a1a";
const GRID = "rgba(255,255,255,0.07)";

export function intlLoc(locale: string) {
  return locale === "ar" ? "ar-DZ" : "en-US";
}
export function useNum() {
  const { locale } = useLocale();
  return useMemo(() => new Intl.NumberFormat(intlLoc(locale)), [locale]);
}
export function monthLabels(locale: string, style: "short" | "long" = "short"): string[] {
  return Array.from({ length: 12 }, (_, i) => new Date(2021, i, 1).toLocaleString(intlLoc(locale), { month: style }));
}
export function compact(n: number, locale: string): string {
  return new Intl.NumberFormat(intlLoc(locale), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function compactLabel(v: number) {
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(v);
}

export function Tile({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="glass" style={{ padding: "15px 17px", borderRadius: 15, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? ACCENT : "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

export function InsightCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass" style={{ padding: "14px 16px", borderRadius: 14 }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: ACCENT, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, margin: "3px 0", lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{sub}</div>
    </div>
  );
}

export function Section({ title, desc, takeaway, scope, flush, children }: { title: string; desc: string; takeaway?: string; scope?: string; flush?: boolean; children: React.ReactNode }) {
  return (
    <section className="glass" style={{ padding: 20, borderRadius: 18, marginTop: flush ? 0 : 16, height: flush ? "100%" : undefined, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
        {scope && <span style={{ fontSize: 11.5, color: ACCENT, fontWeight: 600 }}>· {scope}</span>}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 0" }}>{desc}</p>
      {takeaway && <p style={{ fontSize: 12.5, color: "#ffbf7d", margin: "8px 0 0", fontWeight: 600 }}>{takeaway}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

// Responsive 2-up wrapper for a denser dashboard layout.
export function Pair({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>
      {children}
    </div>
  );
}

function Grid({ W, H, padT, padB, max }: { W: number; H: number; padT: number; padB: number; max: number }) {
  const lines = 4;
  return (
    <g>
      {Array.from({ length: lines + 1 }, (_, i) => {
        const y = padT + ((H - padT - padB) * i) / lines;
        const val = Math.round((max * (lines - i)) / lines);
        return (
          <g key={i}>
            <line x1={0} y1={y} x2={W} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={2} y={y - 3} fontSize={9.5} fill="var(--text-muted)">{compactLabel(val)}</text>
          </g>
        );
      })}
    </g>
  );
}

// Seasonality: 12 monthly bars, fire-season months (>=20% of peak) highlighted.
// `values` is Jan..Dec for the selected metric.
export function Seasonality({ values, labels }: { values: number[]; labels: { inSeason: string; offSeason: string } }) {
  const { locale } = useLocale();
  const nf = useNum();
  const months = monthLabels(locale);
  const counts = Array.from({ length: 12 }, (_, i) => values[i] ?? 0);
  const max = Math.max(...counts, 1);
  const inSeason = new Set<number>();
  counts.forEach((c, i) => { if (c >= 0.2 * max) inSeason.add(i); });
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 250, padB = 26, padT = 18, padL = 30;
  const bw = (W - padL) / 12;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block", minWidth: 440 }} role="img">
        <Grid W={W} H={H} padT={padT} padB={padB} max={max} />
        {counts.map((c, i) => {
          const h = ((H - padB - padT) * c) / max;
          const x = padL + i * bw + 5;
          const y = H - padB - h;
          const on = inSeason.has(i);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              <rect x={x} y={y} width={bw - 10} height={Math.max(h, 1)} rx={4} fill={on ? IN_SEASON : OFF_SEASON} opacity={hover === null || hover === i ? 1 : 0.5} />
              <text x={padL + i * bw + bw / 2} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{months[i]}</text>
              {hover === i && <text x={padL + i * bw + bw / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">{nf.format(c)}</text>}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: IN_SEASON }} /> {labels.inSeason}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: OFF_SEASON }} /> {labels.offSeason}</span>
      </div>
    </div>
  );
}

// Yearly trend: bars + dashed average line. `selectedYear` (optional) highlights
// one bar; otherwise the max (worst) year is highlighted. Clicking a bar calls onPick.
export function Yearly({ series, avgLabel, selectedYear, onPick }: { series: { year: number; value: number }[]; avgLabel: string; selectedYear?: number | null; onPick?: (year: number) => void }) {
  const nf = useNum();
  const [hover, setHover] = useState<number | null>(null);
  if (!series.length) return null;
  const max = Math.max(...series.map((y) => y.value), 1);
  const avg = series.reduce((a, y) => a + y.value, 0) / series.length;
  const W = 720, H = 260, padB = 26, padT = 18, padL = 30;
  const bw = (W - padL) / series.length;
  const avgY = H - padB - ((H - padB - padT) * avg) / max;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block", minWidth: 440 }} role="img">
        <Grid W={W} H={H} padT={padT} padB={padB} max={max} />
        {series.map((y, i) => {
          const h = ((H - padB - padT) * y.value) / max;
          const x = padL + i * bw + 6;
          const yy = H - padB - h;
          const highlight = selectedYear != null ? y.year === selectedYear : y.value === max;
          return (
            <g key={y.year} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(y.year)} style={{ cursor: onPick ? "pointer" : "default" }}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              <rect x={x} y={yy} width={bw - 12} height={Math.max(h, 1)} rx={4} fill={highlight ? "#e01e37" : ACCENT} opacity={hover === null || hover === i ? 0.92 : 0.5} />
              <text x={padL + i * bw + bw / 2} y={H - 9} textAnchor="middle" fontSize={10.5} fill={highlight ? "#fca5a5" : "var(--text-muted)"}>{y.year}</text>
              {hover === i && <text x={padL + i * bw + bw / 2} y={yy - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">{nf.format(y.value)}</text>}
            </g>
          );
        })}
        <line x1={padL} y1={avgY} x2={W} y2={avgY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />
        <text x={W - 2} y={avgY - 5} textAnchor="end" fontSize={11} fill="#cbd5e1">{avgLabel} · {nf.format(Math.round(avg))}</text>
      </svg>
    </div>
  );
}

// Signature chart — cumulative summer detections, this year vs historical
// envelope (EFFIS-style). X = day-of-year (Jun–Oct), Y = cumulative detections.
export function SignatureCurve({ curve, labels }: { curve: SeasonalCurve; labels: { thisYear: string; median: string; band: string } }) {
  const { locale } = useLocale();
  const nf = useNum();
  const doys = curve.doys;
  if (!doys.length) return null;
  const n = doys.length;
  const maxY = Math.max(...curve.p90, ...(curve.current.length ? curve.current : [0]), 1);
  const W = 720, H = 300, padB = 26, padT = 14, padL = 34, padR = 6;
  const x = (i: number) => padL + ((W - padL - padR) * i) / (n - 1);
  const y = (v: number) => H - padB - ((H - padB - padT) * v) / maxY;

  // Month tick day-of-year (non-leap): Jun1=152 Jul1=182 Aug1=213 Sep1=244 Oct1=274 Nov1=305
  const ticks = [152, 182, 213, 244, 274, 305].filter((d) => d >= doys[0] && d <= doys[n - 1]);
  const monLoc = locale === "ar" ? "ar-DZ" : "en-US";
  const monLabel = (doy: number) => new Date(2021, 0, doy).toLocaleString(monLoc, { month: "short" });
  const idxOfDoy = (d: number) => doys.indexOf(d);

  const line = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  // p10..p90 band as a closed area.
  const band = `${curve.p90.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} ` +
    `${curve.p10.slice().reverse().map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} Z`;

  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block", minWidth: 560 }} role="img">
        <Grid W={W} H={H} padT={padT} padB={padB} max={maxY} />
        {ticks.map((d) => (
          <text key={d} x={x(idxOfDoy(d))} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{monLabel(d)}</text>
        ))}
        <path d={band} fill="#ff7a1a" opacity={0.12} />
        <path d={line(curve.median)} fill="none" stroke="#94a3b8" strokeWidth={1.3} strokeDasharray="5 4" opacity={0.8} />
        {curve.current.length > 1 && <path d={line(curve.current)} fill="none" stroke={ACCENT} strokeWidth={2.6} strokeLinejoin="round" />}
        {curve.current.length > 0 && (
          <circle cx={x(curve.current.length - 1)} cy={y(curve.current[curve.current.length - 1])} r={3.5} fill={ACCENT} />
        )}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 14, height: 3, borderRadius: 2, background: ACCENT }} /> {labels.thisYear} ({curve.current_year})</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 14, height: 0, borderTop: "2px dashed #94a3b8" }} /> {labels.median}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 12, height: 10, borderRadius: 3, background: "#ff7a1a", opacity: 0.25 }} /> {labels.band}</span>
      </div>
    </div>
  );
}

// FRP intensity histogram (5 buckets, fire ramp).
export function Intensity({ buckets, unit }: { buckets: number[]; unit: string }) {
  const nf = useNum();
  const labels = ["0–5", "5–20", "20–50", "50–100", "100+"];
  const max = Math.max(...buckets, 1);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 230, padB = 42, padT = 18, padL = 30;
  const bw = (W - padL) / buckets.length;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block", minWidth: 400 }} role="img">
        <Grid W={W} H={H} padT={padT} padB={padB} max={max} />
        {buckets.map((c, i) => {
          const h = ((H - padB - padT) * c) / max;
          const x = padL + i * bw + 14;
          const y = H - padB - h;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              <rect x={x} y={y} width={bw - 28} height={Math.max(h, 1)} rx={4} fill={FRP_RAMP[i]} opacity={hover === null || hover === i ? 1 : 0.6} />
              <text x={padL + i * bw + bw / 2} y={H - 22} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text-secondary)">{labels[i]}</text>
              <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{unit}</text>
              {(hover === i || max === c) && <text x={padL + i * bw + bw / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">{nf.format(c)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
