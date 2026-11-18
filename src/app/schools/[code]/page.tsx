import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { config, OPEN_DATA_LICENCE_URL, SCHOOLFINDER_URL } from "@/lib/config";
import { getCopYear, getPermittedCops, getSchool } from "@/lib/repo";
import { formatDate } from "@/components/Attribution";
import { ShortlistButton } from "@/components/ShortlistButton";
import { RouteToSchool, SchoolDistance, UserCopEntry } from "@/components/SchoolClientBits";
import { title } from "@/lib/vocab";
import type { Cop } from "@/lib/types";

export async function generateMetadata(props: PageProps<"/schools/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  const s = await getSchool(code);
  return { title: s?.name ?? "School" };
}

export default async function SchoolPage(props: PageProps<"/schools/[code]">) {
  const { code } = await props.params;
  const s = await getSchool(code);
  if (!s) notFound();
  const [cops, copYear] = await Promise.all([getPermittedCops(), getCopYear()]);
  const cop = cops.get(s.school_code) ?? null;
  const sfUrl = s.schoolfinder_url ?? SCHOOLFINDER_URL;

  const ccaGroups = new Map<string, string[]>();
  for (const c of s.ccas) ccaGroups.set(c.group, [...(ccaGroups.get(c.group) ?? []), c.name]);

  const tags = [
    s.nature === "CO-ED" ? "Co-ed" : `${title(s.nature)}'`,
    s.type,
    s.is_sap && "SAP",
    s.is_ip && "Integrated Programme",
    s.is_gifted && "Gifted Education",
    title(s.zone),
  ].filter(Boolean) as string[];

  return (
    <article className="space-y-4">
      <nav className="text-sm">
        <Link href="/schools" className="text-brand underline">
          ← All schools
        </Link>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight tracking-tight">{s.name}</h1>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ShortlistButton code={s.school_code} />
          <Link href={`/chat?school=${s.school_code}`} className="btn-ghost">
            Ask AI about this school
          </Link>
        </div>
      </header>

      <section className="card space-y-1 text-sm">
        <SchoolDistance lat={s.lat} lng={s.lng} />
        <p>
          <span className="text-muted">Address:</span> {title(s.address)}, Singapore {s.postal_code}
        </p>
        {s.nearest_mrt && (
          <p>
            <span className="text-muted">Nearest MRT:</span> {title(s.nearest_mrt)}
          </p>
        )}
        {s.bus_services && (
          <p>
            <span className="text-muted">Buses:</span> {s.bus_services}
          </p>
        )}
        <p>
          <span className="text-muted">Mother tongues:</span> {s.mother_tongues.map(title).join(", ") || "—"}
        </p>
        <p className="flex flex-wrap gap-x-4">
          {s.website && (
            <a className="text-brand underline" href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer">
              School website
            </a>
          )}
          {s.phone && <a className="text-brand underline" href={`tel:${s.phone}`}>{s.phone}</a>}
        </p>
      </section>

      <RouteToSchool code={s.school_code} dest={{ name: s.name, postalCode: s.postal_code, lat: s.lat, lng: s.lng }} />

      <CopBlock cop={cop} copYear={copYear} sfUrl={sfUrl} code={s.school_code} />

      {s.culture_blurb && (
        <section className="card">
          <h2 className="font-semibold">In brief</h2>
          <p className="mt-1 text-sm text-ink">{s.culture_blurb}</p>
          <p className="mt-1 text-xs text-muted">Written by SchoolPath, based on the school&apos;s own website.</p>
        </section>
      )}

      {(s.alp || s.llp || s.moe_programmes.length > 0 || s.electives.length > 0) && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Programmes</h2>
          {s.alp && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Applied Learning Programme (ALP)</p>
              <p className="text-sm">
                <strong>{s.alp.domain}</strong>
                {s.alp.title && ` — ${s.alp.title}`}
              </p>
            </div>
          )}
          {s.llp && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Learning for Life Programme (LLP)</p>
              <p className="text-sm">
                <strong>{s.llp.domain}</strong>
                {s.llp.title && ` — ${s.llp.title}`}
              </p>
            </div>
          )}
          {s.moe_programmes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">MOE programmes</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {s.moe_programmes.map((p) => (
                  <li key={p} className="chip">
                    {title(p)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.electives.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Electives (SchoolFinder)</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {s.electives.map((p) => (
                  <li key={p} className="chip">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">CCAs ({s.ccas.length})</h2>
        {s.ccas.length === 0 && <p className="text-sm text-muted">Not listed in the open dataset — check the school&apos;s website.</p>}
        {[...ccaGroups.entries()].map(([g, names]) => (
          <div key={g}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title(g)}</p>
            <p className="text-sm">{names.map(title).join(" · ")}</p>
          </div>
        ))}
      </section>

      <details className="card">
        <summary className="cursor-pointer font-semibold">Subjects offered ({s.subjects.length})</summary>
        <p className="mt-2 text-sm leading-relaxed">{s.subjects.join(" · ")}</p>
      </details>

      {(s.dsa_talent_areas.length > 0 || s.affiliated_primary_schools.length > 0 || s.sen_support) && (
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold">From SchoolFinder</h2>
          {s.affiliated_primary_schools.length > 0 && (
            <p>
              <span className="text-muted">Affiliated primary schools:</span> {s.affiliated_primary_schools.join(", ")}
            </p>
          )}
          {s.dsa_talent_areas.length > 0 && (
            <p>
              <span className="text-muted">DSA talent areas:</span> {s.dsa_talent_areas.join(", ")}
            </p>
          )}
          {s.sen_support && (
            <p>
              <span className="text-muted">Special educational needs support:</span> {s.sen_support}
            </p>
          )}
          <p className="text-xs text-muted">SchoolFinder details as of {s.source_last_updated ? formatDate(s.source_last_updated) : "—"}.</p>
        </section>
      )}

      <footer className="space-y-1 text-xs text-muted">
        <p>
          <strong>Data as of {formatDate(s.datagov_accessed_at)}.</strong> Contains information from School Directory and
          Information on data.gov.sg, under the{" "}
          <a className="underline" href={OPEN_DATA_LICENCE_URL} target="_blank" rel="noopener noreferrer">
            Singapore Open Data Licence
          </a>
          . Check the{" "}
          <a className="underline" href={sfUrl} target="_blank" rel="noopener noreferrer">
            SchoolFinder page
          </a>{" "}
          and the school&apos;s website for the latest details.
        </p>
      </footer>
    </article>
  );
}

function CopBlock({ cop, copYear, sfUrl, code }: { cop: Cop | null; copYear: number; sfUrl: string; code: string }) {
  const note = (
    <p className="text-xs text-muted">
      COPs are last year&apos;s ({copYear} posting) and are not a guarantee — they change every year and tie-breakers apply.
    </p>
  );
  if (config.copSourcePermitted && cop) {
    const rows: [string, string][] = [
      ["PG3", fmt(cop.pg3)],
      ["PG2", fmt(cop.pg2)],
      ["PG1", cop.pg1 !== null ? `${cop.pg1}${cop.pg1_has_vacancy ? "*" : ""}` : "—"],
    ];
    if (cop.ip !== null) rows.unshift(["IP", fmt(cop.ip)]);
    const aff: [string, string][] = (
      [
        ["PG3", cop.affiliated_pg3],
        ["PG2", cop.affiliated_pg2],
        ["PG1", cop.affiliated_pg1],
      ] as const
    )
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, String(v)]);
    return (
      <section className="card space-y-2">
        <h2 className="font-semibold">Cut-off points ({cop.cop_year})</h2>
        <dl className="grid grid-cols-4 gap-2 text-center">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-paper p-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="text-lg font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        {aff.length > 0 && <p className="text-sm">Affiliated: {aff.map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
        {cop.pg1_has_vacancy && <p className="text-xs text-muted">* PG1 had leftover places.</p>}
        {cop.hcl_note && <p className="text-xs text-muted">{cop.hcl_note}</p>}
        {note}
      </section>
    );
  }
  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Cut-off points</h2>
      <p className="text-sm">
        Check this school&apos;s {copYear} PSLE score ranges on{" "}
        <a className="font-semibold text-brand underline" href={sfUrl} target="_blank" rel="noopener noreferrer">
          MOE SchoolFinder ↗
        </a>
        . Then enter the COP for your child&apos;s posting group below to see Safe / Borderline / Reach.
      </p>
      <UserCopEntry code={code} />
      {note}
    </section>
  );
}

const fmt = (n: number | null) => (n === null ? "—" : String(n));
