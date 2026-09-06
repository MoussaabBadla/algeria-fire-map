import type { Metadata } from "next";
import RestoreDashboard from "@/components/RestoreDashboard";
import type { RestorationData } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.algeriafiremap.site";

export const revalidate = 1800;

async function getRestoration(): Promise<RestorationData | null> {
  try {
    const res = await fetch(`${API_URL}/restoration?days=120`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as RestorationData;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await getRestoration();
  const ha = data?.enabled && data.totals ? Math.round(data.totals.area_ha).toLocaleString("en-US") : "";
  const title = "Reforestation & Land Recovery Map for Algeria — burned areas to replant";
  const description = data?.enabled
    ? `${ha} hectares burned across Algeria in the last 4 months, mapped and priority-ranked for reforestation and land restoration — from NASA FIRMS. خريطة إعادة التشجير وإحياء الغطاء النباتي في الجزائر.`
    : "Burned areas across Algeria mapped and priority-ranked for reforestation and land recovery, from NASA FIRMS satellite data.";
  return {
    title,
    description,
    alternates: { canonical: "/restore" },
    openGraph: { title, description, url: "/restore", type: "website" },
  };
}

export default async function RestorePage() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Algeria Fire Map", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Reforestation & Land Recovery", item: `${SITE_URL}/restore` },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <RestoreDashboard />
    </>
  );
}
