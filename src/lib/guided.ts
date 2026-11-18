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

/** Asked in this order; steps already answered or not applicable are skipped. */
export function nextStep(p: Profile, answered: Step[]): Step {
  const done = (s: Step) => answered.includes(s);
  if (!done("score")) return "score";
  if (!done("pg") && p.psleScore !== null && likelyPostingGroups(p.psleScore).length > 1) return "pg";
  if (!done("home")) return "home";
  if (!done("sex")) return "sex";
  if (!done("interests")) return "interests";
  if (!done("travel") && p.home) return "travel";
  return "results";
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
