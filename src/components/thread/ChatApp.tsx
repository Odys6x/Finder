"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProfileUpdate, SchoolCard, Source } from "@/lib/chat/tools";
import { streamChat } from "@/lib/client/chat-stream";
import { refreshMe, useMe } from "@/lib/client/me";
import { useSchoolIndex } from "@/lib/client/school-index";
import { clearAllLocalData, useProfile, useShortlist } from "@/lib/client/store";
import { formatKm } from "@/lib/geo";
import { INTEREST_GROUPS, interestsFromGroups, nextStep, parsePostalInput, parseScoreInput, type Step } from "@/lib/guided";
import { likelyPostingGroups } from "@/lib/banding";
import type { MatchItem } from "@/lib/matching";
import { EMPTY_PROFILE, type Band, type PostingGroup, type Profile } from "@/lib/types";
import { title } from "@/lib/vocab";
import { AppHeader } from "../AppHeader";
import { BAND_COLOR } from "../BandBadge";
import { Logo } from "../Logo";
import { RichText } from "../RichText";
import { Sheet } from "../Sheet";
import { SaveStar, SchoolCardView, shortName, UnlockCard } from "./SchoolCards";

const SchoolMap = dynamic(() => import("../SchoolMap"), {
  ssr: false,
  loading: () => <div className="h-[60dvh] animate-pulse rounded-2xl bg-paper" />,
});

/* ------------------------------------------------------------------ types */

interface MatchData {
  paid: boolean;
  copYear: number;
  counts: Record<Band | "unbanded", number>;
  total: number;
  bandingAvailable: boolean;
  items: MatchItem[];
  lockedCount: number;
  suggestion: { codes: string[]; notes: string[] } | null;
  commutePending: number;
}

type Msg = { id: string } & (
  | { kind: "bot"; text: string }
  | { kind: "user"; text: string }
  | { kind: "ask"; step: Step }
  | { kind: "results"; data: MatchData | null; failed?: boolean }
  | { kind: "suggest"; items: string[] }
  | {
      kind: "ai";
      text: string;
      schools?: SchoolCard[];
      sources?: Source[];
      action?: ProfileUpdate;
      applied?: boolean;
      status?: string;
      error?: string;
    }
  | { kind: "limit" }
);

interface Thread {
  msgs: Msg[];
  answered: Step[];
}

const STORE = "sp.thread.v1";
let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

function loadThread(): Thread | null {
  try {
    const t = JSON.parse(localStorage.getItem(STORE) ?? "null") as Thread | null;
    return t && Array.isArray(t.msgs) ? t : null;
  } catch {
    return null;
  }
}

const GREETING = "Hi! I'm your SchoolPath guide 👋 Answer a few quick questions and I'll shortlist secondary schools that fit your child. Your answers stay on this phone.";

const ASK_TEXT: Record<Step, (p: Profile) => string> = {
  score: () => "What's your child's PSLE score? Just type it below (4 is the best, 30 the highest).",
  pg: (p) => {
    const g = likelyPostingGroups(p.psleScore ?? 0);
    return `A score of ${p.psleScore} can be in ${g.map((x) => `PG${x}`).join(" or ")}. Which posting group is on the results slip?`;
  },
  home: () => "What's your home postal code? I'll use it for travel times. You can skip this.",
  sex: () => "Is your child a boy or a girl? I only use this to hide schools they can't attend.",
  interests: (p) => `What does ${p.childSex === "M" ? "he" : p.childSex === "F" ? "she" : "your child"} enjoy? Pick as many as you like.`,
  travel: () => "How long a journey to school is OK, each way?",
  results: () => "Here's what fits best 👇",
};

/* --------------------------------------------------------------- component */

export function ChatApp() {
  const [profile, setProfile] = useProfile();
  const [shortlist] = useShortlist();
  const me = useMe();
  const { data: idx } = useSchoolIndex();
  const [thread, setThread] = useState<Thread>(() => loadThread() ?? freshThread(profile));
  // "Ask AI about this school" links here as /?ask=<code>: pre-fill the question.
  const [askCode] = useState(() => new URLSearchParams(window.location.search).get("ask"));
  const [input, setInput] = useState("");
  const prefilled = useRef(false);
  useEffect(() => {
    if (!askCode || prefilled.current || !idx) return;
    const name = idx.index.find((s) => s.c === askCode)?.n;
    if (!name) return;
    prefilled.current = true;
    window.history.replaceState(null, "", "/");
    setTimeout(() => {
      setInput(`Tell me about ${name}: CCAs, programmes and how to get there`);
      inputRef.current?.focus();
    }, 0);
  }, [askCode, idx]);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | "shortlist" | { map: MatchItem[] }>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Latest profile for event handlers. Handlers that change it also update the ref directly,
  // so quick consecutive taps never read a stale value.
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const saveProfile = useCallback(
    (p: Profile) => {
      profileRef.current = p;
      setProfile(p);
    },
    [setProfile],
  );

  const names = useMemo(() => new Map((idx?.index ?? []).map((s) => [s.c, s.n])), [idx]);
  const coords = useMemo(() => new Map((idx?.index ?? []).map((s) => [s.c, s])), [idx]);
  const { msgs, answered } = thread;
  const pending = [...msgs].reverse().find((m) => m.kind === "ask" && !answered.includes(m.step)) as
    | Extract<Msg, { kind: "ask" }>
    | undefined;

  useEffect(() => {
    try {
      // Keep the thread light: drop bulky result lists beyond what the cards show.
      const slim = { ...thread, msgs: thread.msgs.slice(-60) };
      localStorage.setItem(STORE, JSON.stringify(slim));
    } catch {
      /* storage full / private mode */
    }
  }, [thread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  const push = useCallback((...m: Msg[]) => setThread((t) => ({ ...t, msgs: [...t.msgs, ...m] })), []);
  const patchMsg = useCallback(
    (id: string, fn: (m: Msg) => Msg) => setThread((t) => ({ ...t, msgs: t.msgs.map((m) => (m.id === id ? fn(m) : m)) })),
    [],
  );

  /* ---------------------------------------------------------- matching */

  const runResults = useCallback(
    async (p: Profile, intro?: string) => {
      const id = uid();
      push(
        { id: uid(), kind: "bot", text: intro ?? ASK_TEXT.results(p) },
        { id, kind: "results", data: null },
      );
      let tries = 0;
      const load = async () => {
        try {
          const r = await fetch("/api/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: p }),
          });
          const d = (await r.json()) as MatchData;
          // Keep only what the thread shows; "See all" re-fetches the full list.
          const slim = { ...d, items: d.items.slice(0, 12) };
          patchMsg(id, (m) => ({ ...m, data: slim }) as Msg);
          if (d.commutePending > 0 && tries++ < 4) setTimeout(load, 3000);
        } catch {
          patchMsg(id, (m) => ({ ...m, failed: true }) as Msg);
        }
      };
      await load();
      push({
        id: uid(),
        kind: "suggest",
        items: ["How should I order my 6 choices?", "Explain Safe / Borderline / Reach", "Which schools near me have Robotics?"],
      });
    },
    [push, patchMsg],
  );

  /* ------------------------------------------------------- guided steps */

  const advance = useCallback(
    (p: Profile, done: Step[], userText: string | null) => {
      const step = nextStep(p, done);
      setThread((t) => ({
        answered: done,
        msgs: [
          ...t.msgs,
          ...(userText ? [{ id: uid(), kind: "user" as const, text: userText }] : []),
          ...(step === "results" ? [] : [{ id: uid(), kind: "bot" as const, text: ASK_TEXT[step](p) }, { id: uid(), kind: "ask" as const, step }]),
        ],
      }));
      if (step === "results") void runResults(p);
    },
    [runResults],
  );

  const answer = useCallback(
    (step: Step, patch: Partial<Profile>, userText: string) => {
      const p = { ...profileRef.current, ...patch };
      saveProfile(p);
      advance(p, [...answered.filter((s) => s !== step), step], userText);
    },
    [advance, answered, saveProfile],
  );

  async function answerHome(postal: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/geocode?q=${postal}`);
      const b = await r.json();
      if (b.result) answer("home", { homePostal: postal, home: b.result }, postal);
      else push({ id: uid(), kind: "user", text: postal }, { id: uid(), kind: "bot", text: "Hmm, I couldn't find that postal code. Could you check it? Or tap Skip." });
    } catch {
      push({ id: uid(), kind: "bot", text: "I couldn't look that up just now. Try again, or tap Skip." });
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------- AI */

  async function askAI(text: string) {
    const id = uid();
    push({ id: uid(), kind: "user", text }, { id, kind: "ai", text: "" });
    setBusy(true);
    const history = [...msgs, { kind: "user", text } as Msg]
      .filter((m) => (m.kind === "user" || m.kind === "ai") && (m as { text: string }).text)
      .map((m) => ({ role: m.kind === "user" ? ("user" as const) : ("assistant" as const), content: (m as { text: string }).text }));
    const result = await streamChat(history, profileRef.current, (e) => {
      if (e.type === "text") patchMsg(id, (m) => ({ ...m, text: (m as { text: string }).text + e.delta, status: undefined }) as Msg);
      else if (e.type === "replace") patchMsg(id, (m) => ({ ...m, text: e.text }) as Msg);
      else if (e.type === "status") patchMsg(id, (m) => ({ ...m, status: e.message }) as Msg);
      else if (e.type === "schools") patchMsg(id, (m) => ({ ...m, schools: e.items }) as Msg);
      else if (e.type === "sources") patchMsg(id, (m) => ({ ...m, sources: e.items }) as Msg);
      else if (e.type === "action") patchMsg(id, (m) => ({ ...m, action: e.update }) as Msg);
      else if (e.type === "error") patchMsg(id, (m) => ({ ...m, error: e.message }) as Msg);
    });
    if (result === "limit") {
      setThread((t) => ({ ...t, msgs: [...t.msgs.filter((m) => m.id !== id), { id: uid(), kind: "limit" }] }));
    } else if (result === "error") {
      patchMsg(id, (m) => ({ ...m, error: "Connection problem. Please try again." }) as Msg);
    }
    patchMsg(id, (m) => ({ ...m, status: undefined }) as Msg);
    setBusy(false);
    refreshMe();
  }

  function applyAction(id: string, u: ProfileUpdate) {
    const p: Profile = {
      ...profileRef.current,
      ...(u.naturePref ? { naturePref: u.naturePref } : {}),
      ...(u.maxKm ? { maxKm: u.maxKm } : {}),
      ...(u.sapPref ? { sapPref: u.sapPref } : {}),
      ...(u.track ? { track: u.track } : {}),
      ...(u.motherTongue !== undefined ? { motherTongue: u.motherTongue } : {}),
      interestCcas: [...new Set([...profileRef.current.interestCcas, ...(u.addInterestCcas ?? [])])],
      interestProgrammes: [...new Set([...profileRef.current.interestProgrammes, ...(u.addInterestProgrammes ?? [])])],
    };
    saveProfile(p);
    patchMsg(id, (m) => ({ ...m, applied: true }) as Msg);
    void runResults(p, "Saved. Here are your updated matches 👇");
  }

  /* ----------------------------------------------------------- composer */

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (pending?.step === "score") {
      const n = parseScoreInput(text);
      if (n !== null) {
        const pgs = likelyPostingGroups(n);
        return answer("score", { psleScore: n, postingGroup: (pgs[0] ?? null) as PostingGroup | null }, text);
      }
    }
    if (pending?.step === "home") {
      const postal = parsePostalInput(text);
      if (postal) return answerHome(postal);
    }
    void askAI(text);
  }

  function startOver() {
    if (!confirm("Start over? This clears your answers, shortlist and chat on this phone.")) return;
    clearAllLocalData();
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* ignore */
    }
    saveProfile(EMPTY_PROFILE);
    setThread(freshThread(EMPTY_PROFILE));
  }

  const placeholder =
    pending?.step === "score" ? "Type the PSLE score, e.g. 12" : pending?.step === "home" ? "6-digit postal code" : "Ask anything about schools…";

  /* -------------------------------------------------------------- render */

  return (
    <>
      <AppHeader onShortlist={() => setSheet("shortlist")} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4">
        <div className="flex-1 space-y-3 pb-4" aria-live="polite">
          {msgs.length > 3 && (
            <div className="flex justify-center">
              <button className="text-xs font-medium text-muted underline" onClick={startOver}>
                ↺ Start over
              </button>
            </div>
          )}
          {msgs.map((m, i) => (
            <MessageView
              key={m.id}
              m={m}
              last={i === msgs.length - 1}
              busy={busy}
              pending={pending?.id === m.id}
              profile={profile}
              names={names}
              commuteEnabled={!!me?.commuteEnabled}
              onAnswer={answer}
              onAsk={askAI}
              onApply={applyAction}
              onMap={(items) => setSheet({ map: items })}
              onRefine={(patch, label) => {
                const p = { ...profileRef.current, ...patch };
                saveProfile(p);
                push({ id: uid(), kind: "user", text: label });
                void runResults(p, "Updated 👇");
              }}
              focusInput={() => inputRef.current?.focus()}
            />
          ))}
          <div ref={endRef} />
        </div>

        <div className="no-print sticky bottom-0 -mx-4 bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <form
            className="flex items-center gap-2 rounded-full border border-line bg-card p-1.5 pl-4 shadow-lg transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="composer" className="sr-only">
              Message
            </label>
            <input
              id="composer"
              ref={inputRef}
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted focus-visible:outline-none"
              placeholder={placeholder}
              inputMode={pending?.step === "score" || pending?.step === "home" ? "numeric" : "text"}
              autoComplete="off"
              maxLength={1000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition disabled:opacity-40"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
              </svg>
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] leading-snug text-muted">
            {me && me.chatRemaining !== null && `${me.chatRemaining} free AI question${me.chatRemaining === 1 ? "" : "s"} left · `}
            School data from data.gov.sg (Open Data Licence) ·{" "}
            <Link href="/about-data" className="underline">
              About
            </Link>
          </p>
        </div>
      </main>

      <Sheet open={sheet === "shortlist"} onClose={() => setSheet(null)} title={`Shortlist (${shortlist.length}/10)`}>
        <ShortlistPanel names={names} />
      </Sheet>
      <Sheet open={!!sheet && typeof sheet === "object"} onClose={() => setSheet(null)} title="On the map" tall>
        {sheet && typeof sheet === "object" && (
          <SchoolMap
            height={520}
            home={profile.home}
            points={sheet.map
              .map((it) => ({ it, c: coords.get(it.code) }))
              .filter(({ c }) => c && c.lat !== null && c.lng !== null)
              .map(({ it, c }) => ({
                code: it.code,
                name: shortName(it.name),
                lat: c!.lat!,
                lng: c!.lng!,
                color: it.band.band ? BAND_COLOR[it.band.band] : "#0f6e6a",
                sub: [it.band.band ? title(it.band.band) : "", it.commute ? `${it.commute.minutes} min` : it.distanceKm !== null ? formatKm(it.distanceKm) : ""]
                  .filter(Boolean)
                  .join(" · "),
              }))}
          />
        )}
      </Sheet>
    </>
  );
}

function freshThread(p: Profile): Thread {
  const ready = p.psleScore !== null && p.postingGroup !== null;
  if (ready) {
    // Returning from the old app or the profile page: skip straight to results.
    return {
      answered: ["score", "pg", "home", "sex", "interests", "travel"],
      msgs: [
        { id: uid(), kind: "bot", text: `Welcome back! I remember: score ${p.psleScore}, PG${p.postingGroup}${p.home ? `, near ${title(p.home.label)}` : ""}.` },
        { id: uid(), kind: "suggest", items: ["__results__"] },
      ],
    };
  }
  return {
    answered: [],
    msgs: [
      { id: uid(), kind: "bot", text: GREETING },
      { id: uid(), kind: "bot", text: ASK_TEXT.score(p) },
      { id: uid(), kind: "ask", step: "score" },
    ],
  };
}

/* ---------------------------------------------------------- message view */

interface ViewProps {
  m: Msg;
  last: boolean;
  busy: boolean;
  pending: boolean;
  profile: Profile;
  names: Map<string, string>;
  commuteEnabled: boolean;
  onAnswer: (step: Step, patch: Partial<Profile>, text: string) => void;
  onAsk: (text: string) => void;
  onApply: (id: string, u: ProfileUpdate) => void;
  onMap: (items: MatchItem[]) => void;
  onRefine: (patch: Partial<Profile>, label: string) => void;
  focusInput: () => void;
}

function BotRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex animate-rise items-start gap-2.5">
      <Logo className="mt-0.5 h-8 w-8 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function MessageView(props: ViewProps) {
  const { m } = props;
  switch (m.kind) {
    case "bot":
      return (
        <BotRow>
          <p className="inline-block max-w-[46ch] rounded-3xl rounded-tl-md bg-card px-4 py-2.5 text-[15px] leading-relaxed shadow-sm">{m.text}</p>
        </BotRow>
      );
    case "user":
      return (
        <div className="flex animate-rise justify-end">
          <p className="max-w-[80%] rounded-3xl rounded-br-md bg-brand px-4 py-2.5 text-[15px] text-white">{m.text}</p>
        </div>
      );
    case "ask":
      return props.pending ? <AskControls {...props} step={m.step} /> : null;
    case "results":
      return <ResultsView {...props} data={m.data} failed={m.failed} />;
    case "suggest":
      if (m.items[0] === "__results__")
        return props.last ? (
          <div className="flex flex-wrap gap-2 pl-[42px]">
            <button className="chip-on" onClick={() => props.onRefine({}, "Show my matches")}>
              Show my matches
            </button>
            <Link className="chip" href="/profile">
              Change answers
            </Link>
          </div>
        ) : null;
      return props.last ? (
        <div className="flex flex-col items-start gap-2 pl-[42px]">
          <p className="text-xs font-semibold text-muted">Ask me anything, e.g.</p>
          {m.items.map((s) => (
            <button key={s} className="chip text-left" disabled={props.busy} onClick={() => props.onAsk(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : null;
    case "ai":
      return <AiView {...props} m={m} />;
    case "limit":
      return (
        <BotRow>
          <div className="snap-row">
            <UnlockCard locked={0} headline="You've used your free questions" />
          </div>
        </BotRow>
      );
  }
}

function AskControls({ step, profile, onAnswer, commuteEnabled, focusInput }: ViewProps & { step: Step }) {
  const [picked, setPicked] = useState<string[]>([]);
  const row = "flex flex-wrap gap-2 pl-[42px] animate-rise";

  if (step === "score")
    return (
      <div className={row}>
        <button className="chip" onClick={focusInput}>
          ⌨️ Type score
        </button>
        <button className="chip" onClick={() => onAnswer("score", { psleScore: null, postingGroup: null }, "Results aren't out yet — just browsing")}>
          Not out yet — just browsing
        </button>
      </div>
    );
  if (step === "pg")
    return (
      <div className={row}>
        {likelyPostingGroups(profile.psleScore ?? 0).map((g) => (
          <button key={g} className="chip" onClick={() => onAnswer("pg", { postingGroup: g }, `PG${g}`)}>
            PG{g}
          </button>
        ))}
      </div>
    );
  if (step === "home")
    return (
      <div className={row}>
        <button className="chip" onClick={focusInput}>
          ⌨️ Type postal code
        </button>
        <button className="chip" onClick={() => onAnswer("home", { home: null, homePostal: "" }, "Skip")}>
          Skip
        </button>
      </div>
    );
  if (step === "sex")
    return (
      <div className={row}>
        <button className="chip" onClick={() => onAnswer("sex", { childSex: "M" }, "👦 Boy")}>
          👦 Boy
        </button>
        <button className="chip" onClick={() => onAnswer("sex", { childSex: "F" }, "👧 Girl")}>
          👧 Girl
        </button>
        <button className="chip" onClick={() => onAnswer("sex", { childSex: "" }, "Skip")}>
          Skip
        </button>
      </div>
    );
  if (step === "interests") {
    const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    const done = () => {
      const labels = INTEREST_GROUPS.filter((g) => picked.includes(g.id)).map((g) => `${g.emoji} ${g.label}`);
      onAnswer("interests", interestsFromGroups(picked), labels.length ? labels.join(", ") : "Nothing in particular");
    };
    return (
      <div className="animate-rise space-y-3 pl-[42px]">
        <div className="flex flex-wrap gap-2">
          {INTEREST_GROUPS.map((g) => (
            <button key={g.id} className={picked.includes(g.id) ? "chip-on" : "chip"} aria-pressed={picked.includes(g.id)} onClick={() => toggle(g.id)}>
              <span aria-hidden>{g.emoji}</span> {g.label}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={done}>
          {picked.length ? `Done (${picked.length}) →` : "Nothing in particular →"}
        </button>
      </div>
    );
  }
  if (step === "travel") {
    const opts: [string, Partial<Profile>][] = commuteEnabled
      ? [
          ["Up to 30 min", { maxMinutes: 30, maxKm: null }],
          ["Up to 45 min", { maxMinutes: 45, maxKm: null }],
          ["Up to 60 min", { maxMinutes: 60, maxKm: null }],
          ["Any", { maxMinutes: null, maxKm: null }],
        ]
      : [
          ["Within 3 km", { maxKm: 3, maxMinutes: null }],
          ["Within 5 km", { maxKm: 5, maxMinutes: null }],
          ["Within 8 km", { maxKm: 8, maxMinutes: null }],
          ["Any distance", { maxKm: null, maxMinutes: null }],
        ];
    return (
      <div className={row}>
        {opts.map(([label, patch]) => (
          <button key={label} className="chip" onClick={() => onAnswer("travel", patch, label)}>
            {label}
          </button>
        ))}
      </div>
    );
  }
  return null;
}

function ResultsView({ data, failed, onMap, onRefine, profile }: ViewProps & { data: MatchData | null; failed?: boolean }) {
  if (failed)
    return (
      <BotRow>
        <p className="rounded-3xl bg-card px-4 py-2.5 text-sm text-reach shadow-sm">Couldn&apos;t load matches. Please check your connection.</p>
      </BotRow>
    );
  if (!data)
    return (
      <div className="snap-row pl-[58px] scroll-pl-[58px]" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-60 w-[78vw] max-w-[290px] shrink-0 animate-pulse rounded-3xl bg-card" />
        ))}
      </div>
    );

  const c = data.counts;
  const byCode = new Map(data.items.map((i) => [i.code, i]));
  return (
    <div className="animate-rise space-y-3">
      <div className="pl-[42px]">
        <p className="text-sm text-muted">
          <strong className="text-ink">{data.total} schools</strong> fit
          {data.bandingAvailable ? ` · vs ${data.copYear} COPs:` : ", ranked by fit."}
        </p>
        {data.bandingAvailable ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded-full bg-safe-soft px-2.5 py-1 text-safe">{c.safe} safe</span>
            <span className="rounded-full bg-border-soft px-2.5 py-1 text-border">{c.borderline} borderline</span>
            <span className="rounded-full bg-reach-soft px-2.5 py-1 text-reach">{c.reach} reach</span>
          </div>
        ) : (
          profile.psleScore !== null && (
            <p className="mt-1 text-xs text-muted">Tip: open a school and enter its COP from SchoolFinder to see Safe / Borderline / Reach.</p>
          )
        )}
        {data.commutePending > 0 && <p className="mt-1 animate-pulse text-xs text-muted">Working out MRT/bus times…</p>}
      </div>

      {data.items.length === 0 ? (
        <p className="pl-[42px] text-sm">No schools match all your answers. Try widening the travel time below.</p>
      ) : (
        <div className="snap-row pl-[58px] scroll-pl-[58px]">
          {data.items.map((it) => (
            <SchoolCardView key={it.code} it={it} />
          ))}
          {data.lockedCount > 0 && <UnlockCard locked={data.lockedCount} />}
        </div>
      )}

      {data.suggestion && data.suggestion.codes.length > 0 && (
        <div className="ml-[42px] card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Your balanced 6</h3>
            <Link href="/shortlist" className="text-xs font-semibold text-brand">
              Compare →
            </Link>
          </div>
          <ol className="space-y-1.5">
            {data.suggestion.codes.map((code, i) => {
              const it = byCode.get(code);
              return (
                <li key={code} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-right font-bold text-muted">{i + 1}</span>
                  <Link href={`/schools/${code}`} className="min-w-0 flex-1 truncate font-medium">
                    {it ? shortName(it.name) : code}
                  </Link>
                  {it?.band.band && <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLOR[it.band.band] }} aria-label={it.band.band} />}
                  <SaveStar code={code} className="h-8 w-8 text-base" />
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted">Choices are considered in order — reorder to match your real preference.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pl-[42px]">
        {data.items.length > 0 && (
          <button className="chip" onClick={() => onMap(data.items)}>
            🗺️ Map
          </button>
        )}
        <Link className="chip" href="/match">
          📋 See all {data.total}
        </Link>
        {profile.naturePref !== "co-ed" && (
          <button className="chip" onClick={() => onRefine({ naturePref: "co-ed" }, "Only co-ed schools")}>
            Co-ed only
          </button>
        )}
        {profile.sapPref !== "prefer" && (
          <button className="chip" onClick={() => onRefine({ sapPref: "prefer" }, "Prefer SAP schools")}>
            Prefer SAP
          </button>
        )}
        {profile.track !== "ip" && (
          <button className="chip" onClick={() => onRefine({ track: "ip" }, "Interested in the IP")}>
            IP schools
          </button>
        )}
        {(profile.maxMinutes || profile.maxKm) && (
          <button className="chip" onClick={() => onRefine({ maxMinutes: null, maxKm: null }, "Any travel time")}>
            Widen travel
          </button>
        )}
        <Link className="chip" href="/profile">
          ✏️ Change answers
        </Link>
      </div>
    </div>
  );
}

function AiView({ m, names, onApply, busy, last }: ViewProps & { m: Extract<Msg, { kind: "ai" }> }) {
  return (
    <BotRow>
      <div className="space-y-2">
        <div className="inline-block max-w-full rounded-3xl rounded-tl-md bg-card px-4 py-2.5 text-[15px] leading-relaxed shadow-sm">
          {!m.text && !m.error && (
            <p className="flex items-center gap-2 text-muted">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              {m.status ?? (busy && last ? "Thinking…" : "")}
            </p>
          )}
          {m.text && <RichText text={m.text} names={names} />}
          {m.error && <p className="text-reach">{m.error}</p>}
        </div>
        {m.schools && m.schools.length > 0 && (
          <div className="snap-row">
            {m.schools.map((s) => (
              <Link
                key={s.code}
                href={`/schools/${s.code}`}
                className="card w-[62vw] max-w-[230px] shrink-0 snap-start space-y-1 p-3 hover:border-brand"
              >
                <span className="block font-bold leading-tight">{shortName(s.name)}</span>
                <span className="block text-xs text-muted">
                  {[title(s.zone), s.nature === "CO-ED" ? "Co-ed" : title(s.nature), s.distanceKm !== null && formatKm(s.distanceKm)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {s.matched.length > 0 && <span className="block text-xs font-medium text-brand">{s.matched.map(title).join(", ")}</span>}
              </Link>
            ))}
          </div>
        )}
        {m.action && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-brand-soft px-3 py-2">
            <span className="text-sm text-brand-dark">Save this to your answers?</span>
            <button className="btn-primary min-h-9 px-4 text-xs" disabled={m.applied} onClick={() => onApply(m.id, m.action!)}>
              {m.applied ? "Saved ✓" : "Save & update"}
            </button>
          </div>
        )}
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
    </BotRow>
  );
}

function ShortlistPanel({ names }: { names: Map<string, string> }) {
  const [list, setList] = useShortlist();
  if (list.length === 0) return <p className="py-6 text-center text-sm text-muted">Tap ☆ on any school to save it here.</p>;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {list.map((code, i) => (
          <li key={code} className="flex items-center gap-2 rounded-2xl bg-paper p-2 pl-3">
            <span className="w-5 font-bold text-brand">{i + 1}</span>
            <Link href={`/schools/${code}`} className="min-w-0 flex-1 truncate font-medium">
              {shortName(names.get(code) ?? code)}
            </Link>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-card" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
              ↑
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-card" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down">
              ↓
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-card text-reach" onClick={() => setList(list.filter((c) => c !== code))} aria-label="Remove">
              ✕
            </button>
          </li>
        ))}
      </ol>
      <Link href="/shortlist" className="btn-primary w-full">
        Compare &amp; share →
      </Link>
    </div>
  );
}
