import "server-only";
import Stripe from "stripe";
import { config } from "./config";
import { priceCents, type Tier } from "./pricing";

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!config.stripe.secretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(config.stripe.secretKey);
  return client;
}

const NAMES: Record<Tier, string> = {
  season: "SchoolPath Season Pass (S1 Posting)",
  family: "SchoolPath Family Pass",
};

/**
 * One-time payment (no subscription), priced in SGD. Payment methods (card, PayNow)
 * are enabled in the Stripe Dashboard; optionally pin a configuration with
 * STRIPE_PAYMENT_METHOD_CONFIG.
 */
export async function createCheckout(tier: Tier): Promise<string> {
  const amount = priceCents(tier);
  const pmc = process.env.STRIPE_PAYMENT_METHOD_CONFIG;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    ...(pmc ? { payment_method_configuration: pmc } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "sgd",
          unit_amount: amount,
          product_data: { name: NAMES[tier] },
        },
      },
    ],
    metadata: { tier },
    success_url: `${config.appUrl}/api/unlock/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appUrl}/pricing?cancelled=1`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function getPaidSession(sessionId: string): Promise<{ tier: Tier; amount: number } | null> {
  const s = await stripe().checkout.sessions.retrieve(sessionId);
  if (s.payment_status !== "paid") return null;
  const tier = (s.metadata?.tier === "family" ? "family" : "season") as Tier;
  return { tier, amount: s.amount_total ?? 0 };
}
