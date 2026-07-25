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
  ACCENT, Section, Tile, InsightCard, Seasonality, Yearly, Intensity,
  useNum, monthLabels, compact, intlLoc,
} from "./statsCharts";

const NationalChoropleth = dynamic(() => import("./NationalChoropleth"), { ssr: false });

// Most-affected wilayas — national-only, ranked by confirmed fires.
function TopWilayas({ data, unit }: { data: StatsData; unit: string }) {
  const { locale } = useLocale();
  const nf = useNum();
  const rows = data.top_wilayas_all.slice(0, 10);
  const max = Math.max(...rows.map((r) => r.confirmed), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r, i) => (
        <Link key={r.code} href={`/stats/${r.code}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span style={{ width: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "end", flexShrink: 0 }}>{i + 1}</span>
          <span style={{ width: 118, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{wilayaName(r.code, locale)}</span>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 6, height: 16, overflow: "hidden", minWidth: 40 }}>
            <div style={{ width: `${(r.confirmed / max) * 100}%`, height: "100%", background: ACCENT, borderRadius: 6, opacity: 0.85 }} />
          </div>
          <span style={{ width: 58, fontSize: 12, fontWeight: 700, textAlign: "end", flexShrink: 0 }}>{nf.format(r.confirmed)}</span>
        </Link>
      ))}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, textAlign: "end" }}>{unit}</div>
    </div>
  );
}

export function StatsHeader() {
  const t = useTranslations();
  return (
    <header
      className="glass"
      style={{
        position: "sticky", top: 0, zIndex: 40,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "10px clamp(14px, 4vw, 28px)", borderRadius: 0, borderInline: "none", borderTop: "none",
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
  );
}

export default function StatsView({ data }: { data: StatsData }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const nf = useNum();
  const [methoOpen, setMethoOpen] = useState(false);

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
    return { peak, peakPct, seasonMonths, worst, mult, intensePct };
  }, [data]);

  const mShort = monthLabels(locale);
  const mLong = monthLabels(locale, "long");
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(intlLoc(locale), { year: "numeric", month: "short" }) : "—");

  if (!data.enabled || !ins) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
        <StatsHeader />
        <div style={{ display: "grid", placeItems: "center", padding: 60, color: "var(--text-muted)", textAlign: "center" }}>
          Statistics are warming up. Please check back shortly.
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const startYear = data.coverage.first_date?.slice(0, 4) ?? "";
  const seasonRange = ins.seasonMonths.length
    ? `${mShort[ins.seasonMonths[0] - 1]} – ${mShort[ins.seasonMonths[ins.seasonMonths.length - 1] - 1]}`
    : "—";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
      <StatsHeader />
      <main style={{ padding: "clamp(16px, 4vw, 36px)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <h1 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{t("stats.title")}</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 620 }}>{t("stats.subtitle")}</p>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            {t("stats.coverage", { first: fmtDate(data.coverage.first_date), last: fmtDate(data.coverage.last_date) })}
          </div>

          <div className="glass" style={{ marginTop: 16, padding: "16px 18px", borderRadius: 16, borderInlineStart: `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: ACCENT, fontWeight: 700 }}>{t("stats.insightLead")}</div>
            <p style={{ fontSize: 15, margin: "5px 0 0", lineHeight: 1.5, fontWeight: 500 }}>
              {t("stats.insight", { month: mLong[ins.peak.month - 1], pct: nf.format(ins.peakPct), year: startYear })}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 11, marginTop: 16 }}>
            <Tile label={t("stats.kpi.detections")} value={nf.format(k.total_detections)} />
            <Tile label={t("stats.kpi.confirmed")} value={nf.format(k.total_confirmed)} accent />
            <Tile label={t("stats.kpi.incidents")} value={nf.format(k.active_incidents)} />
            <Tile label={t("stats.kpi.wilayas")} value={`${nf.format(k.wilayas_affected)} / 69`} />
            <Tile label={t("stats.kpi.energy")} value={`${compact(k.total_frp, locale)} ${t("stats.intensity.unit")}`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 11, marginTop: 11 }}>
            <InsightCard label={t("stats.peakLabel")} value={mLong[ins.peak.month - 1]} sub={`${nf.format(ins.peakPct)}% ${t("stats.ofAllFires")}`} />
            <InsightCard label={t("stats.seasonLabel")} value={seasonRange} sub={t("stats.seasonality.inSeason")} />
            {ins.worst && <InsightCard label={t("stats.worstLabel")} value={String(ins.worst.year)} sub={t("stats.vsAvg", { mult: nf.format(ins.mult) })} />}
            <InsightCard label={t("stats.intenseLabel")} value={`${nf.format(ins.intensePct)}%`} sub={t("stats.intenseSub")} />
          </div>

          {data.wilaya_totals?.length > 0 && (
            <Section title={t("stats.mapTitle")} desc={t("stats.mapDesc")}>
              <NationalChoropleth totals={data.wilaya_totals} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 11, color: "var(--text-secondary)" }}>
                <span>{t("stats.mapLow")}</span>
                <div style={{ flex: 1, maxWidth: 220, height: 8, borderRadius: 99, background: "linear-gradient(90deg,#ffe066,#ffa630,#fb5607,#e01e37,#a4133c)" }} />
                <span>{t("stats.mapHigh")}</span>
              </div>
            </Section>
          )}

          <Section title={t("stats.seasonality.title")} desc={t("stats.seasonality.desc")} takeaway={t("stats.peakTakeaway", { month: mLong[ins.peak.month - 1], pct: nf.format(ins.peakPct) })}>
            <Seasonality byMonth={data.by_month} labels={{ inSeason: t("stats.seasonality.inSeason"), offSeason: t("stats.seasonality.offSeason") }} />
          </Section>

          <Section title={t("stats.yearly.title")} desc={t("stats.yearly.desc")} takeaway={ins.worst ? t("stats.yearTakeaway", { year: ins.worst.year, mult: nf.format(ins.mult) }) : undefined}>
            <Yearly byYear={data.by_year} avgLabel={t("stats.yearly.average")} />
          </Section>

          <Section title={t("stats.topWilayas.title")} desc={t("stats.topWilayas.desc")}>
            <TopWilayas data={data} unit={t("stats.topWilayas.confirmed")} />
          </Section>

          <Section title={t("stats.intensity.title")} desc={t("stats.intensity.desc")} takeaway={t("stats.intensityTakeaway", { pct: nf.format(ins.intensePct) })}>
            <Intensity buckets={data.frp_buckets} unit={t("stats.intensity.unit")} />
          </Section>

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
