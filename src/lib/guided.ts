/**
 * The guided, chat-style onboarding. Pure and client-safe: no AI involved, so it's instant,
 * free, and doesn't use up the free AI questions.
 */
import { likelyPostingGroups } from "./banding";
import { formatKm } from "./geo";
import type { MatchItem } from "./matching";
import type { Profile } from "./types";
import { title } from "./vocab";

export type Step = "score" | "pg" | "home" | "sex" | "interests" | "travel" | "results";

/**
 * Only what's needed to show results is asked up front: score (plus posting group when
 * ambiguous) and home. Boy/girl, interests and travel are optional one-tap boosters on the
 * results, so parents see schools after 1–2 actions.
 */
export function nextStep(p: Profile, answered: Step[]): Step {
  const done = (s: Step) => answered.includes(s);
  if (!done("score")) return "score";
  if (!done("pg") && p.psleScore !== null && likelyPostingGroups(p.psleScore).length > 1) return "pg";
  if (!done("home")) return "home";
  return "results";
}

/** The questions this family will be asked, for the "Question 1 of 2" progress bar. */
export function onboardingSteps(p: Profile, answered: Step[]): Step[] {
  void answered;
  const steps: Step[] = ["score"];
  if (p.psleScore !== null && likelyPostingGroups(p.psleScore).length > 1) steps.push("pg");
  steps.push("home");
  return steps;
}

/* -------------------------------------------------------- one-line answers */

/** Words that map a free-text mention to an interest group. */
const INTEREST_WORDS: Record<string, RegExp> = {
  ball: /\b(basketball|football|soccer|netball|volleyball|floorball|badminton|table tennis|ping ?pong|hockey|rugby|ball games?|sports?)\b/i,
  fitness: /\b(swim\w*|running|runner|track|athletics|cross country)\b/i,
  martial: /\b(wushu|taekwondo|judo|martial arts?|karate)\b/i,
  tech: /\b(robot\w*|coding|code|programming|tech|computers?|infocomm|media)\b/i,
  science: /\b(science|stem|biology|chemistry|physics)\b/i,
  music: /\b(music|band|choir|singing|piano|violin|guitar|orchestra|guzheng)\b/i,
  art: /\b(?<!martial )(art|arts|drawing|painting|design|photography)\b/i,
  stage: /\b(drama|dance|dancing|theatre|theater|acting)\b/i,
  uniform: /\b(npcc|ncc|nccc|scouts?|guides?|uniformed( groups?)?|red cross|st john)\b/i,
  lang: /\b(languages?|bicultural)\b/i,
  green: /\b(environment\w*|nature|sustainab\w*|gardening)\b/i,
  biz: /\b(business|entrepreneur\w*)\b/i,
  lead: /\b(leadership|leader|volunteer\w*|community service)\b/i,
};

export interface QuickAnswer {
  patch: Partial<Profile>;
  /** Steps now answered, so the chat skips them. */
  answered: Step[];
  /** 6-digit postal code to look up (async), if given. */
  postal: string | null;
  interestIds: string[];
  /** Short human summary, e.g. ["Score 12", "PG3", "Girl", "🏀 Ball games"]. */
  understood: string[];
}

/**
 * Reads everything a parent might type in one go, e.g.
 * "12, 529889, girl, likes basketball and music, within 30 min". Local and instant.
 */
export function parseQuickAnswer(text: string): QuickAnswer {
  const patch: Partial<Profile> = {};
  const answered: Step[] = [];
  const understood: string[] = [];
  let t = ` ${text.toLowerCase()} `;

  const postal = t.match(/(?<!\d)(\d{6})(?!\d)/)?.[1] ?? null;
  if (postal) t = t.replace(postal, " ");

  // Travel limits first, so "30 min" / "5 km" aren't mistaken for a score.
  const mins = t.match(/(\d{2,3})\s*(?:min|mins|minutes)\b/);
  const km = t.match(/(\d{1,2}(?:\.\d)?)\s*km\b/);
  if (mins) {
    patch.maxMinutes = Math.min(120, Math.max(10, Number(mins[1])));
    patch.maxKm = null;
    understood.push(`🚇 ≤ ${patch.maxMinutes} min`);
    t = t.replace(mins[0], " ");
  } else if (km) {
    patch.maxKm = Math.min(40, Number(km[1]));
    patch.maxMinutes = null;
    understood.push(`📍 ≤ ${patch.maxKm} km`);
    t = t.replace(km[0], " ");
  } else if (/\b(near(by)?|close to home|not too far)\b/.test(t)) {
    patch.maxKm = 5;
    understood.push("📍 Nearby");
  }

  const pg = t.match(/\bpg\s?([123])\b/);
  if (pg) {
    patch.postingGroup = Number(pg[1]) as 1 | 2 | 3;
    t = t.replace(pg[0], " ");
  }

  const scoreMatch =
    t.match(/\b(?:score|scored|psle|al|got)\D{0,8}(\d{1,2})\b/) ?? t.match(/(?<![\d.])(\d{1,2})(?![\d.]|\s*(?:km|min|%|years?|yrs?|kids?|children|schools?))/);
  const score = scoreMatch ? Number(scoreMatch[1]) : NaN;
  if (score >= 4 && score <= 30) {
    patch.psleScore = score;
    const groups = likelyPostingGroups(score);
    if (!patch.postingGroup || !groups.includes(patch.postingGroup)) patch.postingGroup = groups[0];
    answered.push("score");
    if (pg || groups.length === 1) answered.push("pg");
    understood.push(`Score ${score}`, `PG${patch.postingGroup}`);
  }

  if (/\b(girl|daughter|she|her)\b/.test(t)) {
    patch.childSex = "F";
    understood.push("👧 Girl");
  } else if (/\b(boy|son|he|him)\b/.test(t)) {
    patch.childSex = "M";
    understood.push("👦 Boy");
  }

  const interestIds = Object.entries(INTEREST_WORDS)
    .filter(([, re]) => re.test(t))
    .map(([id]) => id);
  if (interestIds.length) {
    Object.assign(patch, interestsFromGroups(interestIds));
    for (const g of INTEREST_GROUPS.filter((g) => interestIds.includes(g.id))) understood.push(`${g.emoji} ${g.label}`);
  }

  if (/\bco-?ed\b/.test(t)) {
    patch.naturePref = "co-ed";
    understood.push("Co-ed only");
  } else if (/\b(single[- ]sex|all[- ](girls|boys))\b/.test(t)) {
    patch.naturePref = "single-sex";
    understood.push("Single-sex");
  }
  if (/\bsap\b/.test(t)) {
    patch.sapPref = "prefer";
    understood.push("SAP");
  }
  if (/\b(ip|integrated programme)\b/.test(t)) {
    patch.track = "ip";
    understood.push("🎓 IP");
  }

  return { patch, answered, postal, interestIds, understood };
}

/** Initials for a school's card badge, e.g. "Bedok Green Secondary School" → "BG". */
export function schoolInitials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^(secondary|school|the|of|and|&)$/i.test(w));
  return (words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "");
}

/** Typed score like "12", "score 12", "she got 12" → 12. Anything else → null (treated as an AI question). */
export function parseScoreInput(text: string): number | null {
  const m = text.trim().match(/^(?:(?:my\s+)?(?:child|son|daughter|kid|he|she)?\s*(?:got|scored|has)?\s*(?:a\s+)?(?:psle\s+)?(?:score\s*(?:is|of|:)?\s*)?)?(\d{1,2})(?:\s*(?:points?|pts))?[.!]?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 4 && n <= 30 ? n : null;
}

export function parsePostalInput(text: string): string | null {
  const m = text.trim().match(/^(?:s\(?)?(\d{6})\)?$/i);
  return m ? m[1] : null;
}

export interface InterestGroup {
  id: string;
  emoji: string;
  label: string;
  ccas: string[];
  programmes: string[];
}

/** Broad, parent-friendly groups. Values are matched against data.gov.sg CCA / programme names. */
export const INTEREST_GROUPS: InterestGroup[] = [
  { id: "ball", emoji: "🏀", label: "Ball games", ccas: ["Basketball", "Football", "Netball", "Volleyball", "Floorball", "Badminton", "Table Tennis"], programmes: ["Sports"] },
  { id: "fitness", emoji: "🏃", label: "Running & swimming", ccas: ["Track and Field", "Swimming", "Cross Country"], programmes: ["Sports"] },
  { id: "martial", emoji: "🥋", label: "Martial arts", ccas: ["Wushu", "Taekwondo", "Judo"], programmes: [] },
  { id: "tech", emoji: "🤖", label: "Robotics & tech", ccas: ["Robotics", "Infocomm"], programmes: ["Emerging Technologies", "STEM"] },
  { id: "science", emoji: "🔬", label: "Science", ccas: [], programmes: ["STEM", "Health"] },
  { id: "music", emoji: "🎵", label: "Music", ccas: ["Choir", "Concert Band", "Chinese Orchestra", "Guitar"], programmes: ["Music"] },
  { id: "art", emoji: "🎨", label: "Art & design", ccas: ["Art and Crafts", "Photography"], programmes: ["Art", "Design"] },
  { id: "stage", emoji: "🎭", label: "Drama & dance", ccas: ["English Drama", "Modern Dance", "Chinese Dance", "Malay Dance", "Indian Dance"], programmes: ["Performing Arts"] },
  { id: "uniform", emoji: "🎖️", label: "Uniformed groups", ccas: ["National Police Cadet Corps", "National Cadet Corps", "Scouts", "Girl Guides", "Red Cross", "St John"], programmes: [] },
  { id: "lang", emoji: "🌏", label: "Languages & cultures", ccas: [], programmes: ["Language", "Bicultural"] },
  { id: "green", emoji: "🌱", label: "Environment", ccas: ["Environment"], programmes: ["Sustainability"] },
  { id: "biz", emoji: "💼", label: "Business", ccas: [], programmes: ["Business"] },
  { id: "lead", emoji: "🤝", label: "Leadership & service", ccas: ["Student Leadership"], programmes: ["Community Youth Leadership"] },
];

export function interestsFromGroups(ids: string[]): Pick<Profile, "interestCcas" | "interestProgrammes"> {
  const groups = INTEREST_GROUPS.filter((g) => ids.includes(g.id));
  return {
    interestCcas: [...new Set(groups.flatMap((g) => g.ccas))],
    interestProgrammes: [...new Set(groups.flatMap((g) => g.programmes))],
  };
}

const ICONS: [RegExp, string][] = [
  [/basketball|football|netball|volleyball|floorball|badminton|table tennis/i, "🏀"],
  [/track|swim|cross country/i, "🏃"],
  [/wushu|taekwondo|judo/i, "🥋"],
  [/robot|infocomm|technolog|stem/i, "🤖"],
  [/music|choir|band|orchestra|guitar/i, "🎵"],
  [/art|craft|photo|design/i, "🎨"],
  [/drama|dance|perform/i, "🎭"],
  [/cadet|scout|guide|red cross|st john|brigade/i, "🎖️"],
  [/language|bicultural/i, "🌏"],
  [/sustainab|environment/i, "🌱"],
  [/sap school/i, "🏮"],
  [/integrated programme/i, "🎓"],
  [/affiliated/i, "🤝"],
];

/** Two or three short facts for a school card, e.g. ["🚇 18 min", "🏀 Basketball", "🎵 Music LLP"]. */
export function cardFacts(it: MatchItem, max = 3): string[] {
  const facts: string[] = [];
  if (it.commute) facts.push(`🚇 ${it.commute.minutes} min`);
  else if (it.distanceKm !== null) facts.push(`📍 ${formatKm(it.distanceKm)}`);
  for (const r of it.reasons) {
    if (facts.length >= max) break;
    if (/from home|by public transport/.test(r)) continue;
    const short = title(
      r
        .replace(/^Has (.+) CCA$/, "$1")
        .replace(/^(?:ALP|LLP): (.+)$/, "$1")
        .replace(/^Offers the Integrated Programme$/, "IP")
        .replace(/^Affiliated to your child's primary school$/, "Affiliated"),
    );
    const icon = ICONS.find(([re]) => re.test(r))?.[1] ?? "✓";
    facts.push(`${icon} ${truncate(short, 20)}`);
  }
  return facts;
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}
