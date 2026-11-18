"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MatchItem } from "@/lib/matching";
import { profileIsReady, useProfile, useShortlist } from "@/lib/client/store";
import { formatKm } from "@/lib/geo";
import { summariseLegs } from "@/lib/commute-parse";
import type { Band } from "@/lib/types";
import { title } from "@/lib/vocab";
import { BandBadge } from "./BandBadge";
import { Paywall } from "./Paywall";
import { ShortlistButton } from "./ShortlistButton";

interface MatchResponse {
  paid: boolean;
  copPermitted: boolean;
  copYear: number;
  counts: Record<Band | "unbanded", number>;
  total: number;
  excluded: number;
  bandingAvailable: boolean;
  items: MatchItem[];
  lockedCount: number;
  suggestion: { codes: string[]; notes: string[] } | null;
  suggestionLocked: boolean;
  commuteEnabled: boolean;
  commutePending: number;
}

const FIELD_LABEL: Record<string, string> = {
  pg3: "PG3",
  pg2: "PG2",
  pg1: "PG1",
  ip: "IP",
  affiliated_pg3: "affiliated PG3",
  affiliated_pg2: "affiliated PG2",
  affiliated_pg1: "affiliated PG1",
  user: "your entered",
};

export function MatchView() {
  const [profile, , hydrated] = useProfile();
  const [shortlist, setShortlist] = useShortlist();
  const [data, setData] = useState<MatchResponse | null>(null);
  const [err, setErr] = useState(false);
  const [bandFilter, setBandFilter] = useState<Band | "all">("all");
  // Bumped to re-fetch while travel times are still being worked out in the background.
  const [refresh, setRefresh] = useState(0);
  const body = useMemo(() => JSON.stringify({ profile }), [profile]);

  useEffect(() => {
    if (!hydrated || !profileIsReady(profile)) return;
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch("/api/match", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctl.signal })
      .then((r) => r.json())
      .then((d: MatchResponse) => {
        setData(d);
        setErr(false);
        if (d.commutePending > 0 && refresh < 4) timer = setTimeout(() => setRefresh((n) => n + 1), 3000);
      })
      .catch((e) => e.name !== "AbortError" && setErr(true));
    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [body, hydrated, profile, refresh]);

  if (!hydrated) return <div className="card min-h-[100dvh] animate-pulse" aria-busy />;
  if (!profileIsReady(profile)) {
    return (
      <div className="card space-y-3">
        <h1 className="text-xl font-bold">Your matches</h1>
        <p className="text-sm text-muted">Add your child&apos;s PSLE score and posting group to see ranked matches.</p>
        <Link href="/profile" className="btn-primary">
          Set up profile
        </Link>
      </div>
    );
  }
  if (err) return <p className="card text-reach">Couldn&apos;t load matches. Please refresh.</p>;
  if (!data) return <div className="card min-h-[100dvh] animate-pulse" aria-busy />;

  const byCode = new Map(data.items.map((i) => [i.code, i]));
  const visible = data.items.filter((i) => bandFilter === "all" || i.band.band === bandFilter);
  const c = data.counts;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your matches</h1>
          <p className="text-sm text-muted">
            Score {profile.psleScore} · PG{profile.postingGroup}
            {profile.home ? ` · near ${title(profile.home.label)}` : ""} · {data.total} schools fit your filters
          </p>
        </div>
        <Link href="/profile" className="text-sm font-medium text-brand underline">
          Edit profile
        </Link>
      </header>

      {data.commutePending > 0 && (
        <p className="animate-pulse text-xs text-muted" aria-live="polite">
          Working out MRT/bus travel times for {data.commutePending} more schools…
        </p>
      )}

      {data.bandingAvailable ? (
        <div className="grid grid-cols-4 gap-2 text-center" role="list" aria-label="Matches by band">
          {(
            [
              ["safe", "Safe", "bg-safe-soft text-safe"],
              ["borderline", "Borderline", "bg-border-soft text-border"],
              ["reach", "Reach", "bg-reach-soft text-reach"],
              ["unbanded", "No COP", "bg-white text-muted border border-line"],
            ] as const
          ).map(([k, l, cls]) => (
            <button
              key={k}
              role="listitem"
              disabled={!data.paid || k === "unbanded"}
              onClick={() => setBandFilter(bandFilter === k ? "all" : (k as Band))}
              className={`rounded-xl p-2 ${cls} ${bandFilter === k ? "ring-2 ring-current" : ""}`}
            >
              <span className="block text-xl font-bold">{c[k]}</span>
              <span className="text-xs font-medium">{l}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card border-border/30 bg-border-soft text-sm">
          <p className="font-semibold text-ink">Safe / Borderline / Reach needs last year&apos;s COPs.</p>
          <p className="mt-1 text-muted">
            {data.copPermitted
              ? "COPs haven't been loaded yet for these schools."
              : "Open a school, check its COP on MOE SchoolFinder, and enter it — we'll band it instantly."}{" "}
            Meanwhile, schools are ranked by how well they fit your preferences.
          </p>
        </div>
      )}

      {data.suggestion && data.suggestion.codes.length > 0 && (
        <section className="card space-y-3 border-brand/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Suggested 6 choices</h2>
            <button
              className="btn-ghost min-h-9 text-xs"
              onClick={() => setShortlist([...data.suggestion!.codes, ...shortlist.filter((s) => !data.suggestion!.codes.includes(s))].slice(0, 10))}
            >
              Add all to shortlist
            </button>
          </div>
          <ol className="space-y-1.5">
            {data.suggestion.codes.map((code, i) => {
              const it = byCode.get(code);
              if (!it) return null;
              return (
                <li key={code} className="flex items-center gap-2 text-sm">
                  <span className="w-5 shrink-0 text-right font-semibold text-muted">{i + 1}.</span>
                  <Link href={`/schools/${code}`} className="min-w-0 flex-1 truncate font-medium hover:text-brand">
                    {it.name}
                  </Link>
                  <BandBadge band={it.band.band} />
                </li>
              );
            })}
          </ol>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
            {data.suggestion.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <ul className="space-y-2">
        {visible.map((it) => (
          <MatchCard key={it.code} it={it} saved={shortlist.includes(it.code)} />
        ))}
      </ul>

      {!data.paid && data.lockedCount > 0 && (
        <Paywall
          headline={
            data.bandingAvailable
              ? `You have ${c.safe} safe, ${c.borderline} borderline and ${c.reach} reach matches. Unlock the full list.`
              : `${data.lockedCount} more schools match your profile. Unlock the full ranked list.`
          }
        >
          {data.suggestionLocked && "Includes a balanced 6-choice suggestion (2 reach, 2 borderline, 2 safe)."}
        </Paywall>
      )}

      <p className="text-xs text-muted">
        Fit is based only on what you told us (distance, interests, preferences) — not on whether a school is
        &quot;good&quot;. {data.excluded > 0 && `${data.excluded} schools hidden by your filters or because they admit through their own processes (specialised schools). `}
        Bands use {data.copYear} COPs, which change yearly and don&apos;t guarantee a place.
      </p>
    </div>
  );
}

function MatchCard({ it, saved }: { it: MatchItem; saved: boolean }) {
  return (
    <li className="card space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/schools/${it.code}`} className="font-semibold leading-snug hover:text-brand">
            {it.name}
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            {[title(it.zone), it.nature === "CO-ED" ? "Co-ed" : title(it.nature), it.type, it.distanceKm !== null && formatKm(it.distanceKm)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <ShortlistButton code={it.code} compact inList={saved} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BandBadge band={it.band.band} />
        {it.band.cop !== null && it.band.field && (
          <span className="text-xs text-muted">
            vs {FIELD_LABEL[it.band.field]} COP {it.band.cop}
          </span>
        )}
        <span className="text-xs text-muted">Fit {it.fit}%</span>
      </div>
      {it.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {it.reasons.map((r) => (
            <li key={r} className="rounded-lg bg-brand-soft px-2 py-0.5 text-xs text-brand-dark">
              {r}
            </li>
          ))}
        </ul>
      )}
      {it.commute && <p className="text-xs text-muted">🚇 {summariseLegs(it.commute)}</p>}
      {it.band.notes.length > 0 && <p className="text-xs text-muted">{it.band.notes.join(" ")}</p>}
    </li>
  );
}
