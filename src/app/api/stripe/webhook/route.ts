import type { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { createPass } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Records passes even if the parent closes the tab before the success redirect.
 * createPass is idempotent on the Checkout session id.
 */
export async function POST(req: NextRequest) {
  if (!config.stripe.webhookSecret) return new Response("Webhook not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, config.stripe.webhookSecret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    if (s.payment_status === "paid") {
      await createPass(s.metadata?.tier === "family" ? "family" : "season", s.id, s.amount_total ?? 0);
    }
  }
  return Response.json({ received: true });
}
