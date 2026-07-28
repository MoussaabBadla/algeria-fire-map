import type { Metadata } from "next";
import StatsView from "@/components/StatsView";
import type { StatsData } from "@/lib/api";

// TEMP: stats can point at a different backend via NEXT_PUBLIC_STATS_API_URL
// (falls back to the main API). Remove that env var to revert.
const API_URL = process.env.NEXT_PUBLIC_STATS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ISR: regenerate at most every 15 min (data changes only a few times/day).
export const revalidate = 900;

async function getStats(): Promise<StatsData | null> {
  try {
    const res = await fetch(`${API_URL}/stats`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as StatsData;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await getStats();
  const n = data?.enabled ? data.kpis.total_detections.toLocaleString("en-US") : "";
  const span = data?.coverage?.first_date?.slice(0, 4) ?? "2012";
  const title = "Wildfire Statistics for Algeria — trends by year & wilaya";
  const description = data?.enabled
    ? `${n} satellite fire detections across Algeria since ${span}: seasonal trends, worst years, most-affected wilayas, and fire intensity — from NASA FIRMS. إحصائيات حرائق الجزائر.`
    : "Wildfire statistics for Algeria: seasonal trends, yearly totals, and most-affected wilayas from NASA FIRMS satellite data.";
  return {
    title,
    description,
    alternates: { canonical: "/stats" },
    openGraph: { title, description, url: "/stats", type: "website" },
  };
}

export default async function StatsPage() {
  const data = await getStats();
  const fallback: StatsData = {
    enabled: false,
    kpis: { total_detections: 0, total_confirmed: 0, wilayas_affected: 0, total_frp: 0, active_incidents: 0, this_year: 0 },
    coverage: { first_date: null, last_date: null, current_year: null },
    by_year: [], by_month: [], top_wilayas_all: [], top_wilayas_year: [], frp_buckets: [0, 0, 0, 0, 0], wilaya_totals: [],
    seasonal_curve: { start_doy: 152, doys: [], current_year: null, current: [], median: [], p10: [], p90: [], hist_years: [] },
    years: [], monthly_by_year: {}, wilaya_by_year: {}, frp_by_year: {},
  };
  return <StatsView data={data ?? fallback} />;
}
