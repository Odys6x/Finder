import { NextResponse, type NextRequest } from "next/server";
import { createPass, setPassCookie } from "@/lib/session";
import { getPaidSession } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Stripe success redirect lands here: verify payment server-side, issue the pass, set the cookie. */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const fail = new URL("/pricing?error=payment", req.url);
  if (!sessionId) return NextResponse.redirect(fail);
  try {
    const paid = await getPaidSession(sessionId);
    if (!paid) return NextResponse.redirect(fail);
    const pass = await createPass(paid.tier, sessionId, paid.amount);
    await setPassCookie(pass);
    return NextResponse.redirect(new URL(`/unlock/success?code=${encodeURIComponent(pass.code)}`, req.url));
  } catch (e) {
    console.error("unlock confirm error", e);
    return NextResponse.redirect(fail);
  }
}
