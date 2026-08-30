import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { DEFAULT_LOCALE, dirFor, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoArabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.algeriafiremap.site";

const TITLE = "Algeria Fire Map — Live wildfire tracking | خريطة حرائق الجزائر";
const DESCRIPTION =
  "Real-time satellite wildfire monitoring across Algeria: live fire detections, intensity, and fire-risk by wilaya, from NASA FIRMS. " +
  "Suivi en temps réel des feux de forêt en Algérie. " +
  "متابعة حرائق الغابات في الجزائر مباشرة عبر الأقمار الاصطناعية.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Algeria Fire Map",
  title: { default: TITLE, template: "%s · Algeria Fire Map" },
  description: DESCRIPTION,
  keywords: [
    // English
    "Algeria fire map", "wildfire Algeria", "Algeria wildfires", "forest fire Algeria",
    "NASA FIRMS Algeria", "live fire map Algeria", "fire risk Algeria", "VIIRS MODIS Algeria",
    // French
    "carte des feux Algérie", "feux de forêt Algérie", "incendie Algérie", "feux Kabylie",
    "risque incendie Algérie", "surveillance des feux Algérie",
    // Arabic
    "خريطة حرائق الجزائر", "حرائق الغابات الجزائر", "حرائق الجزائر مباشر", "حرائق القبائل",
    "خريطة الحرائق في الجزائر", "خطر الحرائق الجزائر", "رصد الحرائق بالأقمار الاصطناعية",
  ],
  authors: [{ name: "Moussaab Badla", url: "https://github.com/MoussaabBadla" }],
  creator: "Moussaab Badla",
  category: "Environment",
  alternates: {
    canonical: "/",
    languages: { "ar-DZ": "/", "fr-DZ": "/", en: "/", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    siteName: "Algeria Fire Map",
    title: TITLE,
    description:
      "Live satellite wildfire monitoring across Algeria — detections, intensity and fire-risk by wilaya. خريطة حرائق الجزائر مباشرة.",
    url: SITE_URL,
    locale: "ar_DZ",
    alternateLocale: ["fr_DZ", "en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Real-time wildfire monitoring for Algeria — NASA FIRMS detections + fire-risk by wilaya.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const REPO_URL = "https://github.com/MoussaabBadla/algeria-fire-map";
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

// Structured data as a linked @graph — additive over the previous single
// WebApplication node: adds WebSite, an author/publisher entity, and a Dataset
// (Google Dataset Search) describing the FIRMS-derived fire data.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Algeria Fire Map",
      alternateName: ["خريطة حرائق الجزائر", "Carte des feux de forêt en Algérie"],
      description: DESCRIPTION,
      inLanguage: ["ar", "fr", "en"],
      publisher: { "@id": `${SITE_URL}/#author` },
    },
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#author`,
      name: "Moussaab Badla",
      url: "https://github.com/MoussaabBadla",
      sameAs: ["https://github.com/MoussaabBadla"],
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Algeria Fire Map",
      alternateName: ["خريطة حرائق الجزائر", "Carte des feux de forêt en Algérie"],
      url: SITE_URL,
      applicationCategory: "https://schema.org/GovernmentApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      inLanguage: ["ar", "fr", "en"],
      description: DESCRIPTION,
      isAccessibleForFree: true,
      author: { "@id": `${SITE_URL}/#author` },
      publisher: { "@id": `${SITE_URL}/#author` },
      image: OG_IMAGE,
      screenshot: OG_IMAGE,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Live NASA FIRMS wildfire detections",
        "Fire intensity (FRP) with a confirmed-fire filter",
        "Per-wilaya fire-risk (FWI) with a 3-day forecast",
        "Wildfire statistics and history by wilaya",
        "Communities near active fires",
      ],
      sameAs: [REPO_URL],
      about: { "@type": "Thing", name: "Wildfire monitoring in Algeria" },
      areaServed: { "@type": "Country", name: "Algeria" },
    },
    {
      "@type": "Dataset",
      "@id": `${SITE_URL}/#dataset`,
      name: "Algeria wildfire detections and fire-risk",
      description:
        "Near real-time active-fire detections (NASA FIRMS VIIRS & MODIS) and fire-weather risk (FWI) across Algeria, updated hourly and aggregated by wilaya.",
      url: SITE_URL,
      inLanguage: ["ar", "fr", "en"],
      isAccessibleForFree: true,
      license: "https://opensource.org/licenses/MIT",
      creator: { "@id": `${SITE_URL}/#author` },
      isBasedOn: "https://firms.modaps.eosdis.nasa.gov/",
      keywords: ["wildfire", "Algeria", "NASA FIRMS", "VIIRS", "MODIS", "fire risk", "FWI", "forest fire"],
      temporalCoverage: "2001-06-04/..",
      variableMeasured: ["active fire detections", "fire radiative power", "fire weather index"],
      spatialCoverage: {
        "@type": "Place",
        name: "Algeria",
        geo: { "@type": "GeoShape", box: "18.9 -8.7 37.1 12.0" },
      },
    },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      </body>
    </html>
  );
}
