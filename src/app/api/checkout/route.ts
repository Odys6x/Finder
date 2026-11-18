import type { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { createPass, devUnlockAllowed, setPassCookie } from "@/lib/session";
import { priceCents, type Tier } from "@/lib/pricing";
import { createCheckout } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tier: Tier = body?.tier === "family" && config.pricing.familyEnabled ? "family" : "season";

  // Local dev without Stripe: issue a test pass directly.
  if (devUnlockAllowed()) {
    const pass = await createPass(tier, null, 0);
    await setPassCookie(pass);
    return Response.json({ url: `/unlock/success?code=${encodeURIComponent(pass.code)}&dev=1` });
  }
  if (!config.stripe.secretKey) return Response.json({ error: "Payments are not configured." }, { status: 503 });

  try {
    const url = await createCheckout(tier);
    return Response.json({ url, amount: priceCents(tier) });
  } catch (e) {
    console.error("checkout error", e);
    return Response.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
