"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Commute } from "@/lib/commute-parse";
import { bandFor, DEFAULT_THRESHOLDS } from "@/lib/banding";
import { useProfile } from "@/lib/client/store";
import { formatKm, haversineKm, roughMinutes } from "@/lib/geo";
import { directionsEmbedUrl, directionsLink, EMBED_KEY, TRAVEL_MODES, type Destination, type TravelMode } from "@/lib/directions";
import { BandBadge } from "./BandBadge";

export function SchoolDistance({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [profile, , hydrated] = useProfile();
  if (!hydrated) return <p className="h-5" />;
  if (!profile.home)
    return (
      <p className="text-muted">
        <Link className="text-brand underline" href="/profile">
          Add your postal code
        </Link>{" "}
        to see the distance from home.
      </p>
    );
  if (lat === null || lng === null) return null;
  const km = haversineKm(profile.home, { lat, lng });
  return (
    <p>
      <span className="text-muted">From home:</span> <strong>{formatKm(km)}</strong> straight-line (~{roughMinutes(km)} min,
      rough estimate)
    </p>
  );
}

/**
 * Route from home to school, Google Maps style. The embedded map only loads when the
 * parent taps (privacy: home location goes to Google; also keeps the page fast).
 */
export function RouteToSchool({ dest, code }: { dest: Destination; code: string }) {
  const [profile, , hydrated] = useProfile();
  const [mode, setMode] = useState<TravelMode>("transit");
  const [show, setShow] = useState(false);
  if (!hydrated || !profile.home) return null;
  const home = profile.home;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Getting there</h2>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Travel mode">
          {TRAVEL_MODES.map((m) => (
            <button
              key={m.v}
              type="button"
              role="radio"
              aria-checked={mode === m.v}
              onClick={() => setMode(m.v)}
              className={mode === m.v ? "chip-on" : "chip"}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <CommuteSummary code={code} home={home} />
      <div className="flex flex-wrap gap-2">
        {EMBED_KEY && (
          <button type="button" className="btn-primary" onClick={() => setShow((s) => !s)} aria-expanded={show}>
            {show ? "Hide route" : "Show route"}
          </button>
        )}
        <a className={EMBED_KEY ? "btn-ghost" : "btn-primary"} href={directionsLink(home, dest, mode)} target="_blank" rel="noopener noreferrer">
          Open in Google Maps ↗
        </a>
      </div>
      {show && EMBED_KEY && (
        <iframe
          title={`Route from home to ${dest.name}`}
          src={directionsEmbedUrl(EMBED_KEY, home, dest, mode)}
          className="h-[420px] w-full rounded-xl border border-line"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      )}
      <p className="text-xs text-muted">
        Routes and times by Google Maps, for your chosen time of travel. Opening the route shares your home location with
        Google.
      </p>
    </section>
  );
}

/** OneMap public-transport time and legs for a school-day morning. Hidden if routing isn't configured. */
function CommuteSummary({ code, home }: { code: string; home: { lat: number; lng: number } }) {
  const [state, setState] = useState<{ key: string; commute: Commute | null; enabled: boolean } | null>(null);
  const key = `${code}|${home.lat},${home.lng}`;

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/commute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, home: { lat: home.lat, lng: home.lng } }),
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((b) => setState({ key, commute: b.commute ?? null, enabled: b.enabled !== false }))
      .catch(() => {});
    return () => ctl.abort();
  }, [code, home.lat, home.lng, key]);

  if (!state || state.key !== key) return <p className="h-10 animate-pulse rounded-xl bg-paper" aria-busy />;
  if (!state.enabled) return null;
  const c = state.commute;
  if (!c) return <p className="text-sm text-muted">No public-transport route found for a school-day morning.</p>;
  return (
    <div className="rounded-xl bg-paper p-3 text-sm">
      <p>
        <strong className="text-lg">{c.minutes} min</strong> by MRT / bus ·{" "}
        {c.transfers === 0 ? "no transfers" : `${c.transfers} transfer${c.transfers === 1 ? "" : "s"}`}
        {c.fare && ` · S$${c.fare}`}
      </p>
      <ol className="mt-1 space-y-0.5 text-xs text-muted">
        {c.legs.map((l, i) => (
          <li key={i}>
            {l.mode === "WALK" ? "🚶 Walk" : l.mode === "BUS" ? `🚌 Bus ${l.route}` : `🚇 ${l.mode === "TRAM" ? "LRT" : "MRT"} ${l.route}`} ·{" "}
            {l.minutes} min{l.mode !== "WALK" && l.from && l.to ? ` · ${l.from} → ${l.to}` : ""}
          </li>
        ))}
      </ol>
      <p className="mt-1 text-[11px] text-muted">Leaving about 6:45am on a school day. Route data: OneMap, © Singapore Land Authority.</p>
    </div>
  );
}

/** Lets a parent type the COP they read on SchoolFinder. Stored on-device only. */
export function UserCopEntry({ code }: { code: string }) {
  const [profile, setProfile, hydrated] = useProfile();
  const existing = profile.userCops[code];
  const [val, setVal] = useState<string>("");
  const [vacancy, setVacancy] = useState(false);
  if (!hydrated) return null;

  const pg = profile.postingGroup;
  const score = profile.psleScore;

  function save() {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 4 || n > 30) return;
    setProfile((p) => ({ ...p, userCops: { ...p.userCops, [code]: { value: n, vacancy: n === 30 && vacancy } } }));
    setVal("");
  }

  return (
    <div className="rounded-xl bg-paper p-3">
      {existing ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            You entered COP <strong>{existing.value}{existing.vacancy ? "*" : ""}</strong>
            {pg ? ` for PG${pg}` : ""}.
          </span>
          {score && pg ? (
            <BandBadge band={existing.vacancy && pg === 1 ? "safe" : bandFor(score, existing.value, DEFAULT_THRESHOLDS)} />
          ) : (
            <Link href="/profile" className="text-brand underline">
              Add your score
            </Link>
          )}
          <button
            className="text-xs text-muted underline"
            onClick={() =>
              setProfile((p) => {
                const rest = { ...p.userCops };
                delete rest[code];
                return { ...p, userCops: rest };
              })
            }
          >
            Remove
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="block">
            <span className="label text-xs">COP{pg ? ` for PG${pg}` : ""} (4–30)</span>
            <input className="input w-24" inputMode="numeric" type="number" min={4} max={30} value={val} onChange={(e) => setVal(e.target.value)} />
          </label>
          {pg === 1 && (
            <label className="chip min-h-11 cursor-pointer">
              <input type="checkbox" checked={vacancy} onChange={(e) => setVacancy(e.target.checked)} /> Shown as 30*
            </label>
          )}
          <button className="btn-ghost" type="submit">
            Save COP
          </button>
        </form>
      )}
      <p className="mt-2 text-xs text-muted">Saved only on this device and used for your banding.</p>
    </div>
  );
}
