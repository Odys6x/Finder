CREATE TABLE "commute_cache" (
	"origin_key" text NOT NULL,
	"school_code" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commute_cache_origin_key_school_code_pk" PRIMARY KEY("origin_key","school_code")
);
