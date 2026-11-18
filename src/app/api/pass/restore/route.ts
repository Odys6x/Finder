import type { NextRequest } from "next/server";
import { clearPassCookie, findPassByCode, setPassCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Restore a pass on another device / browser using its code. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.slice(0, 20) : "";
  const pass = code ? await findPassByCode(code) : null;
  if (!pass) return Response.json({ error: "That code wasn't found or has expired." }, { status: 404 });
  await setPassCookie(pass);
  return Response.json({ ok: true, tier: pass.tier });
}

/** Sign this browser out of the pass. */
export async function DELETE() {
  await clearPassCookie();
  return Response.json({ ok: true });
}
