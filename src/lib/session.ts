import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { config } from "./config";
import { getDb, schema } from "./db";
import { validUntil, type Tier } from "./pricing";

/**
 * Anonymous, login-free entitlements.
 * - `sp_pass`: signed pass id after a successful payment.
 * - `sp_anon`: signed random id for counting free chat messages.
 * No personal data is stored in either.
 */
const PASS_COOKIE = "sp_pass";
const ANON_COOKIE = "sp_anon";

function hmac(v: string) {
  return crypto.createHmac("sha256", config.cookieSecret).update(v).digest("base64url");
}
export function sign(v: string) {
  return `${v}.${hmac(v)}`;
}
export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const v = signed.slice(0, i);
  const mac = signed.slice(i + 1);
  const expected = hmac(v);
  if (mac.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? v : null;
}

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export interface Pass {
  id: string;
  code: string;
  tier: string;
  valid_until: Date;
}

export async function getPass(): Promise<Pass | null> {
  const jar = await cookies();
  const id = unsign(jar.get(PASS_COOKIE)?.value);
  if (!id) return null;
  const db = await getDb();
  const r = await db.select().from(schema.passes).where(eq(schema.passes.id, id)).limit(1);
  const p = r[0];
  if (!p || p.valid_until.getTime() < Date.now()) return null;
  return p;
}

export async function hasPass(): Promise<boolean> {
  return (await getPass()) !== null;
}

/** Human-friendly restore code, e.g. "SP-7KQ2-M9XD". No ambiguous characters. */
function newCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = () => Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
  return `SP-${pick()}-${pick()}`;
}

/** Idempotent on stripe_session_id so webhook + success page can both call it. */
export async function createPass(tier: Tier, stripeSessionId: string | null, amountCents: number): Promise<Pass> {
  const db = await getDb();
  if (stripeSessionId) {
    const existing = await db
      .select()
      .from(schema.passes)
      .where(eq(schema.passes.stripe_session_id, stripeSessionId))
      .limit(1);
    if (existing[0]) return existing[0];
  }
  const row = {
    id: crypto.randomUUID(),
    code: newCode(),
    tier,
    stripe_session_id: stripeSessionId,
    amount_cents: amountCents,
    valid_until: validUntil(tier),
  };
  await db.insert(schema.passes).values(row).onConflictDoNothing();
  if (stripeSessionId) {
    const r = await db.select().from(schema.passes).where(eq(schema.passes.stripe_session_id, stripeSessionId)).limit(1);
    return r[0];
  }
  return row;
}

export async function findPassByCode(code: string): Promise<Pass | null> {
  const db = await getDb();
  const r = await db
    .select()
    .from(schema.passes)
    .where(eq(schema.passes.code, code.trim().toUpperCase()))
    .limit(1);
  const p = r[0];
  if (!p || p.valid_until.getTime() < Date.now()) return null;
  return p;
}

/** Route handlers / server actions only. */
export async function setPassCookie(pass: Pass) {
  const jar = await cookies();
  jar.set(PASS_COOKIE, sign(pass.id), { ...cookieOpts, expires: pass.valid_until });
}

export async function clearPassCookie() {
  (await cookies()).delete(PASS_COOKIE);
}

/** Route handlers only (may set a cookie). */
export async function getOrCreateAnonId(): Promise<string> {
  const jar = await cookies();
  const existing = unsign(jar.get(ANON_COOKIE)?.value);
  if (existing) return existing;
  const id = crypto.randomUUID();
  jar.set(ANON_COOKIE, sign(id), { ...cookieOpts, maxAge: 60 * 60 * 24 * 120 });
  return id;
}

export async function getChatCount(anonId: string): Promise<number> {
  const db = await getDb();
  const r = await db.select().from(schema.chatUsage).where(eq(schema.chatUsage.anon_id, anonId)).limit(1);
  return r[0]?.count ?? 0;
}

export async function incrementChatCount(anonId: string): Promise<number> {
  const db = await getDb();
  const r = await db
    .insert(schema.chatUsage)
    .values({ anon_id: anonId, count: 1 })
    .onConflictDoUpdate({
      target: schema.chatUsage.anon_id,
      set: { count: sql`${schema.chatUsage.count} + 1`, updated_at: new Date() },
    })
    .returning({ count: schema.chatUsage.count });
  return r[0].count;
}

/** Local dev without Stripe keys: allow a fake unlock so the paid flow can be tested. */
export function devUnlockAllowed() {
  return !config.stripe.secretKey && process.env.NODE_ENV !== "production";
}
