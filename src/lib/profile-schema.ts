import { z } from "zod";
import { EMPTY_PROFILE, type Profile } from "./types";

/** Validates a profile sent from the browser. Lenient: bad fields fall back to defaults. */
const score = z.number().int().min(4).max(30).nullable().catch(null);

export const ProfileSchema = z.object({
  psleScore: score,
  postingGroup: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().catch(null),
  homePostal: z.string().max(10).catch(""),
  home: z
    .object({ lat: z.number().min(1).max(2), lng: z.number().min(103).max(105), label: z.string().max(120) })
    .nullable()
    .catch(null),
  maxKm: z.number().positive().max(40).nullable().catch(null),
  maxMinutes: z.number().int().min(10).max(120).nullable().catch(null),
  childSex: z.enum(["", "M", "F"]).catch(""),
  naturePref: z.enum(["any", "co-ed", "single-sex"]).catch("any"),
  sapPref: z.enum(["any", "prefer", "avoid"]).catch("any"),
  track: z.enum(["any", "express", "ip"]).catch("any"),
  motherTongue: z.string().max(20).catch(""),
  interestCcas: z.array(z.string().max(40)).max(15).catch([]),
  interestProgrammes: z.array(z.string().max(40)).max(15).catch([]),
  affiliatedPrimary: z.string().max(80).catch(""),
  userCops: z
    .record(z.string().max(80), z.object({ value: z.number().int().min(4).max(30), vacancy: z.boolean().optional() }))
    .catch({}),
});

export function parseProfile(raw: unknown): Profile {
  const r = ProfileSchema.safeParse({ ...EMPTY_PROFILE, ...(typeof raw === "object" && raw ? raw : {}) });
  return r.success ? (r.data as Profile) : EMPTY_PROFILE;
}
