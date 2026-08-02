CREATE TYPE "public"."case_type" AS ENUM('criminal', 'civil');--> statement-breakpoint
CREATE TYPE "public"."citation_surface" AS ENUM('search', 'judgment_detail', 'briefing', 'draft', 'matter');--> statement-breakpoint
CREATE TYPE "public"."data_class" AS ENUM('public', 'sensitive');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('bail', 'anticipatory_bail', 'plaint', 'written_statement', 'legal_notice', 'notice_reply', 'affidavit', 'vakalatnama', 'writ_petition', 'rti');--> statement-breakpoint
CREATE TYPE "public"."enrolment_status" AS ENUM('unverified', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('manual', 'vendor', 'ocr');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('hearing', 'order', 'filing', 'note');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'hi');--> statement-breakpoint
CREATE TYPE "public"."llm_feature" AS ENUM('search', 'draft', 'briefing', 'extract', 'ocr_postprocess');--> statement-breakpoint
CREATE TYPE "public"."matter_source" AS ENUM('manual', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."matter_status" AS ENUM('active', 'disposed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."new_act" AS ENUM('bns', 'bnss', 'bsa');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."old_act" AS ENUM('ipc', 'crpc', 'evidence');--> statement-breakpoint
CREATE TYPE "public"."our_side" AS ENUM('petitioner', 'respondent', 'accused', 'complainant', 'other');--> statement-breakpoint
CREATE TYPE "public"."overruled_status" AS ENUM('none', 'set_aside', 'partly_set_aside', 'doubted');--> statement-breakpoint
CREATE TYPE "public"."statute_relationship" AS ENUM('exact', 'split', 'merged', 'no_equivalent');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('none', 'practice', 'chamber', 'expert', 'firm', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('verified', 'unverified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."verified_by_source" AS ENUM('corpus', 'indiankanoon', 'aws_s3', 'public_x2', 'ecourts', 'none');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"hearing_date" date NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"content" jsonb NOT NULL,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "citation_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid,
	"document_id" uuid,
	"citation_claimed" text NOT NULL,
	"judgment_id_matched" uuid,
	"verification_state" "verification_state" NOT NULL,
	"verified_by_source" "verified_by_source" NOT NULL,
	"match_confidence" numeric(4, 3),
	"shown_to_user" boolean NOT NULL,
	"overruled_status_shown" text,
	"surface" "citation_surface",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"matter_id" uuid,
	"document_type" "document_type" NOT NULL,
	"input_params" jsonb NOT NULL,
	"generated_content" text NOT NULL,
	"language" "language" NOT NULL,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judgment_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judgment_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"token_count" integer NOT NULL,
	"ocr_confidence" numeric(4, 3)
);
--> statement-breakpoint
CREATE TABLE "judgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_title" text NOT NULL,
	"neutral_citation" text,
	"reporter_citations" text[] NOT NULL,
	"court" text NOT NULL,
	"bench" text,
	"judgment_date" date NOT NULL,
	"full_text" text NOT NULL,
	"language" "language" NOT NULL,
	"source_url" text NOT NULL,
	"overruled_status" "overruled_status" DEFAULT 'none' NOT NULL,
	"overruled_status_changed_at" timestamp with time zone,
	"overruled_by_judgment_id" uuid,
	"overruled_paras" integer[],
	"overruled_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"feature" "llm_feature" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"latency_ms" integer NOT NULL,
	"data_class" "data_class" NOT NULL,
	"pseudonymised" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matter_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"event_type" "event_type" NOT NULL,
	"order_text" text,
	"notes" text,
	"note_visibility" "note_visibility" DEFAULT 'private' NOT NULL,
	"source" "event_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_title" text NOT NULL,
	"cnr_number" text,
	"court" text NOT NULL,
	"case_type" "case_type" NOT NULL,
	"parties" jsonb NOT NULL,
	"client_name" text NOT NULL,
	"our_side" "our_side" NOT NULL,
	"next_hearing_date" date,
	"status" "matter_status" NOT NULL,
	"source" "matter_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"matter_id" uuid,
	"query_text" text NOT NULL,
	"query_language" "language" NOT NULL,
	"results_returned" integer NOT NULL,
	"model_used" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statute_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_act" "old_act" NOT NULL,
	"old_section" text NOT NULL,
	"new_act" "new_act" NOT NULL,
	"new_section" text NOT NULL,
	"relationship" "statute_relationship" NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_id" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"bar_enrolment_number" text,
	"enrolment_status" "enrolment_status" DEFAULT 'unverified' NOT NULL,
	"preferred_language" "language" DEFAULT 'en' NOT NULL,
	"subscription_tier" "subscription_tier" DEFAULT 'none' NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id")
);
--> statement-breakpoint
CREATE TABLE "verification_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"citation_text" text NOT NULL,
	"normalised_citation" text NOT NULL,
	"judgment_id" uuid,
	"verification_state" "verification_state" NOT NULL,
	"verified_by_source" "verified_by_source" NOT NULL,
	"match_confidence" numeric(4, 3),
	"confirmed_by_user_id" uuid,
	"raw_response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_judgment_id_matched_judgments_id_fk" FOREIGN KEY ("judgment_id_matched") REFERENCES "public"."judgments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_chunks" ADD CONSTRAINT "judgment_chunks_judgment_id_judgments_id_fk" FOREIGN KEY ("judgment_id") REFERENCES "public"."judgments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_overruled_by_judgment_id_judgments_id_fk" FOREIGN KEY ("overruled_by_judgment_id") REFERENCES "public"."judgments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_events" ADD CONSTRAINT "matter_events_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cache" ADD CONSTRAINT "verification_cache_judgment_id_judgments_id_fk" FOREIGN KEY ("judgment_id") REFERENCES "public"."judgments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cache" ADD CONSTRAINT "verification_cache_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_created_at_idx" ON "audit_log" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "briefings_matter_id_hearing_date_key" ON "briefings" USING btree ("matter_id","hearing_date");--> statement-breakpoint
CREATE INDEX "judgment_chunks_embedding_idx" ON "judgment_chunks" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "judgment_chunks_judgment_id_idx" ON "judgment_chunks" USING btree ("judgment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "judgment_chunks_judgment_id_chunk_index_key" ON "judgment_chunks" USING btree ("judgment_id","chunk_index");--> statement-breakpoint
CREATE INDEX "judgments_full_text_idx" ON "judgments" USING gin (to_tsvector('english', "full_text"));--> statement-breakpoint
CREATE INDEX "judgments_judgment_date_idx" ON "judgments" USING btree ("judgment_date");--> statement-breakpoint
CREATE INDEX "judgments_court_idx" ON "judgments" USING btree ("court");--> statement-breakpoint
CREATE INDEX "matters_user_id_next_hearing_date_idx" ON "matters" USING btree ("user_id","next_hearing_date");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_cache_normalised_citation_key" ON "verification_cache" USING btree ("normalised_citation");--> statement-breakpoint
CREATE INDEX "verification_cache_judgment_id_idx" ON "verification_cache" USING btree ("judgment_id");