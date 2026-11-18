import type { Metadata } from "next";
import { FAQ } from "@/lib/chat/faq";
import { config, OPEN_DATA_LICENCE_URL } from "@/lib/config";
import { getDataFreshness } from "@/lib/repo";
import { formatDate } from "@/components/Attribution";

export const metadata: Metadata = { title: "Data sources & FAQ" };

export default async function AboutData() {
  const fresh = await getDataFreshness();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Data sources &amp; FAQ</h1>

      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Where our data comes from</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>School facts</strong> (addresses, school type, CCAs, subjects, MOE programmes, ALP/LLP, mother tongues):
            MOE&apos;s <em>School Directory and Information</em> collection on{" "}
            <a className="text-brand underline" href="https://data.gov.sg/collections/457/view" target="_blank" rel="noopener noreferrer">
              data.gov.sg
            </a>
            , accessed {formatDate(fresh.dataGov)}, under the{" "}
            <a className="text-brand underline" href={OPEN_DATA_LICENCE_URL} target="_blank" rel="noopener noreferrer">
              Singapore Open Data Licence
            </a>
            .
          </li>
          <li>
            <strong>Cut-off points (COPs)</strong>:{" "}
            {config.copSourcePermitted
              ? `${fresh.copYear} PSLE score ranges, entered manually from MOE SchoolFinder.`
              : "not shown by SchoolPath. Each school page links to MOE SchoolFinder, and you can enter the COP yourself for banding."}
          </li>
          <li>
            <strong>Locations and maps</strong>: OneMap, © Singapore Land Authority. Distances are straight-line.
          </li>
          <li>School summaries, where shown, are written by SchoolPath in our own words.</li>
        </ul>
        <p className="text-muted">
          SchoolPath is an independent tool and is not affiliated with or endorsed by MOE. Always confirm details on{" "}
          <a className="text-brand underline" href="https://www.moe.gov.sg/schoolfinder" target="_blank" rel="noopener noreferrer">
            MOE SchoolFinder
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">S1 Posting FAQ</h2>
        {FAQ.map((f) => (
          <details key={f.id} id={`faq-${f.id}`} className="card scroll-mt-20 text-sm">
            <summary className="cursor-pointer font-medium">{f.q}</summary>
            <p className="mt-2 text-muted">{f.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
