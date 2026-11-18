/**
 * Central app configuration. Everything tunable lives here, read from env
 * with safe defaults. Server-only values must never be imported by client
 * components — use `publicConfig` for anything the browser needs.
 */

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function int(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  /**
   * Legal gate (spec §3 rule 4). While false, COPs stored from MOE SchoolFinder
   * are never shown, never sent to the browser and never given to the AI.
   * Keep false until MOE grants written permission.
   */
  copSourcePermitted: bool(process.env.COP_SOURCE_PERMITTED, false),

  /** Banding thresholds (spec §2). Safe: s <= c - safeMargin; Reach: s > c + borderlineMargin. */
  banding: {
    safeMargin: int(process.env.BAND_SAFE_MARGIN, 3),
    borderlineMargin: int(process.env.BAND_BORDERLINE_MARGIN, 2),
  },

  /** Free tier limits. */
  free: {
    chatMessages: int(process.env.FREE_CHAT_MESSAGES, 5),
    matchPreview: int(process.env.FREE_MATCH_PREVIEW, 3),
  },

  shortlistMax: 10,

  /** Pricing in SGD cents. Early-bird window is inclusive, ISO dates (SGT). */
  pricing: {
    seasonCents: int(process.env.PRICE_SEASON_CENTS, 2400),
    seasonEarlyBirdCents: int(process.env.PRICE_SEASON_EARLYBIRD_CENTS, 1800),
    familyCents: int(process.env.PRICE_FAMILY_CENTS, 4000),
    familyEarlyBirdCents: int(process.env.PRICE_FAMILY_EARLYBIRD_CENTS, 3200),
    earlyBirdStart: process.env.EARLYBIRD_START ?? "2026-09-01",
    earlyBirdEnd: process.env.EARLYBIRD_END ?? "2026-11-30",
    familyEnabled: bool(process.env.FAMILY_PASS_ENABLED, true),
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  },

  /** Base URL used for Stripe redirects. */
  appUrl: process.env.APP_URL ?? "http://localhost:3000",

  /** HMAC secret for pass / usage cookies. */
  cookieSecret: process.env.COOKIE_SECRET ?? "dev-only-insecure-secret-change-me",

  admin: {
    password: process.env.ADMIN_PASSWORD ?? "",
  },

  llm: {
    /** "anthropic" | "bedrock" | "groq" | "mock" (mock = no network, for local dev). */
    provider: (process.env.LLM_PROVIDER ?? "") as "" | "anthropic" | "bedrock" | "groq" | "mock",
    /** Blank = provider default (claude-opus-5-5 for Claude, openai/gpt-oss-120b for Groq). */
    model: process.env.LLM_MODEL ?? "",
    effort: (process.env.LLM_EFFORT ?? "medium") as "low" | "medium" | "high",
    awsRegion: process.env.AWS_REGION ?? "ap-southeast-1",
  },

  /** OneMap account (free registration) for public-transport commute times. */
  oneMap: {
    email: process.env.ONEMAP_EMAIL ?? "",
    password: process.env.ONEMAP_PASSWORD ?? "",
    /** School-morning departure time used for commute estimates (SGT, HH:MM:SS). */
    departTime: process.env.COMMUTE_DEPART_TIME ?? "06:45:00",
  },

  dataGov: {
    apiKey: process.env.DATA_GOV_SG_API_KEY ?? "",
  },

  database: {
    url: process.env.DATABASE_URL ?? "",
    pgliteDir: process.env.PGLITE_DIR ?? "./.data/pglite",
    /**
     * Run migrations when the server connects. Default: on for self-hosted servers, off on
     * Vercel (migrations run once in `vercel-build` instead of racing on every cold start).
     */
    migrateOnStart: bool(process.env.DB_MIGRATE_ON_START, !process.env.VERCEL),
  },

  /** Fallback COP year if none is stored in app settings (spec §2). */
  defaultCopYear: int(process.env.COP_YEAR, 2025),
} as const;

export { DISCLAIMER } from "./config-public";

export const DATA_GOV_DATASET_NAME = "School Directory and Information";
export const OPEN_DATA_LICENCE_URL = "https://data.gov.sg/open-data-licence";
export const SCHOOLFINDER_URL = "https://www.moe.gov.sg/schoolfinder";
