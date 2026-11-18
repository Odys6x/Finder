"use client";
import Link from "next/link";
import { useState } from "react";
import { cardFacts } from "@/lib/guided";
import type { MatchItem } from "@/lib/matching";
import { formatSgd, startCheckout, useMe } from "@/lib/client/me";
import { useShortlist } from "@/lib/client/store";
import { title } from "@/lib/vocab";
import { BandBadge } from "../BandBadge";

export const shortName = (n: string) => n.replace(/ School$/i, "").replace(/ \(Secondary\)$/i, "");

export function SaveStar({ code, className = "" }: { code: string; className?: string }) {
  const [list, setList] = useShortlist();
  const saved = list.includes(code);
  const full = !saved && list.length >= 10;
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from shortlist" : "Save to shortlist"}
      title={full ? "Shortlist is full (10)" : undefined}
      disabled={full}
      onClick={() => setList(saved ? list.filter((c) => c !== code) : [...list, code])}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl transition active:scale-90 ${saved ? "bg-accent-soft text-accent" : "bg-paper text-muted"} ${className}`}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}

/** Compact, scannable school card for the chat carousel. */
export function SchoolCardView({ it }: { it: MatchItem }) {
  return (
    <article className="card flex w-[78vw] max-w-[290px] shrink-0 snap-start flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        {it.band.band ? (
          <BandBadge band={it.band.band} />
        ) : (
          // No COP yet: show how well it fits the family's answers instead of a warning-like badge.
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark">Fit {it.fit}%</span>
        )}
        <SaveStar code={it.code} className="-mr-1 -mt-1" />
      </div>
      <div>
        <h3 className="text-[17px] font-bold leading-tight">{shortName(it.name)}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {title(it.zone)} · {it.nature === "CO-ED" ? "Co-ed" : title(it.nature)}
          {it.band.cop !== null && it.band.field && ` · COP ${it.band.cop}`}
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {cardFacts(it).map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Link href={`/schools/${it.code}`} className="mt-auto pt-1 text-sm font-semibold text-brand">
        View school →
      </Link>
    </article>
  );
}

/** Unlock prompt shown as the last card in the carousel (free users), after they've seen value. */
export function UnlockCard({ locked, headline }: { locked: number; headline?: string }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const price = me?.pricing.season;
  return (
    <article className="flex w-[78vw] max-w-[290px] shrink-0 snap-start flex-col gap-2 rounded-3xl bg-ink p-4 text-white">
      <p className="text-2xl" aria-hidden>
        🔓
      </p>
      <h3 className="text-[17px] font-bold leading-tight">{headline ?? `${locked} more schools match`}</h3>
      <p className="text-sm text-white/80">See every match, your balanced 6 choices, unlimited questions, compare and share.</p>
      <button
        className="btn mt-auto bg-white text-ink hover:bg-accent-soft"
        disabled={busy || !me}
        onClick={async () => {
          setBusy(true);
          try {
            await startCheckout("season");
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening…" : `Unlock${price ? ` · ${formatSgd(price.cents)}` : ""}`}
      </button>
      <p className="text-[11px] text-white/70">
        One-time payment{me?.pricing.earlyBird ? " · early-bird price" : ""}. No subscription.
      </p>
      {err && <p className="text-xs text-accent-soft">{err}</p>}
    </article>
  );
}
