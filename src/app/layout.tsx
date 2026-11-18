import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { DISCLAIMER } from "@/lib/config";
import "./globals.css";

// Pages read live data (freshness, passes); render per request rather than at build time.
export const dynamic = "force-dynamic";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "SchoolPath — find the right secondary school", template: "%s · SchoolPath" },
  description:
    "Chat-style helper for Singapore P6 parents choosing secondary schools for S1 Posting: matches, Safe / Borderline / Reach, travel times and an AI assistant. Not affiliated with MOE.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f4ee", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={jakarta.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        {/* Required on every screen (spec §8). */}
        <div role="note" className="no-print bg-ink px-4 py-1 text-center text-[11px] leading-snug text-white/85">
          {DISCLAIMER}
        </div>
        {children}
      </body>
    </html>
  );
}
