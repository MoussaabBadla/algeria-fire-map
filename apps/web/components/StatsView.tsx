"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { StatsData } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import LanguageSwitcher from "./LanguageSwitcher";
import NavMenu from "./NavMenu";
import { FlameIcon } from "./Icons";
import {
  ACCENT, Section, Pair, Tile, InsightCard, Seasonality, Yearly, Intensity, SignatureCurve,
  useNum, monthLabels, compact, intlLoc,
} from "./statsCharts";

const NationalChoropleth = dynamic(() => import("./NationalChoropleth"), { ssr: false });

type Metric = "confirmed" | "detections";
type YearSel = "all" | number;

// Ranked wilaya list for the selected scope + metric.
function TopWilayas({ rows, unit }: { rows: { code: number; value: number }[]; unit: string }) {
  const { locale } = useLocale();
  const nf = useNum();
  const top = rows.slice(0, 10);
  const max = Math.max(...top.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {top.map((r, i) => (
        <Link key={r.code} href={`/stats/${r.code}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span style={{ width: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "end", flexShrink: 0 }}>{i + 1}</span>
          <span style={{ width: 110, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{wilayaName(r.code, locale)}</span>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 6, height: 16, overflow: "hidden", minWidth: 30 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", background: ACCENT, borderRadius: 6, opacity: 0.85 }} />
          </div>
          <span style={{ width: 58, fontSize: 12, fontWeight: 700, textAlign: "end", flexShrink: 0 }}>{nf.format(r.value)}</span>
        </Link>
      ))}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, textAlign: "end" }}>{unit}</div>
    </div>
  );
}

export function StatsHeader() {
  const t = useTranslations();
  return (
    <header className="glass" style={{ position: "sticky", top: 0, zIndex: 41, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px clamp(14px, 4vw, 28px)", borderRadius: 0, borderInline: "none", borderTop: "none" }}>
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
  );
}

// Sticky year + metric filter bar.
function FilterBar({ years, year, metric, onYear, onMetric }: { years: number[]; year: YearSel; metric: Metric; onYear: (y: YearSel) => void; onMetric: (m: Metric) => void }) {
  const t = useTranslations();
  const pill = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 9, border: `1px solid ${active ? "rgba(255,122,26,0.5)" : "var(--border)"}`,
    background: active ? "rgba(255,122,26,0.16)" : "rgba(255,255,255,0.03)", color: active ? "#ff9e3d" : "var(--text-secondary)",
    fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  });
  return (
    <div className="glass" style={{ position: "sticky", top: 54, zIndex: 39, borderRadius: 0, borderInline: "none", padding: "9px clamp(14px, 4vw, 28px)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, minWidth: 0, paddingBottom: 2 }}>
        <button style={pill(year === "all")} onClick={() => onYear("all")}>{t("stats.filters.allYears")}</button>
        {years.map((y) => (
          <button key={y} style={pill(year === y)} onClick={() => onYear(y)}>{y}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, padding: 3, background: "rgba(255,255,255,0.06)", borderRadius: 10, flexShrink: 0 }}>
        {(["confirmed", "detections"] as Metric[]).map((m) => (
          <button key={m} onClick={() => onMetric(m)} style={{ padding: "6px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: metric === m ? "rgba(255,255,255,0.16)" : "transparent", color: metric === m ? "#fff" : "var(--text-secondary)" }}>
            {t(`stats.filters.${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function StatsView({ data }: { data: StatsData }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const nf = useNum();
  const [methoOpen, setMethoOpen] = useState(false);
  const [year, setYear] = useState<YearSel>("all");
  const [metric, setMetric] = useState<Metric>("confirmed");

  const mLong = monthLabels(locale, "long");
  const mShort = monthLabels(locale);
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(intlLoc(locale), { year: "numeric", month: "short" }) : "—");
  const metricUnit = metric === "confirmed" ? t("stats.filters.confirmed") : t("stats.filters.detections");

  // Data derived from the active year + metric filters.
  const d = useMemo(() => {
    if (!data.enabled) return null;
    const yStr = String(year);
    const confMode = metric === "confirmed";
    // Seasonality (12).
    const seasonality = year === "all"
      ? Array.from({ length: 12 }, (_, i) => { const m = data.by_month.find((x) => x.month === i + 1); return m ? (confMode ? m.confirmed : m.detections) : 0; })
      : (data.monthly_by_year[yStr]?.[confMode ? "conf" : "det"] ?? Array(12).fill(0));
    // Yearly (all years, metric).
    const yearly = data.by_year.map((yy) => ({ year: yy.year, value: confMode ? yy.confirmed : yy.detections }));
    // Wilaya rows for scope.
    const src: [number, number, number][] = year === "all"
      ? data.wilaya_totals.map((w) => [w.code, w.detections, w.confirmed])
      : (data.wilaya_by_year[yStr] ?? []);
    const wilayaRows = src.map(([code, det, conf]) => ({ code, value: confMode ? conf : det })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const choroTotals = src.map(([code, det, conf]) => ({ code, confirmed: confMode ? conf : det }));
    // Intensity.
    const intensity = year === "all" ? data.frp_buckets : (data.frp_by_year[yStr] ?? [0, 0, 0, 0, 0]);
    // KPIs.
    const yy = year === "all" ? null : data.by_year.find((x) => x.year === year);
    const kpis = year === "all"
      ? { detections: data.kpis.total_detections, confirmed: data.kpis.total_confirmed, energy: data.kpis.total_frp, wilayas: data.kpis.wilayas_affected }
      : { detections: yy?.detections ?? 0, confirmed: yy?.confirmed ?? 0, energy: yy?.frp ?? 0, wilayas: (data.wilaya_by_year[yStr] ?? []).filter(([, det, conf]) => (confMode ? conf : det) > 0).length };
    // Peak month for the scope.
    const monthTotal = seasonality.reduce((a: number, b: number) => a + b, 0) || 1;
    const peakIdx = seasonality.indexOf(Math.max(...seasonality));
    const peakPct = Math.round((seasonality[peakIdx] / monthTotal) * 100);
    const seasonMonths = seasonality.map((v: number, i: number) => [v, i] as const).filter(([v]) => v >= 0.2 * seasonality[peakIdx]).map(([, i]) => i);
    return { seasonality, yearly, wilayaRows, choroTotals, intensity, kpis, peakIdx, peakPct, seasonMonths };
  }, [data, year, metric]);

  // All-time insights (independent of filters).
  const allTime = useMemo(() => {
    if (!data.enabled) return null;
    const worst = data.by_year.length ? data.by_year.reduce((a, b) => (b.detections > a.detections ? b : a)) : null;
    const avg = data.by_year.length ? data.by_year.reduce((a, y) => a + y.detections, 0) / data.by_year.length : 0;
    const mult = worst && avg ? Math.round((worst.detections / avg) * 10) / 10 : 0;
    const monthTotal = data.by_month.reduce((a, m) => a + m.detections, 0) || 1;
    const peak = data.by_month.reduce((a, m) => (m.detections > a.detections ? m : a), { month: 1, detections: 0 });
    return { worst, mult, peakMonth: peak.month, peakPct: Math.round((peak.detections / monthTotal) * 100) };
  }, [data]);

  if (!data.enabled || !d || !allTime) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
        <StatsHeader />
        <div style={{ display: "grid", placeItems: "center", padding: 60, color: "var(--text-muted)" }}>Statistics are warming up.</div>
      </div>
    );
  }

  const startYear = data.coverage.first_date?.slice(0, 4) ?? "";
  const scope = year === "all" ? t("stats.filters.scopeAll") : t("stats.filters.scopeYear", { year });
  const seasonRange = d.seasonMonths.length ? `${mShort[d.seasonMonths[0]]} – ${mShort[d.seasonMonths[d.seasonMonths.length - 1]]}` : "—";
  const sc = data.seasonal_curve;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
      <StatsHeader />
      <FilterBar years={data.years} year={year} metric={metric} onYear={setYear} onMetric={setMetric} />

      <main style={{ padding: "clamp(16px, 4vw, 36px)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <h1 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{t("stats.title")}</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 640 }}>{t("stats.subtitle")}</p>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{t("stats.coverage", { first: fmtDate(data.coverage.first_date), last: fmtDate(data.coverage.last_date) })}</div>

          {/* KPI row (year + metric aware) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 11, marginTop: 16 }}>
            <Tile label={t("stats.kpi.confirmed")} value={nf.format(d.kpis.confirmed)} sub={scope} accent />
            <Tile label={t("stats.kpi.detections")} value={nf.format(d.kpis.detections)} sub={scope} />
            <Tile label={t("stats.kpi.wilayas")} value={`${nf.format(d.kpis.wilayas)} / 69`} />
            <Tile label={t("stats.kpi.energy")} value={`${compact(d.kpis.energy, locale)} ${t("stats.intensity.unit")}`} />
            {year === "all" && <Tile label={t("stats.kpi.incidents")} value={nf.format(data.kpis.active_incidents)} />}
          </div>

          {/* All-time headline insight */}
          <div className="glass" style={{ marginTop: 16, padding: "16px 18px", borderRadius: 16, borderInlineStart: `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: ACCENT, fontWeight: 700 }}>{t("stats.insightLead")}</div>
            <p style={{ fontSize: 15, margin: "5px 0 0", lineHeight: 1.5, fontWeight: 500 }}>{t("stats.insight", { month: mLong[allTime.peakMonth - 1], pct: nf.format(allTime.peakPct), year: startYear })}</p>
          </div>

          {/* Insight cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 11, marginTop: 11 }}>
            <InsightCard label={t("stats.peakLabel")} value={mLong[d.peakIdx]} sub={`${nf.format(d.peakPct)}% ${scope}`} />
            <InsightCard label={t("stats.seasonLabel")} value={seasonRange} sub={t("stats.seasonality.inSeason")} />
            {allTime.worst && <InsightCard label={t("stats.worstLabel")} value={String(allTime.worst.year)} sub={t("stats.vsAvg", { mult: nf.format(allTime.mult) })} />}
          </div>

          {/* Signature curve (always multi-year) */}
          {sc?.current?.length > 1 && (() => {
            const i = sc.current.length - 1;
            const cur = sc.current[i], med = sc.median[i] || 1, hi = sc.p90[i];
            const key = cur > hi ? "wellAbove" : cur > med * 1.15 ? "above" : cur < med * 0.85 ? "below" : "typical";
            return (
              <Section title={t("stats.signature.title")} desc={t("stats.signature.desc")} takeaway={t(`stats.signature.${key}`, { year: sc.current_year ?? "" })}>
                <SignatureCurve curve={sc} labels={{ thisYear: t("stats.signature.thisYear"), median: t("stats.signature.median"), band: t("stats.signature.band") }} />
              </Section>
            );
          })()}

          {/* Choropleth + ranked wilayas side by side */}
          <Pair>
            <Section flush title={t("stats.mapTitle")} desc={t("stats.mapDesc")} scope={scope}>
              <NationalChoropleth totals={d.choroTotals} unit={metricUnit} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 11, color: "var(--text-secondary)" }}>
                <span>{t("stats.mapLow")}</span>
                <div style={{ flex: 1, maxWidth: 200, height: 8, borderRadius: 99, background: "linear-gradient(90deg,#ffe066,#ffa630,#fb5607,#e01e37,#a4133c)" }} />
                <span>{t("stats.mapHigh")}</span>
              </div>
            </Section>
            <Section flush title={t("stats.topWilayas.title")} desc={t("stats.topWilayas.desc")} scope={scope}>
              <TopWilayas rows={d.wilayaRows} unit={metricUnit} />
            </Section>
          </Pair>

          {/* Seasonality + yearly side by side */}
          <Pair>
            <Section flush title={t("stats.seasonality.title")} desc={t("stats.seasonality.desc")} scope={scope} takeaway={t("stats.peakTakeaway", { month: mLong[d.peakIdx], pct: nf.format(d.peakPct) })}>
              <Seasonality values={d.seasonality} labels={{ inSeason: t("stats.seasonality.inSeason"), offSeason: t("stats.seasonality.offSeason") }} />
            </Section>
            <Section flush title={t("stats.yearly.title")} desc={t("stats.yearly.desc")} takeaway={allTime.worst ? t("stats.yearTakeaway", { year: allTime.worst.year, mult: nf.format(allTime.mult) }) : undefined}>
              <Yearly series={d.yearly} avgLabel={t("stats.yearly.average")} selectedYear={year === "all" ? null : year} onPick={(y) => setYear(y)} />
            </Section>
          </Pair>

          <Section title={t("stats.intensity.title")} desc={t("stats.intensity.desc")} scope={scope} takeaway={t("stats.intensityTakeaway", { pct: nf.format(Math.round(((d.intensity[3] + d.intensity[4]) / (d.intensity.reduce((a: number, b: number) => a + b, 0) || 1)) * 100)) })}>
            <Intensity buckets={d.intensity} unit={t("stats.intensity.unit")} />
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
                  <li key={b} style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55, paddingInlineStart: 14, borderInlineStart: `2px solid var(--border)` }}>{t(`stats.methodology.${b}`)}</li>
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
