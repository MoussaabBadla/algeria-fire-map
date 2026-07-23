import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://algeria-fire-map.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Algeria Fire Map — Real-time wildfire monitoring",
    template: "%s · Algeria Fire Map",
  },
  description:
    "Real-time satellite wildfire monitoring for Algeria. Active fire detections from NASA FIRMS (VIIRS & MODIS) on an interactive national map.",
  keywords: ["Algeria", "wildfire", "fire map", "NASA FIRMS", "VIIRS", "MODIS", "feux de forêt", "Algérie"],
  openGraph: {
    title: "Algeria Fire Map — Real-time wildfire monitoring",
    description:
      "Live satellite fire detections across Algeria, updated throughout the day.",
    type: "website",
    locale: "fr_DZ",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
