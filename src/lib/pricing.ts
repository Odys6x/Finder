import { config } from "./config";

export type Tier = "season" | "family";

/** Today's date in Singapore as YYYY-MM-DD. */
export function sgDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
}

export function isEarlyBird(now = new Date()): boolean {
  const d = sgDate(now);
  return d >= config.pricing.earlyBirdStart && d <= config.pricing.earlyBirdEnd;
}

export function priceCents(tier: Tier, now = new Date()): number {
  const eb = isEarlyBird(now);
  if (tier === "family") return eb ? config.pricing.familyEarlyBirdCents : config.pricing.familyCents;
  return eb ? config.pricing.seasonEarlyBirdCents : config.pricing.seasonCents;
}

export function formatSgd(cents: number): string {
  return `S$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * Season Pass covers this posting season (until end-January after results).
 * Family Pass lasts 3 years, enough for siblings / the next stage.
 */
export function validUntil(tier: Tier, now = new Date()): Date {
  if (tier === "family") return new Date(now.getTime() + 3 * 365 * 24 * 3600 * 1000);
  const y = now.getUTCMonth() >= 1 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return new Date(Date.UTC(y, 1, 1)); // 1 Feb
}

export function publicPricing(now = new Date()) {
  return {
    earlyBird: isEarlyBird(now),
    earlyBirdEnd: config.pricing.earlyBirdEnd,
    season: { cents: priceCents("season", now), regularCents: config.pricing.seasonCents },
    family: config.pricing.familyEnabled
      ? { cents: priceCents("family", now), regularCents: config.pricing.familyCents }
      : null,
  };
}
