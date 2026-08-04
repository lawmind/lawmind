CREATE TABLE "statute_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statute_id" uuid NOT NULL,
	"section_number" text NOT NULL,
	"heading" text,
	"section_text" text NOT NULL,
	"footnote" text,
	"order_index" integer NOT NULL,
	"source_url" text NOT NULL,
	"full_text_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("heading", '') || ' ' || "section_text")) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"act_id" text NOT NULL,
	"short_title" text NOT NULL,
	"hindi_title" text,
	"act_number" text NOT NULL,
	"act_year" integer NOT NULL,
	"enactment_date" date,
	"enforcement_date" date,
	"ministry" text,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statutes_act_id_unique" UNIQUE("act_id")
);
--> statement-breakpoint
ALTER TABLE "statute_sections" ADD CONSTRAINT "statute_sections_statute_id_statutes_id_fk" FOREIGN KEY ("statute_id") REFERENCES "public"."statutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "statute_sections_statute_id_section_number_key" ON "statute_sections" USING btree ("statute_id","section_number");--> statement-breakpoint
CREATE INDEX "statute_sections_full_text_idx" ON "statute_sections" USING gin ("full_text_tsv");--> statement-breakpoint
CREATE INDEX "statute_sections_statute_id_order_idx" ON "statute_sections" USING btree ("statute_id","order_index");