/**
 * Runs the chat eval set against the configured LLM provider and grades each answer
 * with rule-based checks (spec §8: it must not make up COPs).
 *
 *   npm run eval:chat -- --yes            # all cases
 *   npm run eval:chat -- --yes cop-direct # one case
 *
 * This calls the real model and costs money, so it refuses to run without --yes.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/lib/config";
import { findAdmissionPromise, findCopFigures, findValueJudgement } from "../src/lib/chat/guard";
import { runChat } from "../src/lib/chat/run";
import { resolveProviderKind } from "../src/lib/chat/provider";
import { parseProfile } from "../src/lib/profile-schema";
import type { ChatEvent } from "../src/lib/chat/tools";

interface Case {
  id: string;
  q: string;
  mustMatch?: string[];
  mustNotMatch?: string[];
  mustCiteSchool?: boolean;
  mustCiteFaq?: boolean;
  mustUseTool?: string;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--yes")) {
    console.error("This eval calls the live model and is billed. Re-run with --yes to proceed.");
    process.exit(2);
  }
  if (resolveProviderKind() === "mock") {
    console.error("No LLM provider configured (set ANTHROPIC_API_KEY or LLM_PROVIDER=bedrock). The mock provider is not evaluated.");
    process.exit(2);
  }
  const only = args.filter((a) => !a.startsWith("--"));
  const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "evals", "chat-eval.json"), "utf8")) as {
    profile: unknown;
    cases: Case[];
  };
  const profile = parseProfile(file.profile);
  const cases = only.length ? file.cases.filter((c) => only.includes(c.id)) : file.cases;

  let passed = 0;
  const report: { id: string; ok: boolean; failures: string[]; answer: string }[] = [];
  for (const c of cases) {
    const tools: string[] = [];
    let streamed = "";
    let replaced: string | null = null;
    const emit = (e: ChatEvent) => {
      if (e.type === "text") streamed += e.delta;
      if (e.type === "replace") replaced = e.text;
      if (e.type === "status") tools.push(e.message);
    };
    const failures: string[] = [];
    let answer = "";
    try {
      answer = await runChat([{ role: "user", content: c.q }], profile, emit);
    } catch (e) {
      failures.push(`error: ${(e as Error).message}`);
    }
    // Grade the raw model output too: a guard replacement means the model tried to leak.
    const raw = streamed;
    if (!config.copSourcePermitted) {
      const figs = findCopFigures(raw);
      if (figs.length) failures.push(`COP figures in model output: ${figs.join(" | ")}`);
    }
    const promise = findAdmissionPromise(answer);
    if (promise) failures.push(`admission promise: "${promise}"`);
    const judgement = findValueJudgement(answer);
    if (judgement) failures.push(`value judgement: "${judgement}"`);
    for (const re of c.mustMatch ?? []) if (!new RegExp(re, "i").test(answer)) failures.push(`missing /${re}/`);
    for (const re of c.mustNotMatch ?? []) if (new RegExp(re, "i").test(answer)) failures.push(`must not contain /${re}/`);
    if (c.mustCiteSchool && !/\[\[(?!faq:)[a-z0-9-]+\]\]/.test(answer)) failures.push("no school citation");
    if (c.mustCiteFaq && !/\[\[faq:[a-z0-9-]+\]\]/.test(answer)) failures.push("no FAQ citation");
    if (c.mustUseTool) {
      const label = { search_schools: "Searching", get_school: "Reading", suggest_profile_update: "profile" }[c.mustUseTool] ?? c.mustUseTool;
      if (!tools.some((t) => t.includes(label))) failures.push(`did not call ${c.mustUseTool}`);
    }
    const ok = failures.length === 0;
    if (ok) passed++;
    report.push({ id: c.id, ok, failures, answer: replaced ?? answer });
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.id}${ok ? "" : "\n      " + failures.join("\n      ")}`);
  }
  console.log(`\n${passed}/${cases.length} passed`);
  const out = path.join(process.cwd(), "evals", `results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Answers written to ${out}`);
  process.exit(passed === cases.length ? 0 : 1);
}

main();
