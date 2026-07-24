import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WilayaStatsView from "@/components/WilayaStatsView";
import { fetchWilayaStats } from "@/lib/api";
import wilayasData from "@/lib/wilayas.json";

export const revalidate = 900;

interface WProps { code: number; name: string; name_ar: string }
const BY_CODE = new Map<number, WProps>(
  (wilayasData as unknown as { features: { properties: WProps }[] }).features.map((f) => [f.properties.code, f.properties])
);

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const w = BY_CODE.get(Number(code));
  const name = w?.name ?? "Wilaya";
  const title = `${name} wildfire statistics — Algeria`;
  const description = `Fire history and trends for ${name}, Algeria: seasonal pattern, worst years, recent incidents and intensity, from NASA FIRMS satellite data. إحصائيات حرائق ${w?.name_ar ?? name}.`;
  return {
    title,
    description,
    alternates: { canonical: `/stats/${code}` },
    openGraph: { title, description, url: `/stats/${code}`, type: "website" },
  };
}

export default async function WilayaStatsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const num = Number(code);
  if (!Number.isInteger(num) || num < 1 || num > 99 || !BY_CODE.has(num)) notFound();

  const data = await fetchWilayaStats(num);
  const fallback = {
    enabled: false, found: false,
    wilaya: { code: num, name: BY_CODE.get(num)!.name, name_ar: BY_CODE.get(num)!.name_ar },
    kpis: { detections: 0, confirmed: 0, this_year: 0, rank: 0, ranked_total: 0, share_pct: 0, biggest_frp: null },
    coverage: { current_year: null }, by_year: [], by_month: [], frp_buckets: [0, 0, 0, 0, 0], incidents: [],
  };
  return <WilayaStatsView data={data ?? fallback} />;
}
