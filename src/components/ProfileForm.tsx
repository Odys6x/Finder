"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { likelyPostingGroups } from "@/lib/banding";
import { clearAllLocalData, useProfile } from "@/lib/client/store";
import { EMPTY_PROFILE, type PostingGroup, type Profile } from "@/lib/types";
import { CCA_CHOICES, MOTHER_TONGUES, PROGRAMME_CHOICES, title } from "@/lib/vocab";

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`${value === o.v ? "chip-on" : "chip"} min-h-10 px-4 text-sm`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChipPicker({
  selected,
  choices,
  onChange,
  label,
}: {
  selected: string[];
  choices: { label: string; value: string }[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const [custom, setCustom] = useState("");
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const extras = selected.filter((s) => !choices.some((c) => c.value === s));
  return (
    <div>
      <div className="flex flex-wrap gap-2" aria-label={label}>
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={selected.includes(c.value)}
            onClick={() => toggle(c.value)}
            className={selected.includes(c.value) ? "chip-on" : "chip"}
          >
            {c.label}
          </button>
        ))}
        {extras.map((e) => (
          <button key={e} type="button" aria-pressed onClick={() => toggle(e)} className="chip-on">
            {e} ✕
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = custom.trim();
          if (v && !selected.includes(v)) onChange([...selected, v]);
          setCustom("");
        }}
      >
        <input className="input" placeholder="Add another…" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} />
        <button className="btn-ghost" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}

export function ProfileForm() {
  const [profile, setProfile, hydrated] = useProfile();
  const router = useRouter();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState("");
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));

  if (!hydrated) return <div className="card h-96 animate-pulse" aria-busy />;

  const likely = profile.psleScore ? likelyPostingGroups(profile.psleScore) : [];

  async function findHome() {
    const q = profile.homePostal.trim();
    if (!/^\d{6}$/.test(q)) {
      setGeoErr("Enter a 6-digit postal code.");
      return;
    }
    setGeoBusy(true);
    setGeoErr("");
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const body = await r.json();
      if (body.result) set({ home: body.result });
      else setGeoErr("We couldn't find that postal code.");
    } catch {
      setGeoErr("Location lookup failed. Try again.");
    } finally {
      setGeoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <h2 className="font-semibold">PSLE result</h2>
        <div>
          <label className="label" htmlFor="score">
            PSLE score (4–30)
          </label>
          <input
            id="score"
            className="input max-w-40"
            inputMode="numeric"
            type="number"
            min={4}
            max={30}
            value={profile.psleScore ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? null : Number(e.target.value);
              const valid = n !== null && Number.isInteger(n) && n >= 4 && n <= 30;
              const pgs = valid ? likelyPostingGroups(n) : [];
              set({
                psleScore: valid ? n : null,
                postingGroup: profile.postingGroup && pgs.includes(profile.postingGroup) ? profile.postingGroup : (pgs[0] ?? null),
              });
            }}
          />
        </div>
        <div>
          <span className="label">Posting group</span>
          <Seg<PostingGroup | 0>
            name="Posting group"
            value={profile.postingGroup ?? 0}
            onChange={(v) => set({ postingGroup: v === 0 ? null : (v as PostingGroup) })}
            options={[
              { v: 3, label: "PG3" },
              { v: 2, label: "PG2" },
              { v: 1, label: "PG1" },
            ]}
          />
          <p className="mt-1 text-xs text-muted">
            Your results slip states the posting group.
            {likely.length > 0 && ` A score of ${profile.psleScore} is typically ${likely.map((g) => `PG${g}`).join(" or ")}.`}
          </p>
        </div>
        <div>
          <span className="label">Aiming for</span>
          <Seg
            name="Track"
            value={profile.track}
            onChange={(v) => set({ track: v })}
            options={[
              { v: "any", label: "Open to all" },
              { v: "express", label: "O-Level track" },
              { v: "ip", label: "Integrated Programme" },
            ]}
          />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Home &amp; travel</h2>
        <div>
          <label className="label" htmlFor="postal">
            Home postal code
          </label>
          <div className="flex gap-2">
            <input
              id="postal"
              className="input max-w-44"
              inputMode="numeric"
              maxLength={6}
              value={profile.homePostal}
              onChange={(e) => set({ homePostal: e.target.value.replace(/\D/g, ""), home: null })}
              onKeyDown={(e) => e.key === "Enter" && findHome()}
            />
            <button type="button" className="btn-ghost" onClick={findHome} disabled={geoBusy}>
              {geoBusy ? "Finding…" : profile.home ? "Found ✓" : "Find"}
            </button>
          </div>
          {profile.home && <p className="mt-1 text-xs text-muted">📍 {title(profile.home.label)}</p>}
          {geoErr && <p className="mt-1 text-xs text-reach">{geoErr}</p>}
          <p className="mt-1 text-xs text-muted">Used only to work out distances. Looked up via OneMap.</p>
        </div>
        <div>
          <span className="label">Max distance from home</span>
          <Seg
            name="Max distance"
            value={profile.maxKm ?? 0}
            onChange={(v) => set({ maxKm: v === 0 ? null : v })}
            options={[
              { v: 0, label: "Any" },
              { v: 3, label: "3 km" },
              { v: 5, label: "5 km" },
              { v: 8, label: "8 km" },
              { v: 12, label: "12 km" },
            ]}
          />
          <p className="mt-1 text-xs text-muted">Straight-line distance.</p>
        </div>
        <div>
          <span className="label">Max travel time by MRT / bus</span>
          <Seg
            name="Max travel time"
            value={profile.maxMinutes ?? 0}
            onChange={(v) => set({ maxMinutes: v === 0 ? null : v })}
            options={[
              { v: 0, label: "Any" },
              { v: 30, label: "30 min" },
              { v: 45, label: "45 min" },
              { v: 60, label: "60 min" },
            ]}
          />
          <p className="mt-1 text-xs text-muted">Door-to-door on a school-day morning, from OneMap routing. Schools without a calculated route aren&apos;t filtered out.</p>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Preferences</h2>
        <div>
          <span className="label">Show schools for</span>
          <Seg
            name="Child attends"
            value={profile.childSex}
            onChange={(v) => set({ childSex: v })}
            options={[
              { v: "", label: "Everyone" },
              { v: "M", label: "A boy" },
              { v: "F", label: "A girl" },
            ]}
          />
          <p className="mt-1 text-xs text-muted">Only used to hide schools your child can&apos;t attend.</p>
        </div>
        <div>
          <span className="label">School type</span>
          <Seg
            name="Co-ed or single-sex"
            value={profile.naturePref}
            onChange={(v) => set({ naturePref: v })}
            options={[
              { v: "any", label: "No preference" },
              { v: "co-ed", label: "Co-ed only" },
              { v: "single-sex", label: "Single-sex only" },
            ]}
          />
        </div>
        <div>
          <span className="label">SAP schools</span>
          <Seg
            name="SAP"
            value={profile.sapPref}
            onChange={(v) => set({ sapPref: v })}
            options={[
              { v: "any", label: "No preference" },
              { v: "prefer", label: "Prefer SAP" },
              { v: "avoid", label: "Not SAP" },
            ]}
          />
        </div>
        <div>
          <label className="label" htmlFor="mt">
            Mother tongue
          </label>
          <select id="mt" className="input max-w-56" value={profile.motherTongue} onChange={(e) => set({ motherTongue: e.target.value })}>
            <option value="">Any / not sure</option>
            {MOTHER_TONGUES.map((m) => (
              <option key={m} value={m}>
                {title(m)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Interests</h2>
        <div>
          <span className="label">CCAs</span>
          <ChipPicker label="CCAs" selected={profile.interestCcas} choices={CCA_CHOICES} onChange={(v) => set({ interestCcas: v })} />
        </div>
        <div>
          <span className="label">Programmes (ALP / LLP / electives)</span>
          <ChipPicker
            label="Programmes"
            selected={profile.interestProgrammes}
            choices={PROGRAMME_CHOICES}
            onChange={(v) => set({ interestProgrammes: v })}
          />
        </div>
      </section>

      <section className="card space-y-2">
        <label className="label" htmlFor="aff">
          Affiliated primary school <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="aff"
          className="input"
          placeholder="e.g. Bedok Green Primary"
          value={profile.affiliatedPrimary}
          maxLength={80}
          onChange={(e) => set({ affiliatedPrimary: e.target.value })}
        />
        <p className="text-xs text-muted">
          Only fill this in if your child&apos;s primary school has an affiliated secondary school — it can change which COP
          applies.
        </p>
      </section>

      <div className="no-print sticky bottom-20 z-20 flex flex-wrap gap-3 md:bottom-4">
        <button type="button" className="btn-primary shadow-lg" onClick={() => router.push("/match")} disabled={!profile.psleScore || !profile.postingGroup}>
          See my matches →
        </button>
      </div>

      <section className="space-y-2 pt-2 text-xs text-muted">
        <p>
          Privacy: this profile is stored in your browser only. When you view matches or chat, it is sent for that request
          and not stored on our servers. <Link className="underline" href="/privacy">Privacy details</Link>
        </p>
        <button
          type="button"
          className="text-reach underline"
          onClick={() => {
            if (confirm("Delete your profile, shortlist and chat from this device?")) {
              clearAllLocalData();
              setProfile(EMPTY_PROFILE);
            }
          }}
        >
          Delete my data from this device
        </button>
      </section>
    </div>
  );
}
