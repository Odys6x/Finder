import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { FAQ } from "./faq";
import { COP_REDACTED_MESSAGE, findCopFigures } from "./guard";
import { SYSTEM_PROMPT } from "./prompt";
import { getProvider } from "./provider";
import { runGroqLoop } from "./run-groq";
import { runTool, TOOLS, type ChatEvent, type Source } from "./tools";
import type { Profile } from "../types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_TOOL_ROUNDS = 5;

function profileBlock(p: Profile | null): string {
  if (!p) return "<profile>No profile saved.</profile>";
  const safe = {
    psle_score: p.psleScore,
    posting_group: p.postingGroup,
    home: p.home ? p.home.label : null,
    max_km: p.maxKm,
    attends: p.childSex === "M" ? "boys or co-ed schools" : p.childSex === "F" ? "girls or co-ed schools" : "unspecified",
    nature_pref: p.naturePref,
    sap_pref: p.sapPref,
    track: p.track,
    mother_tongue: p.motherTongue || null,
    interest_ccas: p.interestCcas,
    interest_programmes: p.interestProgrammes,
  };
  return `<profile>${JSON.stringify(safe)}</profile>`;
}

function collectFaqSources(text: string, sources: Map<string, Source>) {
  for (const m of text.matchAll(/\[\[faq:([a-z0-9-]+)\]\]/g)) {
    const f = FAQ.find((x) => x.id === m[1]);
    if (f) sources.set(`faq:${f.id}`, { kind: "faq", id: f.id, label: f.q, href: `/about-data#faq-${f.id}` });
  }
}

/** Post-check the final text: block COP figures unless the stored COP source is permitted. */
export function applyGuards(text: string): string | null {
  if (!config.copSourcePermitted && findCopFigures(text).length) return COP_REDACTED_MESSAGE;
  return null;
}

export async function runChat(history: ChatTurn[], profile: Profile | null, emit: (e: ChatEvent) => void): Promise<string> {
  const provider = getProvider();
  const sources = new Map<string, Source>();
  const ctx = { profile, emit, sources };

  if (provider.kind === "mock") {
    const text = await runMock(history, profile, ctx);
    emit({ type: "sources", items: [...sources.values()] });
    return text;
  }

  const contextBlock = `${profileBlock(profile)}\n<cop_display_permitted>${config.copSourcePermitted}</cop_display_permitted>`;
  let finalText = "";

  if (provider.kind === "groq") {
    finalText = await runGroqLoop(provider.client, provider.model, history, contextBlock, ctx, statusLabel);
    return finish(finalText, sources, emit);
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = history.slice(0, -1).map((t) => ({ role: t.role, content: t.content }));
  const last = history[history.length - 1];
  messages.push({
    role: "user",
    content: [
      { type: "text", text: contextBlock },
      { type: "text", text: last.content },
    ],
  });

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = provider.client.beta.messages.stream({
      model: provider.model,
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: round === MAX_TOOL_ROUNDS ? [] : TOOLS,
      messages,
      output_config: { effort: config.llm.effort },
      ...(provider.serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    stream.on("text", (delta) => emit({ type: "text", delta }));

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw err;
      // Eager input streaming: an unparseable tool input. Retry the round once.
      if (round < MAX_TOOL_ROUNDS) continue;
      throw err;
    }

    const roundText = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    finalText += roundText;

    if (msg.stop_reason === "refusal") {
      const t = "Sorry, I can't help with that. I can help you explore secondary schools and S1 posting.";
      emit({ type: "replace", text: t });
      return t;
    }
    const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0 || msg.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: msg.content });
    emit({ type: "status", message: toolUses.map((t) => statusLabel(t.name)).join(" · ") });
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        try {
          const r = await runTool(t.name, t.input, ctx);
          return { type: "tool_result", tool_use_id: t.id, content: r.content, is_error: r.isError };
        } catch (e) {
          return { type: "tool_result", tool_use_id: t.id, content: `Tool failed: ${(e as Error).message}`, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
    if (roundText) emit({ type: "text", delta: "\n\n" });
    finalText += roundText ? "\n\n" : "";
  }

  return finish(finalText, sources, emit);
}

/** Guardrails + sources, shared by every provider. */
function finish(text: string, sources: Map<string, Source>, emit: (e: ChatEvent) => void): string {
  const replaced = applyGuards(text);
  if (replaced) {
    emit({ type: "replace", text: replaced });
    text = replaced;
  }
  collectFaqSources(text, sources);
  emit({ type: "sources", items: [...sources.values()] });
  return text;
}

function statusLabel(tool: string) {
  return tool === "search_schools" ? "Searching schools…" : tool === "get_school" ? "Reading school details…" : "Preparing a profile update…";
}

/* --------------------------- offline mock --------------------------- */

const CCA_WORDS = [
  "basketball", "football", "badminton", "volleyball", "netball", "swimming", "table tennis", "tennis", "floorball",
  "hockey", "rugby", "track and field", "athletics", "robotics", "choir", "band", "orchestra", "dance", "drama",
  "chess", "debate", "scouts", "girl guides", "nyc", "npcc", "nccc", "red cross", "st john", "media", "art",
  "photography", "taekwondo", "wushu", "judo", "sailing", "canoeing",
];

async function runMock(history: ChatTurn[], profile: Profile | null, ctx: Parameters<typeof runTool>[2]): Promise<string> {
  const q = history[history.length - 1].content.toLowerCase();
  const say = (t: string) => {
    ctx.emit({ type: "text", delta: t });
    return t;
  };

  if (/\b(cop|cut[- ]?off|score range)\b/.test(q)) {
    ctx.sources.set("faq:cop-year", { kind: "faq", id: "cop-year", label: FAQ[0].q, href: "/about-data#faq-cop-year" });
    return say(
      `${config.copSourcePermitted ? "Open the school's page to see last year's COPs." : COP_REDACTED_MESSAGE} [[faq:cop-year]]\n\n_(Offline demo mode: set ANTHROPIC_API_KEY for the full assistant.)_`,
    );
  }

  const input: Record<string, unknown> = { limit: 6 };
  const near = q.match(/\bnear ([a-z0-9 ]+?)(?: with| that| which|\?|$|,)/);
  if (near) input.near = near[1].trim() === "me" || near[1].trim() === "home" ? "home" : near[1].trim();
  if (/\bco-?ed\b/.test(q)) input.nature = "CO-ED";
  else if (/\bgirls\b/.test(q)) input.nature = "GIRLS";
  else if (/\bboys\b/.test(q)) input.nature = "BOYS";
  for (const z of ["north", "south", "east", "west"]) if (new RegExp(`\\b${z}\\b`).test(q)) input.zone = z.toUpperCase();
  const cca = CCA_WORDS.find((w) => q.includes(w));
  if (cca) input.cca = cca;
  if (/\bsap\b/.test(q)) input.sap = true;
  if (/\b(ip|integrated programme)\b/.test(q)) input.ip = true;

  if (Object.keys(input).length === 1) {
    return say(
      "I'm running in offline demo mode, so I can only do simple searches. Try: _\"Show me co-ed schools near Tampines with basketball\"_.\n\nSet ANTHROPIC_API_KEY (or LLM_PROVIDER=bedrock) for the full assistant.",
    );
  }
  ctx.emit({ type: "status", message: "Searching schools…" });
  const res = await runTool("search_schools", input, ctx);
  if (res.isError) return say(res.content);
  const data = JSON.parse(res.content) as { total_matches: number; schools: { school_code: string; name: string; distance_km: number | null }[] };
  if (!data.schools.length) return say("I couldn't find schools matching all of that. Try widening the distance or removing a filter.");
  const lines = data.schools.map((s) => `- ${s.name}${s.distance_km !== null ? ` — ${s.distance_km} km` : ""} [[${s.school_code}]]`);
  return say(
    `I found ${data.total_matches} school${data.total_matches === 1 ? "" : "s"}. Here are the closest matches:\n${lines.join("\n")}\n\nDistances are straight-line. _(Offline demo mode.)_`,
  );
}
