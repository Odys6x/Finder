import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { DISCLAIMER } from "@/lib/config";
import { Nav } from "@/components/Nav";
import { Attribution } from "@/components/Attribution";
import "./globals.css";

// Pages read live data (freshness, passes); render per request rather than at build time.
export const dynamic = "force-dynamic";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "SchoolPath Finder — secondary school choices for S1 Posting", template: "%s · SchoolPath Finder" },
  description:
    "Personal secondary school recommendations for Singapore P6 parents: Safe / Borderline / Reach sorting, school search, map and an AI assistant. Not affiliated with MOE.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f6e6a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={inter.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <div role="note" className="bg-ink px-4 py-1.5 text-center text-[12px] leading-snug text-white/90">
          {DISCLAIMER}
        </div>
        <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-ink">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-white">
                SP
              </span>
              SchoolPath
            </Link>
            <Nav variant="top" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:pb-12">{children}</main>
        <footer className="border-t border-line bg-white pb-24 md:pb-0">
          <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 text-xs leading-relaxed text-muted">
            <Attribution />
            <p>
              <strong className="text-ink">Not affiliated with or endorsed by MOE.</strong> {DISCLAIMER} Always confirm
              details on{" "}
              <a className="underline" href="https://www.moe.gov.sg/schoolfinder" target="_blank" rel="noopener noreferrer">
                MOE SchoolFinder
              </a>
              .
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <Link className="underline" href="/about-data">
                Data sources &amp; FAQ
              </Link>
              <Link className="underline" href="/privacy">
                Privacy
              </Link>
              <Link className="underline" href="/pricing">
                Pricing
              </Link>
            </p>
          </div>
        </footer>
        <Nav variant="bottom" />
      </body>
    </html>
  );
}
