import Link from "next/link";
import { getDataFreshness, getSchools } from "@/lib/repo";
import { formatDate } from "@/components/Attribution";
import { HomeStart } from "@/components/HomeStart";

export default async function Home() {
  const [schools, fresh] = await Promise.all([getSchools(), getDataFreshness()]);
  return (
    <div className="space-y-8">
      <section className="pt-2">
        <p className="text-sm font-semibold text-brand">For P6 parents · S1 Posting</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
          Shortlist 6 secondary schools that fit your child — in one evening.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted">
          Enter the PSLE score, home and interests. We rank schools by fit, sort them into Safe, Borderline and Reach,
          and explain every match. Ask our AI anything about CCAs, programmes and posting rules.
        </p>
        <HomeStart />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["1", "Tell us the basics", "Score, posting group, postal code and what your child enjoys. Stays on your device."],
          ["2", "See ranked matches", "Distance, CCAs, programmes and preferences — with the reasons for each school."],
          ["3", "Build your 6 choices", "A balanced mix of Reach, Borderline and Safe, ready to share with family."],
        ].map(([n, t, d]) => (
          <div key={n} className="card">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{n}</span>
            <h2 className="mt-2 font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-2 text-sm">
        <h2 className="text-base font-semibold">How Safe / Borderline / Reach works</h2>
        <p className="text-muted">
          We compare your child&apos;s PSLE score with the school&apos;s <strong>previous year&apos;s</strong> cut-off point
          (COP) for their posting group. Lower scores are better.
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          <li className="rounded-xl bg-safe-soft p-3 text-safe">
            <strong>Safe</strong> — score is 3 or more points better than the COP
          </li>
          <li className="rounded-xl bg-border-soft p-3 text-border">
            <strong>Borderline</strong> — within 2 points either side
          </li>
          <li className="rounded-xl bg-reach-soft p-3 text-reach">
            <strong>Reach</strong> — more than 2 points above the COP
          </li>
        </ul>
        <p className="text-muted">
          COPs change every year and meeting one does not guarantee a place — tie-breakers apply. MOE suggests including
          2–3 schools with less stringent COPs.
        </p>
      </section>

      <p className="text-xs text-muted">
        {schools.length} secondary schools · school data as of {formatDate(fresh.dataGov)} · COP reference year {fresh.copYear}
        {" · "}
        <Link className="underline" href="/about-data">
          About our data
        </Link>
      </p>
    </div>
  );
}
