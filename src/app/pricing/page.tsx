import type { Metadata } from "next";
import { config } from "@/lib/config";
import { formatSgd, publicPricing } from "@/lib/pricing";
import { BuyButton, RestorePass } from "@/components/PricingBits";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage(props: PageProps<"/pricing">) {
  const sp = await props.searchParams;
  const p = publicPricing();
  const eb = (cents: number, regular: number) =>
    p.earlyBird && cents < regular ? (
      <span className="ml-2 text-sm font-normal text-muted line-through">{formatSgd(regular)}</span>
    ) : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Simple, one-time pricing</h1>
        <p className="text-sm text-muted">No subscription. Pay once for the posting season.</p>
        {p.earlyBird && <p className="mt-2 inline-block rounded-full bg-safe-soft px-3 py-1 text-xs font-semibold text-safe">Early-bird pricing until {p.earlyBirdEnd}</p>}
      </header>
      {sp.error && <p className="card text-sm text-reach">We couldn&apos;t confirm that payment. If you were charged, use your pass code below or contact us.</p>}
      {sp.cancelled && <p className="card text-sm text-muted">Checkout cancelled — no charge was made.</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <Plan name="Free" price="S$0" items={["Search & filters, map view", "Every school page", `${config.free.chatMessages} AI questions`, `Preview of your top ${config.free.matchPreview} matches + band counts`]} />
        <Plan
          name="Season Pass"
          highlight
          price={<>{formatSgd(p.season.cents)}{eb(p.season.cents, p.season.regularCents)}</>}
          items={["Everything in Free", "Unlimited AI questions", "Full Safe / Borderline / Reach list", "Balanced 6-choice suggestion", "Side-by-side compare", "Export & share as image / PDF"]}
          action={<BuyButton tier="season" label="Get Season Pass" />}
          foot="Valid for this S1 posting season."
        />
        {p.family && (
          <Plan
            name="Family Pass"
            price={<>{formatSgd(p.family.cents)}{eb(p.family.cents, p.family.regularCents)}</>}
            items={["Everything in Season Pass", "Valid for 3 years — for siblings or the next stage"]}
            action={<BuyButton tier="family" label="Get Family Pass" ghost />}
          />
        )}
      </div>

      <p className="text-xs text-muted">
        Payments are processed by Stripe (cards and PayNow). We don&apos;t see your card details. Paying unlocks features in
        this app only — it does not affect posting outcomes in any way.
      </p>
      <RestorePass />
    </div>
  );
}

function Plan({
  name,
  price,
  items,
  action,
  highlight,
  foot,
}: {
  name: string;
  price: React.ReactNode;
  items: string[];
  action?: React.ReactNode;
  highlight?: boolean;
  foot?: string;
}) {
  return (
    <section className={`card flex flex-col gap-3 ${highlight ? "border-2 border-brand" : ""}`}>
      <div>
        <h2 className="font-semibold">{name}</h2>
        <p className="mt-1 text-2xl font-bold">{price}</p>
      </div>
      <ul className="flex-1 space-y-1 text-sm">
        {items.map((i) => (
          <li key={i}>✓ {i}</li>
        ))}
      </ul>
      {action}
      {foot && <p className="text-xs text-muted">{foot}</p>}
    </section>
  );
}
