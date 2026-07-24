"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StatsData } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import LanguageSwitcher from "./LanguageSwitcher";
import NavMenu from "./NavMenu";
import { FlameIcon } from "./Icons";

// Fire-intensity ramp (matches the map legend): light → dark = low → extreme FRP.
const FRP_RAMP = ["#ffe066", "#ffa630", "#fb5607", "#e01e37", "#a4133c"];
const IN_SEASON = "#fb5607";
const OFF_SEASON = "#3d4a63";
const ACCENT = "#ff7a1a";
const GRID = "rgba(255,255,255,0.07)";

function intlLoc(locale: string) {
  return locale === "ar" ? "ar-DZ" : "en-US";
}
function useNum() {
  const { locale } = useLocale();
  return useMemo(() => new Intl.NumberFormat(intlLoc(locale)), [locale]);
}
function monthLabels(locale: string, style: "short" | "long" = "short"): string[] {
  return Array.from({ length: 12 }, (_, i) => new Date(2021, i, 1).toLocaleString(intlLoc(locale), { month: style }));
}
function compact(n: number, locale: string): string {
  return new Intl.NumberFormat(intlLoc(locale), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/* ---------------- small building blocks ---------------- */

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="glass" style={{ padding: "15px 17px", borderRadius: 15, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? ACCENT : "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function InsightCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass" style={{ padding: "14px 16px", borderRadius: 14, borderInlineStart: `3px solid ${ACCENT}` }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, margin: "3px 0", lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{sub}</div>
    </div>
  );
}

function Section({ title, desc, takeaway, children }: { title: string; desc: string; takeaway?: string; children: React.ReactNode }) {
  return (
    <section className="glass" style={{ padding: 20, borderRadius: 18, marginTop: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 0" }}>{desc}</p>
      {takeaway && (
        <p style={{ fontSize: 12.5, color: "#ffbf7d", margin: "8px 0 0", fontWeight: 600 }}>{takeaway}</p>
      )}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

// Horizontal gridlines + top value label — shared chart chrome.
function Grid({ W, H, padT, padB, max, nf }: { W: number; H: number; padT: number; padB: number; max: number; nf: Intl.NumberFormat }) {
  const lines = 4;
  return (
    <g>
      {Array.from({ length: lines + 1 }, (_, i) => {
        const y = padT + ((H - padT - padB) * i) / lines;
        const val = Math.round((max * (lines - i)) / lines);
        return (
          <g key={i}>
            <line x1={0} y1={y} x2={W} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={2} y={y - 3} fontSize={9.5} fill="var(--text-muted)">{compactLabel(val, nf)}</text>
          </g>
        );
      })}
    </g>
  );
}
function compactLabel(v: number, nf: Intl.NumberFormat) {
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  return nf.format(v);
}

/* ---------------- charts ---------------- */

function Seasonality({ data, labels }: { data: StatsData; labels: { inSeason: string; offSeason: string } }) {
  const { locale } = useLocale();
  const nf = useNum();
  const months = monthLabels(locale);
  const counts = Array.from({ length: 12 }, (_, i) => data.by_month.find((m) => m.month === i + 1)?.detections ?? 0);
  const max = Math.max(...counts, 1);
  const inSeason = new Set<number>();
  counts.forEach((c, i) => { if (c >= 0.2 * max) inSeason.add(i); });
  const [hover, setHover] = useState<number | null>(null);

  const W = 720, H = 250, padB = 26, padT = 18, padL = 30;
  const bw = (W - padL) / 12;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block", minWidth: 560 }} role="img">
        <Grid W={W} H={H} padT={padT} padB={padB} max={max} nf={nf} />
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

function Yearly({ data, avgLabel }: { data: StatsData; avgLabel: string }) {
  const nf = useNum();
  const years = data.by_year;
  const [hover, setHover] = useState<number | null>(null);
  if (!years.length) return null;
  const max = Math.max(...years.map((y) => y.detections), 1);
  const avg = years.reduce((a, y) => a + y.detections, 0) / years.length;

  const W = 720, H = 260, padB = 26, padT = 18, padL = 30;
  const bw = (W - padL) / years.length;
  const avgY = H - padB - ((H - padB - padT) * avg) / max;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block", minWidth: 560 }} role="img">
        <Grid W={W} H={H} padT={padT} padB={padB} max={max} nf={nf} />
        {years.map((y, i) => {
          const h = ((H - padB - padT) * y.detections) / max;
          const x = padL + i * bw + 6;
          const yy = H - padB - h;
          const worst = y.detections === max;
          return (
            <g key={y.year} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              <rect x={x} y={yy} width={bw - 12} height={Math.max(h, 1)} rx={4} fill={worst ? "#e01e37" : ACCENT} opacity={hover === null || hover === i ? 0.92 : 0.5} />
              <text x={padL + i * bw + bw / 2} y={H - 9} textAnchor="middle" fontSize={10.5} fill="var(--text-muted)">{y.year}</text>
              {hover === i && <text x={padL + i * bw + bw / 2} y={yy - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">{nf.format(y.detections)}</text>}
            </g>
          );
        })}
        <line x1={padL} y1={avgY} x2={W} y2={avgY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />
        <text x={W - 2} y={avgY - 5} textAnchor="end" fontSize={11} fill="#cbd5e1">{avgLabel} · {nf.format(Math.round(avg))}</text>
      </svg>
    </div>
  );
}

function TopWilayas({ data, unit }: { data: StatsData; unit: string }) {
  const { locale } = useLocale();
  const nf = useNum();
  const rows = data.top_wilayas_all.slice(0, 10);
  const max = Math.max(...rows.map((r) => r.confirmed), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r, i) => (
        <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "end", flexShrink: 0 }}>{i + 1}</span>
          <span style={{ width: 118, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{wilayaName(r.code, locale)}</span>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 6, height: 16, overflow: "hidden", minWidth: 40 }}>
            <div style={{ width: `${(r.confirmed / max) * 100}%`, height: "100%", background: ACCENT, borderRadius: 6, opacity: 0.85 }} />
          </div>
          <span style={{ width: 58, fontSize: 12, fontWeight: 700, textAlign: "end", flexShrink: 0 }}>{nf.format(r.confirmed)}</span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, textAlign: "end" }}>{unit}</div>
    </div>
  );
}

function Intensity({ data, unit }: { data: StatsData; unit: string }) {
  const nf = useNum();
  const buckets = data.frp_buckets;
  const labels = ["0–5", "5–20", "20–50", "50–100", "100+"];
  const max = Math.max(...buckets, 1);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 230, padB = 42, padT = 18, padL = 30;
  const bw = (W - padL) / buckets.length;
  return (
    <div style={{ direction: "ltr", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "100%", display: "block", minWidth: 520 }} role="img">
        <Grid W={W} H={H} padT={padT} padB={padB} max={max} nf={nf} />
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

/* ---------------- page ---------------- */

export default function StatsView({ data }: { data: StatsData }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const nf = useNum();
  const [methoOpen, setMethoOpen] = useState(false);

  // Derived insights (memoized).
  const ins = useMemo(() => {
    if (!data.enabled) return null;
    const monthTotal = data.by_month.reduce((a, m) => a + m.detections, 0) || 1;
    const peak = data.by_month.reduce((a, m) => (m.detections > a.detections ? m : a), { month: 1, detections: 0, confirmed: 0 });
    const peakPct = Math.round((peak.detections / monthTotal) * 100);
    const seasonMonths = data.by_month.filter((m) => m.detections >= 0.2 * peak.detections).map((m) => m.month).sort((a, b) => a - b);
    const worst = data.by_year.length ? data.by_year.reduce((a, b) => (b.detections > a.detections ? b : a)) : null;
    const avgYear = data.by_year.length ? data.by_year.reduce((a, y) => a + y.detections, 0) / data.by_year.length : 0;
    const mult = worst && avgYear ? Math.round((worst.detections / avgYear) * 10) / 10 : 0;
    const bTotal = data.frp_buckets.reduce((a, b) => a + b, 0) || 1;
    const intensePct = Math.round(((data.frp_buckets[3] + data.frp_buckets[4]) / bTotal) * 100);
    return { peak, peakPct, seasonMonths, worst, avgYear, mult, intensePct, monthTotal };
  }, [data]);

  const mShort = monthLabels(locale);
  const mLong = monthLabels(locale, "long");
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(intlLoc(locale), { year: "numeric", month: "short" }) : "—");

  if (!data.enabled || !ins) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", display: "grid", placeItems: "center", padding: 40 }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <p>Statistics are warming up. Please check back shortly.</p>
          <Link href="/" style={{ color: ACCENT }}>{t("stats.backToMap")}</Link>
        </div>
      </main>
    );
  }

  const k = data.kpis;
  const startYear = data.coverage.first_date?.slice(0, 4) ?? "";
  const seasonRange = ins.seasonMonths.length
    ? `${mShort[ins.seasonMonths[0] - 1]} – ${mShort[ins.seasonMonths[ins.seasonMonths.length - 1] - 1]}`
    : "—";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
      {/* Sticky header — brand + language + nav (fixes: you can translate & navigate here). */}
      <header
        className="glass"
        style={{
          position: "sticky", top: 0, zIndex: 40,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px clamp(14px, 4vw, 28px)", borderRadius: 0,
          borderInline: "none", borderTop: "none",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <FlameIcon size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.01em" }}>{t("common.appName")}</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LanguageSwitcher compact />
          <NavMenu size={34} />
        </div>
      </header>

      <main style={{ padding: "clamp(16px, 4vw, 36px)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          {/* Hero */}
          <h1 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{t("stats.title")}</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 620 }}>{t("stats.subtitle")}</p>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            {t("stats.coverage", { first: fmtDate(data.coverage.first_date), last: fmtDate(data.coverage.last_date) })}
          </div>

          {/* Headline insight banner */}
          <div className="glass" style={{ marginTop: 16, padding: "16px 18px", borderRadius: 16, borderInlineStart: `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: ACCENT, fontWeight: 700 }}>{t("stats.insightLead")}</div>
            <p style={{ fontSize: 15, margin: "5px 0 0", lineHeight: 1.5, fontWeight: 500 }}>
              {t("stats.insight", { month: mLong[ins.peak.month - 1], pct: nf.format(ins.peakPct), year: startYear })}
            </p>
          </div>

          {/* KPI tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 11, marginTop: 16 }}>
            <Tile label={t("stats.kpi.detections")} value={nf.format(k.total_detections)} />
            <Tile label={t("stats.kpi.confirmed")} value={nf.format(k.total_confirmed)} accent />
            <Tile label={t("stats.kpi.incidents")} value={nf.format(k.active_incidents)} />
            <Tile label={t("stats.kpi.wilayas")} value={`${nf.format(k.wilayas_affected)} / 69`} />
            <Tile label={t("stats.kpi.energy")} value={`${compact(k.total_frp, locale)} ${t("stats.intensity.unit")}`} />
          </div>

          {/* Insight cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 11, marginTop: 11 }}>
            <InsightCard label={t("stats.peakLabel")} value={mLong[ins.peak.month - 1]} sub={`${nf.format(ins.peakPct)}% ${t("stats.ofAllFires")}`} />
            <InsightCard label={t("stats.seasonLabel")} value={seasonRange} sub={t("stats.seasonality.inSeason")} />
            {ins.worst && <InsightCard label={t("stats.worstLabel")} value={String(ins.worst.year)} sub={t("stats.vsAvg", { mult: nf.format(ins.mult) })} />}
            <InsightCard label={t("stats.intenseLabel")} value={`${nf.format(ins.intensePct)}%`} sub={t("stats.intenseSub")} />
          </div>

          <Section
            title={t("stats.seasonality.title")}
            desc={t("stats.seasonality.desc")}
            takeaway={t("stats.peakTakeaway", { month: mLong[ins.peak.month - 1], pct: nf.format(ins.peakPct) })}
          >
            <Seasonality data={data} labels={{ inSeason: t("stats.seasonality.inSeason"), offSeason: t("stats.seasonality.offSeason") }} />
          </Section>

          <Section
            title={t("stats.yearly.title")}
            desc={t("stats.yearly.desc")}
            takeaway={ins.worst ? t("stats.yearTakeaway", { year: ins.worst.year, mult: nf.format(ins.mult) }) : undefined}
          >
            <Yearly data={data} avgLabel={t("stats.yearly.average")} />
          </Section>

          <Section title={t("stats.topWilayas.title")} desc={t("stats.topWilayas.desc")}>
            <TopWilayas data={data} unit={t("stats.topWilayas.confirmed")} />
          </Section>

          <Section
            title={t("stats.intensity.title")}
            desc={t("stats.intensity.desc")}
            takeaway={t("stats.intensityTakeaway", { pct: nf.format(ins.intensePct) })}
          >
            <Intensity data={data} unit={t("stats.intensity.unit")} />
          </Section>

          {/* Methodology */}
          <section className="glass" style={{ padding: 20, borderRadius: 18, marginTop: 16 }}>
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

          <div style={{ marginTop: 22, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            <Link href="/" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>{t("stats.backToMap")}</Link>
            {" · "}
            <a href="https://github.com/MoussaabBadla/algeria-fire-map" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", textDecoration: "none" }}>{t("common.openSource")}</a>
          </div>
        </div>
      </main>
    </div>
  );
}
