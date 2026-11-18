"use client";
import Link from "next/link";
import { useState } from "react";
import { formatSgd, startCheckout, useMe } from "@/lib/client/me";

/** Shown only after the parent has seen value (spec §5.7). */
export function Paywall({ headline, children }: { headline: string; children?: React.ReactNode }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const price = me?.pricing.season;

  async function go() {
    setBusy(true);
    setErr("");
    try {
      await startCheckout("season");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card border-brand/30 bg-gradient-to-br from-brand-soft to-white">
      <p className="text-base font-semibold text-ink">{headline}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      <ul className="mt-3 space-y-1 text-sm text-ink">
        <li>✓ Full Safe / Borderline / Reach list</li>
        <li>✓ Balanced 6-choice suggestion</li>
        <li>✓ Unlimited AI chat, side-by-side compare, export to share</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={go} disabled={busy || !me}>
          {busy ? "Opening checkout…" : `Unlock Season Pass${price ? ` · ${formatSgd(price.cents)}` : ""}`}
        </button>
        {me?.pricing.earlyBird && price && price.cents < price.regularCents && (
          <span className="text-xs text-muted">
            Early-bird price (usual {formatSgd(price.regularCents)}). One-time payment, no subscription.
          </span>
        )}
        <Link href="/pricing" className="text-sm font-medium text-brand underline">
          Compare plans
        </Link>
      </div>
      {me?.devUnlock && <p className="mt-2 text-xs text-muted">Dev mode: no Stripe key set, unlocking issues a free test pass.</p>}
      {err && <p className="mt-2 text-sm text-reach">{err}</p>}
    </div>
  );
}
