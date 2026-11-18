import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import Groq from "groq-sdk";
import { config } from "../config";

/**
 * Swappable LLM provider (spec §7).
 * - anthropic: Claude API (ANTHROPIC_API_KEY or an `ant auth login` profile)
 * - bedrock:   Claude on Amazon Bedrock via the Mantle Messages endpoint (AWS credentials)
 * - groq:      open models on Groq's OpenAI-compatible API (GROQ_API_KEY)
 * - mock:      offline, rule-based answers for local dev without credentials
 */
export type ProviderKind = "anthropic" | "bedrock" | "groq" | "mock";

export type LlmProvider =
  | { kind: "anthropic" | "bedrock"; client: Anthropic | AnthropicBedrockMantle; model: string; serverFallback: boolean }
  | { kind: "groq"; client: Groq; model: string }
  | { kind: "mock"; model: "mock" };

const DEFAULT_MODEL: Record<Exclude<ProviderKind, "mock">, string> = {
  anthropic: "claude-opus-5-5",
  bedrock: "claude-opus-5-5",
  groq: "openai/gpt-oss-120b",
};

export function resolveProviderKind(): ProviderKind {
  if (config.llm.provider) return config.llm.provider as ProviderKind;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  return "mock";
}

let cached: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (cached) return cached;
  const kind = resolveProviderKind();
  if (kind === "mock") return (cached = { kind, model: "mock" });
  const model = config.llm.model || DEFAULT_MODEL[kind];
  if (kind === "anthropic") {
    cached = { kind, client: new Anthropic(), model, serverFallback: true };
  } else if (kind === "bedrock") {
    cached = {
      kind,
      client: new AnthropicBedrockMantle({ awsRegion: config.llm.awsRegion }),
      model: model.startsWith("anthropic.") ? model : `anthropic.${model}`,
      serverFallback: false,
    };
  } else {
    cached = { kind, client: new Groq(), model };
  }
  return cached;
}
