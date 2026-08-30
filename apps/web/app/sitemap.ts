import type { MetadataRoute } from "next";
import wilayasData from "@/lib/wilayas.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.algeriafiremap.site";

const WILAYA_CODES = (wilayasData as unknown as { features: { properties: { code: number } }[] }).features.map((f) => f.properties.code);

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
      alternates: { languages: { ar: SITE_URL, fr: SITE_URL, en: SITE_URL } },
    },
    {
      url: `${SITE_URL}/stats`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
      alternates: { languages: { ar: `${SITE_URL}/stats`, fr: `${SITE_URL}/stats`, en: `${SITE_URL}/stats` } },
    },
    // One indexable page per wilaya (SEO: "wildfire statistics <wilaya>").
    ...WILAYA_CODES.map((code) => ({
      url: `${SITE_URL}/stats/${code}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
      alternates: { languages: { ar: `${SITE_URL}/stats/${code}`, fr: `${SITE_URL}/stats/${code}`, en: `${SITE_URL}/stats/${code}` } },
    })),
  ];
}
