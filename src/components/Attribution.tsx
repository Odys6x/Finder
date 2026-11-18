import { DATA_GOV_DATASET_NAME, OPEN_DATA_LICENCE_URL } from "@/lib/config";
import { getDataFreshness } from "@/lib/repo";

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(
    new Date(iso),
  );
}

/** Attribution required by the Singapore Open Data Licence (spec §3 rule 1). */
export async function Attribution() {
  const { dataGov } = await getDataFreshness().catch(() => ({ dataGov: null }));
  return (
    <p>
      Contains information from {DATA_GOV_DATASET_NAME} accessed on {formatDate(dataGov)} from{" "}
      <a className="underline" href="https://data.gov.sg/collections/457/view" target="_blank" rel="noopener noreferrer">
        data.gov.sg
      </a>
      , made available under the{" "}
      <a className="underline" href={OPEN_DATA_LICENCE_URL} target="_blank" rel="noopener noreferrer">
        Singapore Open Data Licence version 1.0
      </a>
      . Maps: OneMap © contributors, Singapore Land Authority.
    </p>
  );
}
