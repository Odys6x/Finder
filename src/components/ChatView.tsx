"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatEvent, ProfileUpdate, SchoolCard, Source } from "@/lib/chat/tools";
import { refreshMe, useMe } from "@/lib/client/me";
import { useSchoolIndex } from "@/lib/client/school-index";
import { useProfile } from "@/lib/client/store";
import { formatKm } from "@/lib/geo";
import { title } from "@/lib/vocab";
import { Paywall } from "./Paywall";
import { RichText } from "./RichText";

interface Msg {
  role: "user" | "assistant";
  content: string;
  schools?: SchoolCard[];
  sources?: Source[];
  action?: ProfileUpdate;
  status?: string;
  error?: string;
  applied?: boolean;
}

const STORE = "sp.chat.v1";
const STARTERS = [
  "Show me co-ed schools near Tampines with basketball",
  "Which schools near home have a Music Elective Programme?",
  "How do COPs and posting groups work?",
  "What should I consider when ordering my 6 choices?",
];

export function ChatView() {
  const params = useSearchParams();
  const [profile, setProfile] = useProfile();
  const me = useMe();
  const { data: idx } = useSchoolIndex();
  // Rendered client-only (see ChatClient), so reading localStorage in the initializer is safe.
  const [msgs, setMsgs] = useState<Msg[]>(loadSaved);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [remainingOverride, setRemaining] = useState<number | null>(null);
  const [limitedOverride, setLimited] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const remaining = remainingOverride ?? me?.chatRemaining ?? null;
  const limited = limitedOverride || me?.chatRemaining === 0;

  const names = useMemo(() => new Map((idx?.index ?? []).map((s) => [s.c, s.n])), [idx]);
  const schoolParam = params.get("school");

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  const starters = schoolParam && names.get(schoolParam)
    ? [`Tell me about ${names.get(schoolParam)} — CCAs and programmes`, ...STARTERS.slice(0, 2)]
    : STARTERS;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...msgs, { role: "user" as const, content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const patch = (fn: (m: Msg) => Msg) =>
      setMsgs((all) => {
        const copy = [...all];
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
          profile,
        }),
      });
      if (res.status === 402) {
        setLimited(true);
        setRemaining(0);
        setMsgs(history.slice(0, -1));
        setInput(q);
        return;
      }
      if (!res.ok || !res.body) throw new Error("bad response");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "text") patch((m) => ({ ...m, content: m.content + e.delta, status: undefined }));
          else if (e.type === "replace") patch((m) => ({ ...m, content: e.text }));
          else if (e.type === "status") patch((m) => ({ ...m, status: e.message }));
          else if (e.type === "schools") patch((m) => ({ ...m, schools: mergeCards(m.schools, e.items) }));
          else if (e.type === "sources") patch((m) => ({ ...m, sources: e.items }));
          else if (e.type === "action") patch((m) => ({ ...m, action: e.update }));
          else if (e.type === "limit") setRemaining(e.remaining);
          else if (e.type === "error") patch((m) => ({ ...m, error: e.message }));
        }
      }
    } catch {
      patch((m) => ({ ...m, error: "Connection problem. Please try again." }));
    } finally {
      patch((m) => ({ ...m, status: undefined }));
      setBusy(false);
      refreshMe();
    }
  }

  function applyAction(i: number, u: ProfileUpdate) {
    setProfile((p) => ({
      ...p,
      ...(u.naturePref ? { naturePref: u.naturePref } : {}),
      ...(u.maxKm ? { maxKm: u.maxKm } : {}),
      ...(u.sapPref ? { sapPref: u.sapPref } : {}),
      ...(u.track ? { track: u.track } : {}),
      ...(u.motherTongue !== undefined ? { motherTongue: u.motherTongue } : {}),
      interestCcas: [...new Set([...p.interestCcas, ...(u.addInterestCcas ?? [])])],
      interestProgrammes: [...new Set([...p.interestProgrammes, ...(u.addInterestProgrammes ?? [])])],
    }));
    setMsgs((all) => all.map((m, j) => (j === i ? { ...m, applied: true } : m)));
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ask about schools</h1>
          <p className="text-sm text-muted">Answers come only from our school data and an S1 posting FAQ, with sources.</p>
        </div>
        {msgs.length > 0 && (
          <button className="text-sm text-muted underline" onClick={() => setMsgs([])}>
            Clear chat
          </button>
        )}
      </header>

      {me?.aiMode === "mock" && (
        <p className="rounded-xl bg-border-soft px-3 py-2 text-xs text-border">
          Offline demo mode — set ANTHROPIC_API_KEY or GROQ_API_KEY (or LLM_PROVIDER=bedrock) on the server for the full assistant.
        </p>
      )}

      <div className="space-y-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="card space-y-2">
            <p className="text-sm font-medium">Try asking:</p>
            <div className="flex flex-col items-start gap-2">
              {starters.map((s) => (
                <button key={s} className="chip min-h-10 text-left text-sm" onClick={() => send(s)} disabled={limited}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="card max-w-[95%] space-y-3 text-sm leading-relaxed">
              {m.status && !m.content && <p className="animate-pulse text-muted">{m.status}</p>}
              {!m.status && !m.content && !m.error && busy && i === msgs.length - 1 && <p className="animate-pulse text-muted">Thinking…</p>}
              {m.content && <RichText text={m.content} names={names} />}
              {m.schools && m.schools.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {m.schools.map((s) => (
                    <li key={s.code}>
                      <Link href={`/schools/${s.code}`} className="block rounded-xl border border-line p-2.5 hover:border-brand">
                        <span className="block font-semibold">{s.name}</span>
                        <span className="text-xs text-muted">
                          {[title(s.zone), s.nature === "CO-ED" ? "Co-ed" : title(s.nature), s.distanceKm !== null && formatKm(s.distanceKm)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {s.matched.length > 0 && <span className="block text-xs text-brand">{s.matched.map(title).join(", ")}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {m.action && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-soft p-2.5">
                  <span className="text-xs text-brand-dark">Save to your profile: {describeUpdate(m.action)}</span>
                  <button className="btn-primary min-h-9 text-xs" disabled={m.applied} onClick={() => applyAction(i, m.action!)}>
                    {m.applied ? "Saved ✓" : "Apply"}
                  </button>
                </div>
              )}
              {m.error && <p className="text-reach">{m.error}</p>}
              {m.sources && m.sources.length > 0 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">Sources ({m.sources.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {m.sources.map((s) => (
                      <li key={s.kind + s.id}>
                        <Link className="underline" href={s.href}>
                          {s.kind === "faq" ? `FAQ: ${s.label}` : s.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {limited ? (
        <Paywall headline="You've used your free questions.">
          Unlimited questions come with the Season Pass, along with your full match list.
        </Paywall>
      ) : (
        <form
          className="no-print sticky bottom-20 z-20 flex gap-2 rounded-2xl border border-line bg-white p-2 shadow-lg md:bottom-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Your question
          </label>
          <input
            id="chat-input"
            className="input border-0"
            placeholder="Ask about CCAs, programmes, posting…"
            value={input}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
          />
          <button className="btn-primary shrink-0" disabled={busy || !input.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      )}
      {remaining !== null && !limited && (
        <p className="-mt-2 text-center text-xs text-muted">
          {remaining} free question{remaining === 1 ? "" : "s"} left
        </p>
      )}
      <p className="text-center text-xs text-muted">
        AI can make mistakes. It won&apos;t predict admission. Check COPs and details on MOE SchoolFinder.
      </p>
    </div>
  );
}

function loadSaved(): Msg[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "[]") as Msg[];
    return Array.isArray(saved) ? saved.slice(-30).filter((m) => m.content) : [];
  } catch {
    return [];
  }
}

function mergeCards(a: SchoolCard[] | undefined, b: SchoolCard[]) {
  const map = new Map((a ?? []).map((s) => [s.code, s]));
  for (const s of b) map.set(s.code, s);
  return [...map.values()].slice(0, 10);
}

function describeUpdate(u: ProfileUpdate) {
  const parts: string[] = [];
  if (u.naturePref) parts.push(u.naturePref === "co-ed" ? "co-ed only" : u.naturePref === "single-sex" ? "single-sex only" : "any school type");
  if (u.maxKm) parts.push(`within ${u.maxKm} km`);
  if (u.sapPref && u.sapPref !== "any") parts.push(u.sapPref === "prefer" ? "prefer SAP" : "not SAP");
  if (u.track && u.track !== "any") parts.push(u.track === "ip" ? "Integrated Programme" : "O-Level track");
  if (u.motherTongue) parts.push(`${title(u.motherTongue)} mother tongue`);
  if (u.addInterestCcas?.length) parts.push(u.addInterestCcas.join(", "));
  if (u.addInterestProgrammes?.length) parts.push(u.addInterestProgrammes.join(", "));
  return parts.join(" · ") || "preferences";
}
