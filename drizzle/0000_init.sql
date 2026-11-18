CREATE TABLE "chat_usage" (
	"anon_id" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cops" (
	"school_code" text NOT NULL,
	"cop_year" integer NOT NULL,
	"pg3" integer,
	"pg2" integer,
	"pg1" integer,
	"ip" integer,
	"affiliated_pg3" integer,
	"affiliated_pg2" integer,
	"affiliated_pg1" integer,
	"pg1_has_vacancy" boolean DEFAULT false NOT NULL,
	"hcl_note" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cops_school_code_cop_year_pk" PRIMARY KEY("school_code","cop_year")
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"tier" text NOT NULL,
	"stripe_session_id" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	CONSTRAINT "passes_code_unique" UNIQUE("code"),
	CONSTRAINT "passes_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "refresh_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"message" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"school_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"zone" text DEFAULT '' NOT NULL,
	"nearest_mrt" text DEFAULT '' NOT NULL,
	"bus_services" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"nature" text DEFAULT '' NOT NULL,
	"session" text DEFAULT '' NOT NULL,
	"main_level" text DEFAULT '' NOT NULL,
	"is_sap" boolean DEFAULT false NOT NULL,
	"is_ip" boolean DEFAULT false NOT NULL,
	"is_gifted" boolean DEFAULT false NOT NULL,
	"is_autonomous" boolean DEFAULT false NOT NULL,
	"mother_tongues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ccas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"moe_programmes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alp" jsonb,
	"llp" jsonb,
	"lat" double precision,
	"lng" double precision,
	"culture_blurb" text,
	"affiliated_primary_schools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dsa_talent_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"electives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sen_support" text,
	"schoolfinder_url" text,
	"source_last_updated" text,
	"datagov_accessed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cops" ADD CONSTRAINT "cops_school_code_schools_school_code_fk" FOREIGN KEY ("school_code") REFERENCES "public"."schools"("school_code") ON DELETE cascade ON UPDATE no action;