"use client";
import { useCallback, useEffect, useState } from "react";
import { COP_CSV_HEADERS, SCHOOLFINDER_CSV_HEADERS, type Issue } from "@/lib/csv-import";

interface Status {
  schoolCount: number;
  withCoords: number;
  withSchoolFinderUrl: number;
  withAffiliations: number;
  withBlurb: number;
  copYear: number;
  copStats: { year: number; count: number }[];
  copSourcePermitted: boolean;
  dataGovAsOf: string | null;
  log: { id: number; kind: string; status: string; message: string; started_at: string; finished_at: string | null }[];
}

interface ImportResult {
  committed: boolean;
  rowCount: number;
  errors: Issue[];
  warnings: Issue[];
  preview: Record<string, unknown>[];
}

export function AdminDashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const load = useCallback(() => fetch("/api/admin/status").then((r) => r.json()).then(setStatus), []);
  useEffect(() => {
    load();
  }, [load]);
  const running = status?.log.some((l) => l.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  if (!status) return <div className="card h-64 animate-pulse" />;
  const thisYear = status.copStats.find((c) => c.year === status.copYear)?.count ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>

      <section className="card grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Schools" value={status.schoolCount} />
        <Stat label="Geocoded" value={`${status.withCoords}/${status.schoolCount}`} />
        <Stat label={`COPs for ${status.copYear}`} value={thisYear} />
        <Stat label="COP display" value={status.copSourcePermitted ? "ON" : "OFF (flag)"} />
        <Stat label="SchoolFinder URLs" value={status.withSchoolFinderUrl} />
        <Stat label="Affiliations" value={status.withAffiliations} />
        <Stat label="Blurbs" value={status.withBlurb} />
        <Stat label="data.gov.sg as of" value={status.dataGovAsOf ? new Date(status.dataGovAsOf).toLocaleDateString("en-SG") : "—"} />
      </section>

      <RefreshCard running={!!running} onStarted={load} />
      <CopYearCard current={status.copYear} onSaved={load} />
      <ImportCard onCommitted={load} />

      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Yearly checklist (late December)</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Wait for MOE to publish S1 posting results and the new COPs (mid/late Dec).</li>
          <li>Run &quot;Refresh data.gov.sg&quot; to pick up school changes (mergers, new CCAs).</li>
          <li>Enter the new COPs into the COP CSV template with the new cop_year and validate.</li>
          <li>Commit the import, then bump the COP year below (e.g. 2025 → 2026).</li>
          <li>Update SchoolFinder fields (affiliations, DSA areas, electives, URLs) if they changed.</li>
          <li>
            Keep <code>COP_SOURCE_PERMITTED=false</code> unless MOE has given written permission.
          </li>
        </ol>
      </section>

      <section className="card text-sm">
        <h2 className="mb-2 font-semibold">Recent jobs</h2>
        <ul className="space-y-1">
          {status.log.map((l) => (
            <li key={l.id} className="flex gap-2">
              <span className={l.status === "ok" ? "text-safe" : l.status === "error" ? "text-reach" : "text-border"}>●</span>
              <span className="text-muted">{new Date(l.started_at).toLocaleString("en-SG")}</span>
              <span className="font-medium">{l.kind}</span>
              <span className="min-w-0 flex-1 break-words">{l.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function RefreshCard({ running, onStarted }: { running: boolean; onStarted: () => void }) {
  const [msg, setMsg] = useState("");
  return (
    <section className="card space-y-2 text-sm">
      <h2 className="font-semibold">Refresh data.gov.sg</h2>
      <p className="text-muted">
        Pulls the 5 MOE datasets (rate-limited, ~1–3 min) and geocodes new postal codes. SchoolFinder fields and blurbs are
        kept.
      </p>
      <button
        className="btn-primary"
        disabled={running}
        onClick={async () => {
          const r = await fetch("/api/admin/refresh", { method: "POST" });
          const b = await r.json();
          setMsg(r.ok ? "Started." : b.error);
          onStarted();
        }}
      >
        {running ? "Refreshing…" : "Refresh now"}
      </button>
      {msg && <p className="text-muted">{msg}</p>}
    </section>
  );
}

function CopYearCard({ current, onSaved }: { current: number; onSaved: () => void }) {
  const [year, setYear] = useState(String(current));
  return (
    <section className="card space-y-2 text-sm">
      <h2 className="font-semibold">Current COP year</h2>
      <p className="text-muted">The COP year used for banding and shown to parents (previous year&apos;s posting).</p>
      <div className="flex gap-2">
        <input className="input max-w-32" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
        <button
          className="btn-ghost"
          onClick={async () => {
            await fetch("/api/admin/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cop_year: Number(year) }),
            });
            onSaved();
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}

function ImportCard({ onCommitted }: { onCommitted: () => void }) {
  const [kind, setKind] = useState<"cops" | "schoolfinder">("cops");
  const [csv, setCsv] = useState("");
  const [res, setRes] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const headers = kind === "cops" ? COP_CSV_HEADERS : SCHOOLFINDER_CSV_HEADERS;

  async function run(commit: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, csv, commit }),
      });
      const b = await r.json();
      setRes(b);
      if (b.committed) onCommitted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 text-sm">
      <h2 className="font-semibold">CSV import</h2>
      <div className="flex gap-2">
        {(["cops", "schoolfinder"] as const).map((k) => (
          <button key={k} className={kind === k ? "chip-on" : "chip"} onClick={() => (setKind(k), setRes(null))}>
            {k === "cops" ? "COPs" : "SchoolFinder fields"}
          </button>
        ))}
      </div>
      <p className="text-muted">
        Columns: <code className="break-all">{headers.join(",")}</code>.{" "}
        {kind === "cops"
          ? 'Use school_code or school_name. Scores 4–30; "8-12" ranges take the upper value; PG1 "30*" sets the vacancy flag; blank = none.'
          : "Lists are separated by semicolons. Only columns present are updated. Write blurbs in our own words."}
      </p>
      <a
        className="text-brand underline"
        download={`${kind}-template.csv`}
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(headers.join(",") + "\n")}`}
      >
        Download template
      </a>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setCsv(await f.text());
          setRes(null);
        }}
      />
      <textarea className="input min-h-40 py-2 font-mono text-xs" value={csv} onChange={(e) => (setCsv(e.target.value), setRes(null))} placeholder="…or paste CSV here" />
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={!csv || busy} onClick={() => run(false)}>
          Validate
        </button>
        <button className="btn-primary" disabled={!csv || busy || !res || res.errors.length > 0 || res.committed} onClick={() => run(true)}>
          Commit {res && !res.errors.length ? `${res.rowCount} rows` : ""}
        </button>
      </div>
      {res && (
        <div className="space-y-2">
          {res.committed && <p className="font-semibold text-safe">Imported {res.rowCount} rows ✓</p>}
          <p>
            {res.rowCount} valid rows · <span className="text-reach">{res.errors.length} errors</span> ·{" "}
            <span className="text-border">{res.warnings.length} warnings</span>
          </p>
          {res.errors.length > 0 && <IssueList issues={res.errors} cls="text-reach" />}
          {res.warnings.length > 0 && <IssueList issues={res.warnings} cls="text-border" />}
          {res.preview.length > 0 && (
            <details>
              <summary className="cursor-pointer">Preview</summary>
              <pre className="mt-1 max-h-64 overflow-auto rounded-xl bg-paper p-2 text-xs">{JSON.stringify(res.preview, null, 1)}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function IssueList({ issues, cls }: { issues: Issue[]; cls: string }) {
  return (
    <ul className={`max-h-48 space-y-0.5 overflow-auto text-xs ${cls}`}>
      {issues.slice(0, 200).map((i, k) => (
        <li key={k}>
          Row {i.row}
          {i.field ? ` · ${i.field}` : ""}: {i.message}
        </li>
      ))}
    </ul>
  );
}
