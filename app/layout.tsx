import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";

import { SiteFrame } from "@/components/site-frame";
import { TAGLINE } from "@/lib/format";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://bangers-and-postcodes.vercel.app"),
  title: {
    default: "Bangers & Postcodes",
    template: "%s · Bangers & Postcodes",
  },
  description: TAGLINE,
  openGraph: {
    title: "Bangers & Postcodes",
    description: TAGLINE,
    siteName: "Bangers & Postcodes",
    locale: "en_GB",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  );
}
