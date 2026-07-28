"use client";

import { useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { WilayaStatsData } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { wilayaName } from "@/lib/i18n/wilayaNames";
import { StatsHeader } from "./StatsView";
import { ACCENT, Section, Tile, InsightCard, Seasonality, Yearly, Intensity, useNum, monthLabels, intlLoc } from "./statsCharts";

// Codes 1–58 have boundary polygons; 59–69 (delegated wilayas) render no map.
const WilayaMiniMap = dynamic(() => import("./WilayaMiniMap"), { ssr: false });

function IncidentRow({ inc, t, locale }: { inc: WilayaStatsData["incidents"][0]; t: ReturnType<typeof useTranslations>; locale: string }) {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(intlLoc(locale), { day: "numeric", month: "short", year: "numeric" }) : "—";
  let dur = "—";
  if (inc.first_seen && inc.last_seen) {
    const h = Math.round((Date.parse(inc.last_seen) - Date.parse(inc.first_seen)) / 3_600_000);
    dur = h >= 48 ? t("incident.days", { n: Math.round(h / 24) }) : t("incident.hours", { n: Math.max(h, 1) });
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: inc.is_active ? "#fb5607" : "#64748b", flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{fmt(inc.first_seen)} → {fmt(inc.last_seen)}</span>
      <span style={{ width: 64, textAlign: "end", color: "var(--text-secondary)" }}>{dur}</span>
      <span style={{ width: 56, textAlign: "end", color: "var(--text-secondary)" }}>{inc.detection_count} <span style={{ fontSize: 10 }}>{t("incident.detections")}</span></span>
      <span style={{ width: 70, textAlign: "end", fontWeight: 700 }}>{inc.max_frp != null ? `${inc.max_frp} MW` : "—"}</span>
    </div>
  );
}

export default function WilayaStatsView({ data }: { data: WilayaStatsData }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const nf = useNum();

  const worst = useMemo(() => (data.found && data.by_year.length ? data.by_year.reduce((a, b) => (b.detections > a.detections ? b : a)) : null), [data]);

  if (!data.enabled || !data.found) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
        <StatsHeader />
        <div style={{ display: "grid", placeItems: "center", padding: 60, color: "var(--text-muted)", textAlign: "center" }}>
          <div>
            <p>{t("stats.wilaya.notFound")}</p>
            <Link href="/stats" style={{ color: ACCENT }}>{t("stats.wilaya.backToStats")}</Link>
          </div>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const name = wilayaName(data.wilaya.code, locale) || data.wilaya.name;
  const mLong = monthLabels(locale, "long");
  const peak = data.by_month.length ? data.by_month.reduce((a, b) => (b.detections > a.detections ? b : a)) : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
      <StatsHeader />
      <main style={{ padding: "clamp(16px, 4vw, 36px)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <Link href="/stats" style={{ fontSize: 12.5, color: "var(--text-secondary)", textDecoration: "none" }}>← {t("stats.wilaya.backToStats")}</Link>
          <h1 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, margin: "8px 0 0", letterSpacing: "-0.02em" }}>{name}</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "6px 0 0" }}>{t("stats.wilaya.subtitle", { name })}</p>

          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.55, maxWidth: 680 }}>
            {worst
              ? t("stats.wilaya.insight", { name, rank: k.rank, total: k.ranked_total, pct: nf.format(k.share_pct), year: worst.year })
              : t("stats.wilaya.insightNoWorst", { name, rank: k.rank, total: k.ranked_total, pct: nf.format(k.share_pct) })}
          </p>

          <div className="stats-kpi" style={{ marginTop: 18 }}>
            <Tile label={t("stats.kpi.confirmed")} value={nf.format(k.confirmed)} accent />
            <Tile label={t("stats.kpi.detections")} value={nf.format(k.detections)} />
            <Tile label={t("stats.wilaya.rankLabel")} value={t("stats.wilaya.rankValue", { rank: k.rank, total: k.ranked_total })} />
            <Tile label={t("stats.wilaya.shareLabel")} value={`${nf.format(k.share_pct)}%`} sub={t("stats.wilaya.shareSub")} />
            {k.biggest_frp != null && <Tile label={t("stats.wilaya.biggestLabel")} value={`${nf.format(k.biggest_frp)} MW`} />}
          </div>

          <div className="stats-kpi" style={{ marginTop: 12 }}>
            {peak && <InsightCard label={t("stats.peakLabel")} value={mLong[peak.month - 1]} sub={t("stats.seasonality.inSeason")} />}
            {worst && <InsightCard label={t("stats.worstLabel")} value={String(worst.year)} sub={`${nf.format(worst.detections)} ${t("stats.terms.detections")}`} />}
          </div>

          {data.wilaya.code <= 58 && (
            <Section title={t("stats.wilaya.mapTitle")} desc={t("stats.wilaya.mapDesc")}>
              <WilayaMiniMap code={data.wilaya.code} />
            </Section>
          )}

          <Section title={t("stats.seasonality.title")} desc={t("stats.seasonality.desc")}>
            <Seasonality values={Array.from({ length: 12 }, (_, i) => data.by_month.find((m) => m.month === i + 1)?.detections ?? 0)} labels={{ inSeason: t("stats.seasonality.inSeason"), offSeason: t("stats.seasonality.offSeason") }} />
          </Section>

          <Section title={t("stats.yearly.title")} desc={t("stats.yearly.desc")}>
            <Yearly series={data.by_year.map((y) => ({ year: y.year, value: y.detections }))} avgLabel={t("stats.yearly.average")} />
          </Section>

          <Section title={t("stats.wilaya.incidentsTitle")} desc={t("stats.wilaya.incidentsDesc")}>
            {data.incidents.length ? (
              <div>{data.incidents.map((inc) => <IncidentRow key={inc.id} inc={inc} t={t} locale={locale} />)}</div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("stats.wilaya.noIncidents")}</p>
            )}
          </Section>

          <Section title={t("stats.intensity.title")} desc={t("stats.intensity.desc")}>
            <Intensity buckets={data.frp_buckets} unit={t("stats.intensity.unit")} />
          </Section>

          <div style={{ marginTop: 22, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            <Link href="/stats" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>{t("stats.wilaya.backToStats")}</Link>
            {" · "}
            <Link href="/" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>{t("stats.backToMap")}</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
