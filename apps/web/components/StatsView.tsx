"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StatsData } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import { FlameIcon } from "./Icons";

// Fire-intensity ramp (matches the map legend): light → dark = low → extreme FRP.
const FRP_RAMP = ["#ffe066", "#ffa630", "#fb5607", "#e01e37", "#a4133c"];
const IN_SEASON = "#fb5607";
const OFF_SEASON = "#3d4a63";
const ACCENT = "#ff7a1a";

function useNum() {
  const { locale } = useLocale();
  return useMemo(() => new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "en-US"), [locale]);
}

function monthLabels(locale: string): string[] {
  const loc = locale === "ar" ? "ar-DZ" : "en-US";
  return Array.from({ length: 12 }, (_, i) => new Date(2021, i, 1).toLocaleString(loc, { month: "short" }));
}

// Compact number (12.3k, 1.2M) for tight axis/tile spots.
function compact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

interface TileProps { label: string; value: string; sub?: string; accent?: boolean }
function Tile({ label, value, sub, accent }: TileProps) {
  return (
    <div className="glass" style={{ padding: "16px 18px", borderRadius: 16, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ? ACCENT : "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="glass" style={{ padding: 20, borderRadius: 18, marginTop: 18 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 16px" }}>{desc}</p>
      {children}
    </section>
  );
}

// --- Seasonality: 12 monthly bars, fire-season months highlighted. ---
function Seasonality({ data, labels }: { data: StatsData; labels: { inSeason: string; offSeason: string } }) {
  const { locale } = useLocale();
  const nf = useNum();
  const months = monthLabels(locale);
  const counts = Array.from({ length: 12 }, (_, i) => data.by_month.find((m) => m.month === i + 1)?.detections ?? 0);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  // Fire season = the fewest months that together make up 80% of detections.
  const order = counts.map((c, i) => [c, i] as const).sort((a, b) => b[0] - a[0]);
  const inSeason = new Set<number>();
  let acc = 0;
  for (const [c, i] of order) { if (acc / total >= 0.8) break; inSeason.add(i); acc += c; }
  const max = Math.max(...counts, 1);
  const [hover, setHover] = useState<number | null>(null);

  const W = 720, H = 240, padB = 26, padT = 16, padL = 8;
  const bw = (W - padL * 2) / 12;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block" }} role="img">
        {counts.map((c, i) => {
          const h = ((H - padB - padT) * c) / max;
          const x = padL + i * bw + 4;
          const y = H - padB - h;
          const on = inSeason.has(i);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              <rect x={x} y={y} width={bw - 8} height={Math.max(h, 1)} rx={4} fill={on ? IN_SEASON : OFF_SEASON} opacity={hover === null || hover === i ? 1 : 0.55} />
              <text x={padL + i * bw + bw / 2} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{months[i]}</text>
              {hover === i && (
                <text x={padL + i * bw + bw / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">{nf.format(c)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: IN_SEASON }} /> {labels.inSeason}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: OFF_SEASON }} /> {labels.offSeason}</span>
      </div>
    </div>
  );
}

// --- Yearly trend: bars + dashed average line. ---
function Yearly({ data, avgLabel }: { data: StatsData; avgLabel: string }) {
  const { locale } = useLocale();
  const nf = useNum();
  const years = data.by_year;
  if (!years.length) return null;
  const max = Math.max(...years.map((y) => y.detections), 1);
  const avg = years.reduce((a, y) => a + y.detections, 0) / years.length;
  const [hover, setHover] = useState<number | null>(null);

  const W = 720, H = 250, padB = 26, padT = 16, padL = 8;
  const bw = (W - padL * 2) / years.length;
  const avgY = H - padB - ((H - padB - padT) * avg) / max;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block" }} role="img">
        {years.map((y, i) => {
          const h = ((H - padB - padT) * y.detections) / max;
          const x = padL + i * bw + 5;
          const yy = H - padB - h;
          return (
            <g key={y.year} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              <rect x={x} y={yy} width={bw - 10} height={Math.max(h, 1)} rx={4} fill={ACCENT} opacity={hover === null || hover === i ? 0.92 : 0.5} />
              <text x={padL + i * bw + bw / 2} y={H - 9} textAnchor="middle" fontSize={10.5} fill="var(--text-muted)">{y.year}</text>
              {hover === i && <text x={padL + i * bw + bw / 2} y={yy - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">{nf.format(y.detections)}</text>}
            </g>
          );
        })}
        <line x1={padL} y1={avgY} x2={W - padL} y2={avgY} stroke="var(--text-secondary)" strokeWidth={1} strokeDasharray="5 4" />
        <text x={W - padL} y={avgY - 5} textAnchor="end" fontSize={11} fill="var(--text-secondary)">{avgLabel} · {nf.format(Math.round(avg))}</text>
      </svg>
    </div>
  );
}

// --- Top wilayas: horizontal bars by confirmed fires. ---
function TopWilayas({ data, unit }: { data: StatsData; unit: string }) {
  const { locale } = useLocale();
  const nf = useNum();
  const rows = data.top_wilayas_all.slice(0, 10);
  const max = Math.max(...rows.map((r) => r.confirmed), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 18, fontSize: 12, color: "var(--text-muted)", textAlign: "end" }}>{i + 1}</span>
          <span style={{ width: 120, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wilayaName(r.code, locale)}</span>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 6, height: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ width: `${(r.confirmed / max) * 100}%`, height: "100%", background: ACCENT, borderRadius: 6, opacity: 0.85 }} />
          </div>
          <span style={{ width: 62, fontSize: 12, fontWeight: 700, textAlign: "end" }}>{nf.format(r.confirmed)}</span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, textAlign: "end" }}>{unit}</div>
    </div>
  );
}

// --- FRP intensity histogram (5 buckets, fire ramp). ---
function Intensity({ data, unit }: { data: StatsData; unit: string }) {
  const { locale } = useLocale();
  const nf = useNum();
  const buckets = data.frp_buckets;
  const labels = ["0–5", "5–20", "20–50", "50–100", "100+"];
  const max = Math.max(...buckets, 1);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, padB = 40, padT = 16, padL = 8;
  const bw = (W - padL * 2) / buckets.length;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block" }} role="img">
        {buckets.map((c, i) => {
          const h = ((H - padB - padT) * c) / max;
          const x = padL + i * bw + 10;
          const y = H - padB - h;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              <rect x={x} y={y} width={bw - 20} height={Math.max(h, 1)} rx={4} fill={FRP_RAMP[i]} opacity={hover === null || hover === i ? 1 : 0.6} />
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

export default function StatsView({ data }: { data: StatsData }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const nf = useNum();
  const [methoOpen, setMethoOpen] = useState(false);

  if (!data.enabled) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Statistics are not available yet.</div>;
  }

  const k = data.kpis;
  const worst = data.by_year.length ? data.by_year.reduce((a, b) => (b.detections > a.detections ? b : a)) : null;
  const avgYear = data.by_year.length ? Math.round(data.by_year.reduce((a, y) => a + y.detections, 0) / data.by_year.length) : 0;
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === "ar" ? "ar-DZ" : "en-US", { year: "numeric", month: "short" }) : "—");
  // Total FRP in gigawatts reads better than millions of MW.
  const energy = `${compact(k.total_frp, locale)} ${t("stats.intensity.unit")}`;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "clamp(16px, 4vw, 40px)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <FlameIcon size={21} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>{t("stats.title")}</h1>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "2px 0 0" }}>{t("stats.subtitle")}</p>
            </div>
          </div>
          <Link href="/" style={{ fontSize: 13, fontWeight: 600, color: ACCENT, textDecoration: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px" }}>
            {t("stats.viewMap")} →
          </Link>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          {t("stats.coverage", { first: fmtDate(data.coverage.first_date), last: fmtDate(data.coverage.last_date) })}
        </div>

        {/* KPI tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
          <Tile label={t("stats.kpi.detections")} value={nf.format(k.total_detections)} />
          <Tile label={t("stats.kpi.confirmed")} value={nf.format(k.total_confirmed)} accent />
          <Tile label={t("stats.kpi.incidents")} value={nf.format(k.active_incidents)} />
          <Tile label={t("stats.kpi.wilayas")} value={`${nf.format(k.wilayas_affected)} / 69`} />
          <Tile label={t("stats.kpi.energy")} value={energy} />
          {worst && <Tile label={t("stats.kpi.worstYear")} value={String(worst.year)} sub={`${nf.format(worst.detections)} ${t("stats.terms.detections")}`} />}
        </div>

        <Section title={t("stats.seasonality.title")} desc={t("stats.seasonality.desc")}>
          <Seasonality data={data} labels={{ inSeason: t("stats.seasonality.inSeason"), offSeason: t("stats.seasonality.offSeason") }} />
        </Section>

        <Section title={t("stats.yearly.title")} desc={t("stats.yearly.desc")}>
          <Yearly data={data} avgLabel={t("stats.yearly.average")} />
        </Section>

        <Section title={t("stats.topWilayas.title")} desc={t("stats.topWilayas.desc")}>
          <TopWilayas data={data} unit={t("stats.topWilayas.confirmed")} />
        </Section>

        <Section title={t("stats.intensity.title")} desc={t("stats.intensity.desc")}>
          <Intensity data={data} unit={t("stats.intensity.unit")} />
        </Section>

        {/* Methodology */}
        <section className="glass" style={{ padding: 20, borderRadius: 18, marginTop: 18 }}>
          <button onClick={() => setMethoOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{t("stats.methodology.title")}</h2>
            <span style={{ color: "var(--text-muted)", fontSize: 18 }}>{methoOpen ? "−" : "+"}</span>
          </button>
          {methoOpen && (
            <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {["b1", "b2", "b3", "b4", "b5", "b6"].map((b) => (
                <li key={b} style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55, paddingInlineStart: 14, borderInlineStart: `2px solid var(--border)` }}>
                  {t(`stats.methodology.${b}`)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          <Link href="/" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>{t("stats.backToMap")}</Link>
          {" · "}
          <a href="https://github.com/MoussaabBadla/algeria-fire-map" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Open source</a>
        </div>
      </div>
    </main>
  );
}
