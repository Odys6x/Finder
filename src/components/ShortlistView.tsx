"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { bandFor, DEFAULT_THRESHOLDS } from "@/lib/banding";
import { useMe } from "@/lib/client/me";
import { useSchoolIndex } from "@/lib/client/school-index";
import { useProfile, useShortlist } from "@/lib/client/store";
import { DISCLAIMER } from "@/lib/config-public";
import { formatKm, haversineKm } from "@/lib/geo";
import type { Cop } from "@/lib/types";
import { title } from "@/lib/vocab";
import { BandBadge } from "./BandBadge";
import { Paywall } from "./Paywall";

interface CompareSchool {
  code: string;
  name: string;
  type: string;
  nature: string;
  zone: string;
  lat: number | null;
  lng: number | null;
  mrt: string;
  sap: boolean;
  ip: boolean;
  mother_tongues: string[];
  ccas: string[];
  subjects: string[];
  programmes: string[];
  alp: { domain: string; title: string } | null;
  llp: { domain: string; title: string } | null;
  electives: string[];
  cop: Cop | null;
  schoolfinderUrl: string;
}

export function ShortlistView() {
  const [list, setList] = useShortlist();
  const [profile] = useProfile();
  const { data } = useSchoolIndex();
  const me = useMe();
  const paid = !!me?.pass;
  const [compare, setCompare] = useState<CompareSchool[] | null>(null);
  const [busy, setBusy] = useState<string>("");
  const exportRef = useRef<HTMLDivElement>(null);

  const byCode = new Map((data?.index ?? []).map((s) => [s.c, s]));
  const items = list.map((c) => byCode.get(c)).filter((s) => s !== undefined);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  async function loadCompare() {
    setBusy("compare");
    try {
      const r = await fetch(`/api/schools/compare?codes=${list.join(",")}`);
      if (r.ok) setCompare((await r.json()).schools);
    } finally {
      setBusy("");
    }
  }

  async function exportImage(share: boolean) {
    if (!exportRef.current) return;
    setBusy(share ? "share" : "image");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(exportRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.exportIgnore !== undefined),
      });
      if (!blob) return;
      const file = new File([blob], "schoolpath-shortlist.png", { type: "image/png" });
      if (share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Our secondary school shortlist" }).catch(() => {});
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } finally {
      setBusy("");
    }
  }

  const bandOf = (code: string) => {
    const u = profile.userCops[code];
    if (!u || !profile.psleScore || !profile.postingGroup) return null;
    if (u.vacancy && profile.postingGroup === 1) return "safe" as const;
    return bandFor(profile.psleScore, u.value, DEFAULT_THRESHOLDS);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Shortlist</h1>
        <p className="text-sm text-muted">
          Up to 10 schools. Order them by real preference — choices are considered in the order you list them.
        </p>
      </header>

      {list.length === 0 ? (
        <div className="card space-y-3 text-sm">
          <p>No schools saved yet. Tap ☆ Save on any school.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/match" className="btn-primary">
              See my matches
            </Link>
            <Link href="/schools" className="btn-ghost">
              Browse schools
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div ref={exportRef} className="space-y-2 bg-paper">
            <ol className="space-y-2">
              {items.map((s, i) => (
                <li key={s.c} className="card flex items-center gap-3 py-2.5">
                  <span className="w-6 text-center text-lg font-bold text-brand">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/schools/${s.c}`} className="line-clamp-2 block font-semibold leading-snug hover:text-brand">
                      {s.n}
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{title(s.z)}</span>
                      <span>{s.na === "CO-ED" ? "Co-ed" : title(s.na)}</span>
                      {profile.home && s.lat !== null && s.lng !== null && <span>{formatKm(haversineKm(profile.home, { lat: s.lat, lng: s.lng }))}</span>}
                      {bandOf(s.c) && <BandBadge band={bandOf(s.c)} />}
                    </p>
                  </div>
                  <div className="no-print flex shrink-0 items-center gap-1" data-export-ignore>
                    <button className="chip min-h-9 px-2.5" aria-label={`Move ${s.n} up`} onClick={() => move(i, -1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button className="chip min-h-9 px-2.5" aria-label={`Move ${s.n} down`} onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                      ↓
                    </button>
                    <button className="chip min-h-9 px-2.5 text-reach" aria-label={`Remove ${s.n}`} onClick={() => setList(list.filter((c) => c !== s.c))}>
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <p className="px-1 text-[11px] text-muted">Made with SchoolPath Finder · {DISCLAIMER}</p>
          </div>

          {paid ? (
            <div className="no-print flex flex-wrap gap-2">
              <button className="btn-primary" onClick={loadCompare} disabled={busy !== "" || list.length < 2}>
                {busy === "compare" ? "Loading…" : "Compare side by side"}
              </button>
              <button className="btn-ghost" onClick={() => exportImage(true)} disabled={busy !== ""}>
                Share image
              </button>
              <button className="btn-ghost" onClick={() => exportImage(false)} disabled={busy !== ""}>
                Download image
              </button>
              <button className="btn-ghost" onClick={() => window.print()}>
                Save as PDF
              </button>
            </div>
          ) : (
            list.length > 0 && (
              <Paywall headline="Compare these schools side by side and share the list with family.">
                Export as an image or PDF for the family chat.
              </Paywall>
            )
          )}

          {compare && <CompareTable schools={compare} home={profile.home} />}
        </>
      )}
    </div>
  );
}

function CompareTable({ schools, home }: { schools: CompareSchool[]; home: { lat: number; lng: number } | null }) {
  const rows: [string, (s: CompareSchool) => React.ReactNode][] = [
    ["Type", (s) => `${s.type}${s.sap ? " · SAP" : ""}${s.ip ? " · IP" : ""}`],
    ["Co-ed / single-sex", (s) => (s.nature === "CO-ED" ? "Co-ed" : title(s.nature))],
    ["Distance", (s) => (home && s.lat !== null && s.lng !== null ? formatKm(haversineKm(home, { lat: s.lat, lng: s.lng })) : "—")],
    ["MRT", (s) => title(s.mrt) || "—"],
    ["ALP", (s) => s.alp?.domain ?? "—"],
    ["LLP", (s) => s.llp?.domain ?? "—"],
    ["MOE programmes", (s) => s.programmes.map(title).join(", ") || "—"],
    ["Mother tongues", (s) => s.mother_tongues.map(title).join(", ")],
    ["CCAs", (s) => `${s.ccas.length}: ${s.ccas.slice(0, 12).map(title).join(", ")}${s.ccas.length > 12 ? "…" : ""}`],
    ["Subjects", (s) => `${s.subjects.length} offered`],
    [
      "COP",
      (s) =>
        s.cop ? (
          `PG3 ${s.cop.pg3 ?? "—"} · PG2 ${s.cop.pg2 ?? "—"} · PG1 ${s.cop.pg1 ?? "—"}${s.cop.pg1_has_vacancy ? "*" : ""}`
        ) : (
          <a className="text-brand underline" href={s.schoolfinderUrl} target="_blank" rel="noopener noreferrer">
            Check SchoolFinder
          </a>
        ),
    ],
  ];
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 bg-white p-3 text-xs font-semibold text-muted">&nbsp;</th>
            {schools.map((s) => (
              <th key={s.code} className="p-3 align-bottom font-semibold">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label} className="border-b border-line last:border-0">
              <th className="sticky left-0 bg-white p-3 align-top text-xs font-semibold text-muted">{label}</th>
              {schools.map((s) => (
                <td key={s.code} className="p-3 align-top">
                  {fn(s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
