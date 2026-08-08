-- Training consent — a SECOND, separate consent, and the reason it is separate
-- is the whole point of this migration.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY NOT REUSE THE PD-8 PAIR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `users.terms_accepted_at` / `terms_version` already exist and already record a
-- consent given once at onboarding. Hanging training off them would be one
-- column cheaper and completely wrong.
--
-- `TRAINING_STRATEGY.md`: *"Consent here is specific and separate from the PD-8
-- onboarding consent… Using an advocate's accepted drafts as training input is a
-- different question and gets its own answer."*
--
-- Under the **DPDP Act 2023 s. 6**, consent must be *free, specific, informed,
-- unconditional and unambiguous*, given **for a specified purpose**. A single
-- flag covering "the terms" and "you may learn from my work" is not specific to
-- either, and an advocate who accepted the first has not agreed to the second.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AN UNSET PAIR MEANS NO, AND THE SYSTEM MUST BE ABLE TO SEE THAT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Both columns are NULLable with **no default**, and null is the shipped state
-- for every existing row. There is deliberately no `boolean NOT NULL DEFAULT
-- false`, because that would make "never asked" and "asked and declined"
-- indistinguishable — and only one of those is worth asking about again.
--
-- Consent is therefore **never inferred from silence**. It exists only where a
-- timestamp and a version both sit in the row.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WITHDRAWAL, AND WHY THERE IS NO `training_consent_withdrawn_at`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- DPDP s. 6(6): on withdrawal the fiduciary must **cease processing** within a
-- reasonable time. The obvious schema answer is a third column recording the
-- withdrawal — and it is the wrong one, because it leaves two columns that can
-- disagree and a question ("granted in March, withdrawn in August, what about
-- the pairs emitted in May?") that has to be answered by application code
-- forever.
--
-- **Withdrawal sets both columns back to NULL.** The row returns to exactly the
-- state it had before consent, which is a state the rest of the system already
-- handles correctly. `training_consent_events` keeps the history, so nothing is
-- lost — but the *live* answer to "may we use this advocate's work" is one
-- column pair with two states, not three columns with six.
--
-- This is only safe because of a matching decision on the extraction side:
-- **no training pair is ever materialised into a durable table.** Pairs are
-- generated on demand from live rows, filtered by consent at generation time,
-- so withdrawal is retroactive by construction and needs no deletion job.
-- `services/api/src/training/extract.ts` states that and a test enforces it.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "training_consent_at" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "training_consent_version" text;

-- Both or neither. A timestamp without a version cannot be shown to anyone as
-- "here is what you agreed to", and a version without a timestamp is not a
-- consent at all. Enforced in the database because this is exactly the kind of
-- pair that drifts when only application code guards it.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "training_consent_complete";
ALTER TABLE "users" ADD CONSTRAINT "training_consent_complete" CHECK (
  ("training_consent_at" IS NULL) = ("training_consent_version" IS NULL)
);

-- The audit trail. Grants AND withdrawals, append-only, never updated.
--
-- This table is the reason the live columns can be reset to NULL without losing
-- anything: "did this advocate ever consent, and to what version, and when did
-- they change their mind" is answered here, by query, rather than by memory.
CREATE TABLE IF NOT EXISTS "training_consent_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'granted' | 'withdrawn'. Text with a check rather than an enum: this is not
  -- a value other tables join on, and an enum here buys a migration cost with
  -- no reader.
  "action" text NOT NULL CHECK ("action" IN ('granted', 'withdrawn')),
  -- The version consented to. NULL on withdrawal — you withdraw from whatever
  -- you had, and recording a version there would invent a fact.
  "version" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "training_consent_events_user_idx"
  ON "training_consent_events" ("user_id", "created_at" DESC);
