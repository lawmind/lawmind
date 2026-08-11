/**
 * Training-pair extraction — a **read-only** job over tables that already exist,
 * gated on consent, and deliberately **materialising nothing**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE DESIGN DECISION EVERYTHING ELSE FOLLOWS FROM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **No training pair is ever written to a durable table.** Pairs are generated
 * on demand from live rows and filtered by consent *at generation time*.
 *
 * That answers `LCC_MASTER_PLAN.md` B0.3 — *"if an advocate withdraws training
 * consent in month 8, must already-extracted pairs be deleted, or only future
 * capture stopped?"* — by making the question not arise. A materialised
 * `training_pairs` table would need a deletion job, that job would need to run
 * on every withdrawal, and the day it silently fails is the day we are
 * processing data somebody withdrew. **Withdrawal is retroactive here because
 * there is nothing to delete.**
 *
 * The cost is real and worth paying: every export re-runs the query. These are
 * thousands of rows, not millions, and correctness under DPDP s. 6(6) is worth
 * more than a cached extract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS IN SCOPE, AND WHAT IS NEVER IN SCOPE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * In scope — the advocate's own interactions with PUBLIC law:
 *
 *   searches.query_text        weak    what they looked for
 *   citation_checks            context what was shown, in what state
 *   citation_copies            STRONG  they took it to Word
 *   judgment_annotations       STRONGEST they saved it to a matter
 *
 * **Never in scope, at any consent level:**
 *
 *   documents / uploaded files   client documents
 *   matter notes                 privileged, third-party
 *   party names, matter titles   identify a client
 *
 * `LCC_MASTER_PLAN.md` B2.3: *"Never extract from uploaded client documents or
 * matter notes. Confidential third-party data; DPDP breach regardless of consent
 * wording."* **The advocate cannot consent to this on their client's behalf** —
 * the data is not theirs to give. {@link FORBIDDEN_SOURCES} names them and a
 * test asserts the query touches none of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODEL-AGNOSTIC AND VERSIONED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `TRAINING_STRATEGY.md` §1: pairs carry provenance and are **never coupled to a
 * chat template.** A pair records what happened, not how some 2026 model liked
 * its prompts formatted — templates change every few months and a dataset built
 * around one is worth nothing after it does.
 */
import type { Sql } from 'postgres';

/** Bumped when the SHAPE changes, so a dataset can say what produced it. */
export const PAIR_SCHEMA_VERSION = 'pairs-v1';

/**
 * Tables that must never appear in an extraction query. **Asserted by a test
 * against the SQL itself**, because a comment saying "do not join documents"
 * has never once stopped anybody from joining documents.
 */
export const FORBIDDEN_SOURCES = [
  'documents',
  'document_versions',
  'matter_notes',
  'matter_events',
  'ocr_jobs',
  'uploads',
] as const;

/**
 * What an advocate did, stripped to the part that is about public law.
 *
 * There is deliberately **no `userId`**. A pair carries the signal, not the
 * person: once consent is checked at generation time, the identity adds nothing
 * to the training value and everything to the harm if the file leaks.
 */
export type TrainingPair = {
  /** `search` | `copy` | `save` — what the advocate did. */
  signal: 'search' | 'copy' | 'save';
  /** Strength, so a trainer can weight rather than guess. save > copy > search. */
  weight: number;
  /**
   * What they typed. **Null for `copy` and `save`**, which are acts on a
   * judgment rather than a question.
   *
   * **This is free text an advocate wrote, and we do not claim it is clean.**
   * Search queries are public-class under `CLAUDE.md`'s routing, but an
   * advocate can type a client's name into a search box, and no filter here
   * catches that reliably. `CLAUDE.md`: *never claim complete PII removal —
   * coverage is partial, say so.* Any dataset built from these pairs inherits
   * that caveat and must carry it in writing.
   */
  query: string | null;
  /**
   * The judgment they acted on — an ID into our own corpus, never model output.
   * **Null for `search`**, which records a question that may have matched
   * nothing.
   */
  judgmentId: string | null;
  /** ISO timestamp of the interaction — provenance, not a sort key. */
  at: string;
  /** Which extractor produced this, so a bad run is identifiable later. */
  schemaVersion: string;
};

/**
 * Signal strength. `judgment_annotations` outranks `citation_copies` because
 * saving to a matter is a commitment and copying is a maybe.
 * `LCC_MASTER_PLAN.md` B2's table.
 */
export const SIGNAL_WEIGHT: Readonly<Record<TrainingPair['signal'], number>> = {
  save: 3,
  copy: 2,
  search: 1,
};

type RawRow = {
  signal: TrainingPair['signal'];
  query: string | null;
  judgment_id: string | null;
  at: string;
};

/**
 * **The consent filter is in the JOIN, not in application code.**
 *
 * A `WHERE` written in TypeScript after the rows come back is one early
 * `return` away from leaking, and the leak is invisible — the output simply has
 * more rows than it should, which is what a successful extraction also looks
 * like. Putting it in the SQL means an unconsented row **cannot be selected**.
 *
 * Both consent columns are checked, matching `hasConsent`: a half-set pair is
 * not consent.
 */
export const CONSENT_PREDICATE = `
  u.training_consent_at IS NOT NULL
  AND u.training_consent_version IS NOT NULL
`;

/**
 * The extraction query. Exported as a string so the forbidden-source test can
 * read the SQL that actually runs, rather than a copy of it that could drift.
 */
export const EXTRACTION_SQL = `
  SELECT 'search'::text AS signal,
         s.query_text AS query,
         NULL::text AS judgment_id,
         to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
    FROM searches s
    JOIN users u ON u.id = s.user_id
   WHERE ${CONSENT_PREDICATE}

  UNION ALL

  SELECT 'copy'::text AS signal,
         NULL::text AS query,
         cc.judgment_id::text AS judgment_id,
         to_char(cc.copied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
    FROM citation_copies cc
    JOIN users u ON u.id = cc.user_id
   WHERE ${CONSENT_PREDICATE}

  UNION ALL

  SELECT 'save'::text AS signal,
         NULL::text AS query,
         ja.judgment_id::text AS judgment_id,
         to_char(ja.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
    FROM judgment_annotations ja
    JOIN users u ON u.id = ja.user_id
   WHERE ${CONSENT_PREDICATE}
     AND ja.deleted_at IS NULL
`;

/**
 * Generate pairs for every consenting advocate. **Read-only** — this function
 * contains no INSERT, and the test asserts that too.
 *
 * A pair with no usable query text is dropped rather than emitted with an empty
 * string: an empty query is not a training signal, it is a hole that a trainer
 * would silently learn from.
 */
export async function extractPairs(sql: Sql): Promise<TrainingPair[]> {
  const rows = await sql.unsafe<RawRow[]>(EXTRACTION_SQL);

  return rows.flatMap((r) => {
    const query = r.query === null ? null : r.query.trim();

    /**
     * A row that carries neither a question nor a judgment is not a signal —
     * it is a hole, and a trainer would learn from it silently. Dropped rather
     * than emitted with an empty string, which is the same mistake wearing a
     * type that satisfies the compiler.
     */
    const hasQuestion = query !== null && query.length > 0;
    const hasJudgment = r.judgment_id !== null;
    if (!hasQuestion && !hasJudgment) return [];

    return [
      {
        signal: r.signal,
        weight: SIGNAL_WEIGHT[r.signal],
        query: hasQuestion ? query : null,
        judgmentId: r.judgment_id,
        at: r.at,
        schemaVersion: PAIR_SCHEMA_VERSION,
      },
    ];
  });
}
