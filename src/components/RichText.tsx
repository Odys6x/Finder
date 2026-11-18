"use client";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe renderer for assistant text: paragraphs, "- " bullets, **bold**, _italic_,
 * bare https links and [[code]] / [[faq:id]] citations. Builds React nodes — never innerHTML.
 */
const BULLET = /^\s*([-*•]|\d+\.)\s+/;

export function RichText({ text, names }: { text: string; names: Map<string, string> }) {
  // Group lines into runs: consecutive bullet lines form a list, other lines form paragraphs.
  const runs: { list: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      runs.push({ list: false, lines: [] });
      continue;
    }
    const list = BULLET.test(line);
    const last = runs[runs.length - 1];
    if (last && last.list === list && last.lines.length) last.lines.push(line);
    else runs.push({ list, lines: [line] });
  }
  return (
    <div className="space-y-2">
      {runs
        .filter((r) => r.lines.length)
        .map((r, i) =>
          r.list ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {r.lines.map((l, j) => (
                <li key={j}>{inline(l.replace(BULLET, ""), names)}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>
              {r.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(l, names)}
                </Fragment>
              ))}
            </p>
          ),
        )}
    </div>
  );
}

function inline(s: string, names: Map<string, string>): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[\[(faq:)?([a-z0-9-]+)\]\]|\*\*(.+?)\*\*|(?<![\w])_(.+?)_(?![\w])|(https:\/\/[^\s)]+)/g;
  let last = 0;
  let k = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push(s.slice(last, m.index));
    if (m[2]) {
      if (m[1]) {
        out.push(
          <Link key={k++} href={`/about-data#faq-${m[2]}`} className="mx-0.5 rounded bg-paper px-1 text-[11px] font-medium text-muted no-underline">
            FAQ
          </Link>,
        );
      } else {
        out.push(
          <Link key={k++} href={`/schools/${m[2]}`} title={names.get(m[2]) ?? m[2]} className="mx-0.5 rounded bg-brand-soft px-1 text-[11px] font-medium text-brand-dark">
            {shortName(names.get(m[2]) ?? "source")}
          </Link>,
        );
      }
    } else if (m[3]) out.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4]) out.push(<em key={k++}>{m[4]}</em>);
    else if (m[5])
      out.push(
        <a key={k++} href={m[5]} target="_blank" rel="noopener noreferrer" className="text-brand underline">
          {m[5].replace(/^https:\/\/(www\.)?/, "")}
        </a>,
      );
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function shortName(n: string) {
  return n.replace(/ (Secondary )?School$/i, "").replace(/ Secondary$/i, "");
}
