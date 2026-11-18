"use client";
import { useEffect, useState } from "react";

export interface Me {
  pass: { tier: string; code: string; validUntil: string } | null;
  chatRemaining: number | null;
  chatLimit: number;
  pricing: {
    earlyBird: boolean;
    earlyBirdEnd: string;
    season: { cents: number; regularCents: number };
    family: { cents: number; regularCents: number } | null;
  };
  devUnlock: boolean;
  aiMode: "anthropic" | "bedrock" | "groq" | "mock";
  copPermitted: boolean;
  commuteEnabled: boolean;
}

let cache: Promise<Me> | null = null;

export function refreshMe() {
  cache = fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
  return cache;
}

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    (cache ?? refreshMe()).then((m) => alive && setMe(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return me;
}

export function formatSgd(cents: number) {
  return `S$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export async function startCheckout(tier: "season" | "family") {
  const r = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  const body = await r.json();
  if (body.url) window.location.href = body.url;
  else throw new Error(body.error ?? "Checkout failed");
}
