import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Cca, Programme } from "../types";

export const schools = pgTable("schools", {
  school_code: text("school_code").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  postal_code: text("postal_code").notNull().default(""),
  zone: text("zone").notNull().default(""),
  nearest_mrt: text("nearest_mrt").notNull().default(""),
  bus_services: text("bus_services").notNull().default(""),
  type: text("type").notNull().default(""),
  nature: text("nature").notNull().default(""),
  session: text("session").notNull().default(""),
  main_level: text("main_level").notNull().default(""),
  is_sap: boolean("is_sap").notNull().default(false),
  is_ip: boolean("is_ip").notNull().default(false),
  is_gifted: boolean("is_gifted").notNull().default(false),
  is_autonomous: boolean("is_autonomous").notNull().default(false),
  mother_tongues: jsonb("mother_tongues").$type<string[]>().notNull().default([]),
  website: text("website").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
  ccas: jsonb("ccas").$type<Cca[]>().notNull().default([]),
  moe_programmes: jsonb("moe_programmes").$type<string[]>().notNull().default([]),
  alp: jsonb("alp").$type<Programme | null>(),
  llp: jsonb("llp").$type<Programme | null>(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  culture_blurb: text("culture_blurb"),
  // SchoolFinder fields (manual admin import only)
  affiliated_primary_schools: jsonb("affiliated_primary_schools").$type<string[]>().notNull().default([]),
  dsa_talent_areas: jsonb("dsa_talent_areas").$type<string[]>().notNull().default([]),
  electives: jsonb("electives").$type<string[]>().notNull().default([]),
  sen_support: text("sen_support"),
  schoolfinder_url: text("schoolfinder_url"),
  source_last_updated: text("source_last_updated"),
  datagov_accessed_at: timestamp("datagov_accessed_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per school per COP year so history is kept (spec §4). */
export const cops = pgTable(
  "cops",
  {
    school_code: text("school_code")
      .notNull()
      .references(() => schools.school_code, { onDelete: "cascade" }),
    cop_year: integer("cop_year").notNull(),
    pg3: integer("pg3"),
    pg2: integer("pg2"),
    pg1: integer("pg1"),
    ip: integer("ip"),
    affiliated_pg3: integer("affiliated_pg3"),
    affiliated_pg2: integer("affiliated_pg2"),
    affiliated_pg1: integer("affiliated_pg1"),
    pg1_has_vacancy: boolean("pg1_has_vacancy").notNull().default(false),
    hcl_note: text("hcl_note"),
    imported_at: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.school_code, t.cop_year] })],
);

export const passes = pgTable("passes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  tier: text("tier").notNull(), // "season" | "family"
  stripe_session_id: text("stripe_session_id").unique(),
  amount_cents: integer("amount_cents").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  valid_until: timestamp("valid_until", { withTimezone: true }).notNull(),
});

/** Anonymous chat counter for the free tier. Key is a random cookie id. */
export const chatUsage = pgTable("chat_usage", {
  anon_id: text("anon_id").primaryKey(),
  count: integer("count").notNull().default(0),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshLog = pgTable("refresh_log", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // "datagov" | "cop-import" | "schoolfinder-import"
  started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finished_at: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // "running" | "ok" | "error"
  message: text("message").notNull().default(""),
});

/**
 * Cached public-transport commutes. origin_key is the home location rounded to ~100 m
 * (3 decimal places), never linked to a person.
 */
export const commuteCache = pgTable(
  "commute_cache",
  {
    origin_key: text("origin_key").notNull(),
    school_code: text("school_code").notNull(),
    data: jsonb("data").$type<unknown>(), // Commute, or null when OneMap found no route
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.origin_key, t.school_code] })],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
});
