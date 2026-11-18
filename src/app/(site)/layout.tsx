import { AppHeader } from "@/components/AppHeader";
import { Attribution } from "@/components/Attribution";
import { DISCLAIMER } from "@/lib/config";
import Link from "next/link";

/** Layout for the secondary pages (school details, full lists, pricing, admin…). */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-5">{children}</main>
      <footer className="border-t border-line bg-card">
        <div className="mx-auto max-w-3xl space-y-2 px-4 py-6 text-xs leading-relaxed text-muted">
          <Attribution />
          <p>
            <strong className="text-ink">Not affiliated with or endorsed by MOE.</strong> {DISCLAIMER} Always confirm details
            on{" "}
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
    </>
  );
}
