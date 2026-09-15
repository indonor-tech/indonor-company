import type { Metadata } from "next";
import "./globals.css";

import { Geist } from "next/font/google";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import JsonLd from "../components/seo/JsonLd";
import WebsiteTracker from "../components/analytics/WebsiteTracker";
import { ThemeProvider } from "next-themes";
import { buildMetadata, pageSeo, siteConfig } from "@/lib/site";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const homeMeta = buildMetadata(pageSeo.home);

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  ...homeMeta,
  title: {
    default: homeMeta.title,
    template: `%s | ${siteConfig.name}`,
  },
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.legalName, url: siteConfig.url }],
  creator: siteConfig.legalName,
  publisher: siteConfig.legalName,
  category: "Technology Consulting",
  classification: "Business",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/images/logo.png", type: "image/png" }],
    apple: [{ url: "/images/logo.png" }],
  },
  other: {
    "ai-content": "official",
    "geo.region": "NO;IN",
    "geo.placename": "Oslo; New Delhi",
  },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
  process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? {
        verification: {
          ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
            ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
            : {}),
          ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
            ? {
                other: {
                  "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
                },
              }
            : {}),
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={geist.variable}>
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
      </head>
      <body className="bg-background text-foreground overflow-x-hidden">
        <JsonLd />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Navbar />
          <WebsiteTracker />
          <main className="min-h-screen w-full max-w-[100vw] overflow-x-hidden">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
