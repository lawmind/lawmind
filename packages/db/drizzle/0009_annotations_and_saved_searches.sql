CREATE TABLE IF NOT EXISTS "judgment_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"judgment_id" uuid NOT NULL,
	"matter_id" uuid,
	-- What the court PRINTED. Null where the source carries no numbering, which
	-- is every pre-1990s OCR'd scan. This is the citable anchor.
	"paragraph_number" integer,
	-- Position in the rendered array. Always present, never citable. Kept only so
	-- an annotation on an unnumbered judgment still has somewhere to land.
	"paragraph_index" integer NOT NULL,
	"quote" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "judgment_annotations"
	ADD CONSTRAINT "judgment_annotations_user_fk"
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "judgment_annotations"
	ADD CONSTRAINT "judgment_annotations_judgment_fk"
	FOREIGN KEY ("judgment_id") REFERENCES "judgments"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "judgment_annotations"
	ADD CONSTRAINT "judgment_annotations_matter_fk"
	FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "judgment_annotations_user_judgment_idx"
	ON "judgment_annotations" ("user_id", "judgment_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "judgment_annotations_matter_idx"
	ON "judgment_annotations" ("matter_id") WHERE "matter_id" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"query_language" text DEFAULT 'en' NOT NULL,
	"filters" jsonb,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "saved_searches_language_check" CHECK ("query_language" IN ('en','hi'))
);
--> statement-breakpoint
ALTER TABLE "saved_searches"
	ADD CONSTRAINT "saved_searches_user_fk"
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_searches_user_idx"
	ON "saved_searches" ("user_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
-- `last_seen_at` is what makes the feed a feed: results newer than it are unseen.
-- There is deliberately no `notified_at` and no delivery state, because PD-5
-- excludes subject-following alerts from notifications entirely. A column for it
-- would invite one.
CREATE INDEX IF NOT EXISTS "saved_searches_last_seen_idx"
	ON "saved_searches" ("user_id", "last_seen_at") WHERE "deleted_at" IS NULL;
