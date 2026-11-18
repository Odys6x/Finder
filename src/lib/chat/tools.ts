import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { config, SCHOOLFINDER_URL } from "../config";
import { geocode, isPostalCode, type LatLng } from "../geo";
import { getCopYear, getPermittedCops, getSchool, getSchoolIndex } from "../repo";
import { searchIndex } from "../search";
import type { Profile } from "../types";

/** Events the chat route streams to the browser alongside text. */
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "status"; message: string }
  | { type: "schools"; items: SchoolCard[] }
  | { type: "action"; update: ProfileUpdate }
  | { type: "sources"; items: Source[] }
  | { type: "replace"; text: string }
  | { type: "limit"; remaining: number }
  | { type: "error"; message: string }
  | { type: "done" };

export interface SchoolCard {
  code: string;
  name: string;
  zone: string;
  nature: string;
  distanceKm: number | null;
  matched: string[];
}

export interface Source {
  kind: "school" | "faq" | "search";
  id: string;
  label: string;
  href: string;
}

export const SearchInput = z
  .object({
    name_contains: z.string().max(80).optional(),
    near: z.string().max(80).optional(),
    max_km: z.number().positive().max(40).optional(),
    zone: z.enum(["NORTH", "SOUTH", "EAST", "WEST"]).optional(),
    nature: z.enum(["CO-ED", "BOYS", "GIRLS"]).optional(),
    cca: z.string().max(60).optional(),
    programme: z.string().max(60).optional(),
    subject: z.string().max(60).optional(),
    mother_tongue: z.enum(["CHINESE", "MALAY", "TAMIL"]).optional(),
    sap: z.boolean().optional(),
    ip: z.boolean().optional(),
    limit: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export const GetSchoolInput = z.object({ school_code: z.string().min(1).max(80) }).strict();

export const ProfileUpdate = z
  .object({
    naturePref: z.enum(["any", "co-ed", "single-sex"]).optional(),
    maxKm: z.number().positive().max(40).optional(),
    sapPref: z.enum(["any", "prefer", "avoid"]).optional(),
    track: z.enum(["any", "express", "ip"]).optional(),
    motherTongue: z.enum(["", "CHINESE", "MALAY", "TAMIL"]).optional(),
    addInterestCcas: z.array(z.string().max(40)).max(5).optional(),
    addInterestProgrammes: z.array(z.string().max(40)).max(5).optional(),
  })
  .strict();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_schools",
    description:
      "Search SchoolPath's database of Singapore secondary schools. All filters are optional and combined with AND. Use `near` for a place name, MRT station or 6-digit postal code, or the word 'home' for the parent's saved home location. Returns up to `limit` schools with school_code, zone, nature, distance and which CCA/programme/subject matched. Never returns COPs.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        name_contains: { type: "string", description: "Part of the school name" },
        near: { type: "string", description: "Place, MRT station, postal code, or 'home'" },
        max_km: { type: "number", description: "Max straight-line distance from `near`, in km" },
        zone: { type: "string", enum: ["NORTH", "SOUTH", "EAST", "WEST"] },
        nature: { type: "string", enum: ["CO-ED", "BOYS", "GIRLS"] },
        cca: { type: "string", description: "CCA keyword, e.g. 'basketball', 'robotics', 'choir'" },
        programme: { type: "string", description: "Programme keyword: ALP/LLP domain, MOE programme or elective, e.g. 'music', 'STEM', 'language elective'" },
        subject: { type: "string", description: "Subject keyword, e.g. 'computing', 'Higher Chinese'" },
        mother_tongue: { type: "string", enum: ["CHINESE", "MALAY", "TAMIL"] },
        sap: { type: "boolean", description: "true = SAP schools only" },
        ip: { type: "boolean", description: "true = schools offering the Integrated Programme" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_school",
    description:
      "Get stored facts for one school by school_code: type, nature, address, MRT, CCAs, subjects, MOE programmes, ALP/LLP, SAP/IP status, mother tongues, website, and data dates. Includes COPs ONLY if SchoolPath is permitted to show them; otherwise it returns a SchoolFinder link instead.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { school_code: { type: "string" } },
      required: ["school_code"],
      additionalProperties: false,
    },
  },
  {
    name: "suggest_profile_update",
    description:
      "Offer to update the parent's saved preferences (the parent must tap to confirm; nothing changes automatically). Use when the parent states a preference such as wanting co-ed schools, a max distance, or a CCA interest.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        naturePref: { type: "string", enum: ["any", "co-ed", "single-sex"] },
        maxKm: { type: "number" },
        sapPref: { type: "string", enum: ["any", "prefer", "avoid"] },
        track: { type: "string", enum: ["any", "express", "ip"] },
        motherTongue: { type: "string", enum: ["", "CHINESE", "MALAY", "TAMIL"] },
        addInterestCcas: { type: "array", items: { type: "string" } },
        addInterestProgrammes: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
];

export interface ToolContext {
  profile: Profile | null;
  emit: (e: ChatEvent) => void;
  sources: Map<string, Source>;
}

async function resolveOrigin(near: string | undefined, profile: Profile | null): Promise<(LatLng & { label: string }) | null> {
  if (!near) return null;
  if (near.trim().toLowerCase() === "home") return profile?.home ?? null;
  const q = isPostalCode(near) ? near : `${near}`;
  return geocode(q).catch(() => null);
}

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ content: string; isError?: boolean }> {
  if (name === "search_schools") {
    const p = SearchInput.safeParse(rawInput);
    if (!p.success) return { content: `Invalid input: ${p.error.message}`, isError: true };
    const i = p.data;
    const origin = await resolveOrigin(i.near, ctx.profile);
    if (i.near && !origin) {
      return {
        content:
          i.near.toLowerCase() === "home"
            ? "The parent has not saved a home location. Ask them to add their postal code in My Profile, or search by zone."
            : `Could not find the place "${i.near}". Try an MRT station, town or postal code.`,
        isError: true,
      };
    }
    const index = await getSchoolIndex();
    const hits = searchIndex(
      index,
      {
        q: i.name_contains,
        zone: i.zone,
        nature: i.nature,
        cca: i.cca,
        programme: i.programme,
        subject: i.subject,
        mt: i.mother_tongue,
        sap: i.sap,
        ip: i.ip,
        maxKm: origin ? (i.max_km ?? 5) : undefined,
      },
      origin,
    );
    const limit = i.limit ?? 6;
    const top = hits.slice(0, limit);
    const cards: SchoolCard[] = top.map((h) => ({
      code: h.s.c,
      name: h.s.n,
      zone: h.s.z,
      nature: h.s.na,
      distanceKm: h.distanceKm === null ? null : Math.round(h.distanceKm * 10) / 10,
      matched: Object.values(h.matched).filter(Boolean) as string[],
    }));
    if (cards.length) ctx.emit({ type: "schools", items: cards });
    for (const c of cards) ctx.sources.set(`school:${c.code}`, { kind: "school", id: c.code, label: c.name, href: `/schools/${c.code}` });
    return {
      content: JSON.stringify({
        total_matches: hits.length,
        shown: cards.length,
        origin: origin ? origin.label : null,
        distance_note: origin ? "Distances are straight-line, not travel time." : undefined,
        schools: cards.map((c) => ({
          school_code: c.code,
          name: c.name,
          zone: c.zone,
          nature: c.nature,
          distance_km: c.distanceKm,
          matched: c.matched,
        })),
      }),
    };
  }

  if (name === "get_school") {
    const p = GetSchoolInput.safeParse(rawInput);
    if (!p.success) return { content: `Invalid input: ${p.error.message}`, isError: true };
    const s = await getSchool(p.data.school_code);
    if (!s) return { content: `No school with code "${p.data.school_code}". Use search_schools to find the code.`, isError: true };
    ctx.sources.set(`school:${s.school_code}`, { kind: "school", id: s.school_code, label: s.name, href: `/schools/${s.school_code}` });
    const cops = await getPermittedCops();
    const cop = cops.get(s.school_code);
    const copYear = await getCopYear();
    return {
      content: JSON.stringify({
        school_code: s.school_code,
        name: s.name,
        type: s.type,
        nature: s.nature,
        zone: s.zone,
        address: `${s.address} S(${s.postal_code})`,
        nearest_mrt: s.nearest_mrt,
        sap: s.is_sap,
        ip: s.is_ip,
        mother_tongues: s.mother_tongues,
        ccas: s.ccas.map((c) => `${c.name} (${c.group})`),
        subjects: s.subjects,
        moe_programmes: s.moe_programmes,
        alp: s.alp,
        llp: s.llp,
        electives: s.electives,
        dsa_talent_areas: s.dsa_talent_areas.length ? s.dsa_talent_areas : "not in our data — check SchoolFinder",
        affiliated_primary_schools: s.affiliated_primary_schools.length ? s.affiliated_primary_schools : "not in our data",
        culture_blurb: s.culture_blurb ?? "not available",
        website: s.website,
        cops:
          config.copSourcePermitted && cop
            ? { ...cop, note: `These are ${cop.cop_year} COPs (last year's). They change yearly and do not guarantee a place.` }
            : `Not available in SchoolPath. Direct the parent to SchoolFinder: ${s.schoolfinder_url ?? SCHOOLFINDER_URL} (look for the ${copYear} PSLE score ranges).`,
        data_as_of: s.datagov_accessed_at?.slice(0, 10) ?? null,
      }),
    };
  }

  if (name === "suggest_profile_update") {
    const p = ProfileUpdate.safeParse(rawInput);
    if (!p.success) return { content: `Invalid input: ${p.error.message}`, isError: true };
    ctx.emit({ type: "action", update: p.data });
    return { content: "Shown to the parent as a button. It only applies if they tap it." };
  }

  return { content: `Unknown tool ${name}`, isError: true };
}
