"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useProfile, useShortlist } from "@/lib/client/store";
import { useSchoolIndex } from "@/lib/client/school-index";
import { formatKm } from "@/lib/geo";
import { facets, searchIndex, type SearchFilters } from "@/lib/search";
import { MOTHER_TONGUES, title, ZONES } from "@/lib/vocab";
import { ShortlistButton } from "./ShortlistButton";

const SchoolMap = dynamic(() => import("./SchoolMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-white" />,
});

const KEYS = ["q", "zone", "nature", "type", "cca", "programme", "subject", "mt", "sap", "ip", "km"] as const;

export function SchoolSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data, error } = useSchoolIndex();
  const [profile] = useProfile();
  const [shortlist] = useShortlist();
  const [view, setView] = useState<"list" | "map">(params.get("view") === "map" ? "map" : "list");
  const [showFilters, setShowFilters] = useState(false);

  const get = (k: (typeof KEYS)[number]) => params.get(k) ?? "";
  const filters: SearchFilters = {
    q: get("q") || undefined,
    zone: get("zone") || undefined,
    nature: get("nature") || undefined,
    type: get("type") || undefined,
    cca: get("cca") || undefined,
    programme: get("programme") || undefined,
    subject: get("subject") || undefined,
    mt: get("mt") || undefined,
    sap: get("sap") === "1" ? true : undefined,
    ip: get("ip") === "1" ? true : undefined,
    maxKm: get("km") ? Number(get("km")) : undefined,
  };

  function update(k: (typeof KEYS)[number], v: string) {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const f = useMemo(() => (data ? facets(data.index) : null), [data]);
  // ~150 schools: filtering on every render is cheap.
  const hits = data ? searchIndex(data.index, filters, profile.home) : [];

  if (error) return <p className="card text-reach">Couldn&apos;t load schools. Please refresh.</p>;
  // Reserve a full screen while loading so the footer doesn't jump (CLS).
  if (!data || !f) return <div className="card min-h-[100dvh] animate-pulse" aria-busy />;

  const active = KEYS.filter((k) => params.get(k)).length;

  return (
    <div className="min-h-[100dvh] space-y-3">
      <div className="flex gap-2">
        <input
          className="input"
          type="search"
          placeholder="School name or MRT"
          defaultValue={get("q")}
          onChange={(e) => update("q", e.target.value)}
          aria-label="Search by school name or MRT"
        />
        <button className="btn-ghost shrink-0" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          Filters{active ? ` (${active - (get("q") ? 1 : 0)})` : ""}
        </button>
      </div>

      {showFilters && (
        <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select label="Zone" value={get("zone")} onChange={(v) => update("zone", v)} options={ZONES.map((z) => [z, title(z)])} />
          <Select
            label="Co-ed / single-sex"
            value={get("nature")}
            onChange={(v) => update("nature", v)}
            options={[
              ["CO-ED", "Co-ed"],
              ["BOYS", "Boys"],
              ["GIRLS", "Girls"],
            ]}
          />
          <Select label="School type" value={get("type")} onChange={(v) => update("type", v)} options={f.types.map((t) => [t, t])} />
          <Select label="Mother tongue offered" value={get("mt")} onChange={(v) => update("mt", v)} options={MOTHER_TONGUES.map((m) => [m, title(m)])} />
          <Text label="CCA" value={get("cca")} onChange={(v) => update("cca", v)} list="cca-list" placeholder="e.g. Basketball" />
          <Text label="Programme / ALP / LLP" value={get("programme")} onChange={(v) => update("programme", v)} placeholder="e.g. Music, STEM" />
          <Text label="Subject" value={get("subject")} onChange={(v) => update("subject", v)} list="subject-list" placeholder="e.g. Computing" />
          <Select
            label={profile.home ? "Distance from home" : "Distance (set home in Profile)"}
            value={get("km")}
            onChange={(v) => update("km", v)}
            options={[
              ["2", "Within 2 km"],
              ["3", "Within 3 km"],
              ["5", "Within 5 km"],
              ["8", "Within 8 km"],
              ["12", "Within 12 km"],
            ]}
            disabled={!profile.home}
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="chip min-h-10 cursor-pointer px-3">
              <input type="checkbox" checked={get("sap") === "1"} onChange={(e) => update("sap", e.target.checked ? "1" : "")} /> SAP
            </label>
            <label className="chip min-h-10 cursor-pointer px-3">
              <input type="checkbox" checked={get("ip") === "1"} onChange={(e) => update("ip", e.target.checked ? "1" : "")} /> IP
            </label>
            {active > 0 && (
              <button className="text-sm text-brand underline" onClick={() => router.replace(pathname)}>
                Clear all
              </button>
            )}
          </div>
          <datalist id="cca-list">
            {f.ccas.map((c) => (
              <option key={c} value={title(c)} />
            ))}
          </datalist>
          <datalist id="subject-list">
            {f.subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {hits.length} school{hits.length === 1 ? "" : "s"}
          {profile.home ? " · nearest first" : ""}
        </p>
        <div className="flex rounded-xl border border-line bg-white p-0.5 text-sm" role="tablist">
          {(["list", "map"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 font-medium ${view === v ? "bg-brand text-white" : "text-muted"}`}
            >
              {v === "list" ? "List" : "Map"}
            </button>
          ))}
        </div>
      </div>

      {view === "map" ? (
        <SchoolMap
          home={profile.home}
          points={hits
            .filter((h) => h.s.lat !== null && h.s.lng !== null)
            .map((h) => ({
              code: h.s.c,
              name: h.s.n,
              lat: h.s.lat!,
              lng: h.s.lng!,
              sub: [title(h.s.z), h.distanceKm !== null ? formatKm(h.distanceKm) : ""].filter(Boolean).join(" · "),
            }))}
        />
      ) : (
        <ul className="space-y-2">
          {hits.slice(0, 200).map((h) => (
            <li key={h.s.c} className="card flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={`/schools/${h.s.c}`} className="font-semibold text-ink hover:text-brand">
                  {h.s.n}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {[title(h.s.z), h.s.na === "CO-ED" ? "Co-ed" : title(h.s.na), h.s.t, h.s.sap && "SAP", h.s.ip && "IP"]
                    .filter(Boolean)
                    .join(" · ")}
                  {h.distanceKm !== null && ` · ${formatKm(h.distanceKm)}`}
                </p>
                {Object.values(h.matched).length > 0 && (
                  <p className="mt-1 text-xs text-brand">Matches: {Object.values(h.matched).map((m) => title(m!)).join(", ")}</p>
                )}
              </div>
              <ShortlistButton code={h.s.c} compact inList={shortlist.includes(h.s.c)} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">School data as of {data.dataAsOf ? new Date(data.dataAsOf).toLocaleDateString("en-SG") : "—"} from data.gov.sg.</p>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (readonly [string, string] | string[])[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" defaultValue={value} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value.trim())} />
    </label>
  );
}
