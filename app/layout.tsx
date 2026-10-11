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
  title: {
    default: "Bangers & Postcodes",
    template: "%s · Bangers & Postcodes",
  },
  description: TAGLINE,
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
