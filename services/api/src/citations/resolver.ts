/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CITATION RESOLVER v0 — ONE DETERMINISTIC COMPONENT, NOT A BACKFILL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Given a raw citation string somebody wrote down, which judgment in this corpus
 * is it — and, far more often, is the honest answer that we cannot say?
 *
 *   RAW REFERENCE  (+ the citing judgment, where the caller knows it)
 *     -> placeholder / garbage REFUSAL
 *     -> canonical key candidate(s)
 *     -> materialised key set  (`judgment_citation_keys`, one indexed read)
 *     -> the citer itself claims the key?          SELF_REFERENCE
 *     -> UNIQUE | AMBIGUOUS | TARGET_NOT_HELD | REFUSED
 *        with UNIQUE withheld as UNIQUE_UNCONFIRMED_STALE_INDEX (the index has
 *        not read everything) or UNIQUE_UNCONFIRMED_COHORT (the corpus does not
 *        hold everything the court said it decided together)
 *
 * Nothing here writes to the corpus. It answers a question; a caller decides
 * what to do with the answer, and this round no caller backfills anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A RESOLVED CITATION IS NOT A LEGAL TREATMENT. THIS IS THE LOAD-BEARING RULE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `A cites B` establishes that A printed B's citation. It establishes NOTHING
 * about whether A followed, relied on, distinguished, doubted, approved,
 * overruled or set aside B. Those are separate systems with separate evidence,
 * and every result from this module therefore carries
 * `relationship: 'UNKNOWN'` as a value rather than as an omission.
 *
 * The consequence that matters commercially: **resolver coverage going up must
 * never make currentness coverage go up.** If 100,000 more references resolve
 * tomorrow, LawMind knows 100,000 more pointers and exactly zero more facts
 * about whether any authority is still good law. Anyone quoting an improvement
 * here as an improvement there is quoting the wrong number, and
 * `verifiedTreatmentEligible` below is false on every result so that the mistake
 * has to be made deliberately.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AMBIGUITY IS AN ANSWER, AND IT IS USUALLY THE COURTS' DOING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 measured it (bus 1019/1020): shared neutral citations are overwhelmingly
 * legitimate court structure, not extractor corruption. `2025:PHHC:052490-DB` is
 * 253 connected writ petitions disposed of by one common order, every PDF
 * printing that citation on line 1. A neutral citation identifies a DISPOSAL
 * EVENT, not a judgment.
 *
 * So `AMBIGUOUS` is returned with every candidate, and three things are
 * explicitly forbidden:
 *
 *   - folding an Allahabad bench ambiguity down to one judgment
 *   - choosing the NEWEST candidate, or the longest, or the one with a title
 *   - returning UNIQUE because only one candidate happened to be held
 *
 * The last is the subtle one. A key with one row in `judgment_citation_keys` is
 * one judgment WE HOLD claiming that citation — it is not proof that only one
 * judgment in India bears it. That is why `TARGET_NOT_HELD` and `UNIQUE` are
 * different states and why `UNIQUE` carries `heldCandidates: 1` rather than a
 * claim of uniqueness in the world.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER A CORRELATED FUNCTION SCAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The predecessor materialised `judgments × unnest(reporter_citations)` per run
 * and NEW1 measured 16.4 hours on 7.3M rows. The identity read here is ONE
 * indexed read against `judgment_citation_keys (citation_key)` per batch, with
 * the keys passed as an array — the plan is a bitmap index scan whose cost is
 * the number of keys asked for, not the size of the corpus. `resolveBatch` is
 * the only entry point that touches the database for exactly this reason.
 *
 * **It is no longer one query, and pretending otherwise would be the kind of
 * stale comment this file exists to avoid.** A batch issues, at most, four
 * bounded reads: the key lookup, the unwalked-window check, the dirty-work
 * check, and — only for references that would otherwise be told they are the
 * only one — a primary-key read of those candidates' first
 * {@link CAUSE_TITLE_CHARS} characters. Every one is bounded by the BATCH, none
 * by the corpus, and the first three are skipped outright on a healthy index.
 * Measured 31 August 2026 on a quiet box: 20,000 references in 2,971 ms, 149 ms
 * per 1,000, against 180 ms per 1,000 on a 1,500-reference window.
 */
import {
  type KeyFreshness,
  mayAssertUnique,
  readKeyFreshness,
  collidingKeysInUnwalkedWindow,
} from './key-freshness.ts';
import { dirtyKeysBlockingUnique } from './citation-key-dirty.ts';
import { CAUSE_TITLE_CHARS, type CohortVerdict, cohortVerdict, declaredCohort } from './cohort.ts';
import type { Sql } from 'postgres';

import { citationLookupKey } from '../search/query-shape.ts';

/**
 * Bump on ANY change to refusal rules, key generation or classification.
 *
 * Stored beside every result the caller persists, so a later audit can ask "what
 * did v0.1 say about this reference" rather than re-deriving it against whatever
 * the rules have become. A resolver whose output cannot be dated is a resolver
 * whose mistakes cannot be scoped.
 */
export const RESOLVER_VERSION = 'citation-resolver-v0.2';

export type ResolutionState =
  | 'UNIQUE'
  | 'AMBIGUOUS'
  | 'TARGET_NOT_HELD'
  | 'REFUSED'
  /**
   * The only judgment claiming this key is the judgment that printed it.
   *
   * A judgment prints its own neutral citation in its own header; the extractor
   * makes a row of it. `citations-cli.ts` already declines to pin that row
   * (`target !== judgment.id ? target : null`) and `schema.ts` keeps it
   * unresolved for coverage. Both are right. What was wrong is that THIS module
   * took a bare string with no idea who wrote it, so any later sweep built on it
   * pinned the judgment to itself — NEW2 counted 1,003,733 such rows, 39.2% of
   * the R14 apply candidate (bus 1622).
   *
   * The identity is correct and the EDGE is nonsense: it corrupts no case
   * identity and wrecks every "how many judgments cite X" count in the product,
   * including the citator the retention moat is built on. A separate state, not
   * a refusal, because nothing was wrong with the reference — it is simply not
   * an edge.
   *
   * **`candidates` is empty even where OTHER judgments claim the key.** Those
   * others are the citer's connected matters under one common order, not
   * something it cited, and offering them would replace one false pin with a
   * subtler one. Nothing is offered, so nothing can be pinned by a careless
   * consumer.
   */
  | 'SELF_REFERENCE'
  /**
   * Exactly one candidate, and the court's own cause title declares siblings we
   * do not hold.
   *
   * A neutral citation identifies a DISPOSAL EVENT. Where a common order
   * disposes of several connected matters, every one of them bears the same
   * citation, and until all of them have been ingested a single claimant is the
   * only one that has LANDED rather than the only one that EXISTS. See
   * `cohort.ts` for the mechanism and the measurement.
   *
   * Distinct from `UNIQUE_UNCONFIRMED_STALE_INDEX` because the remedies are
   * different: that one clears when the index catches up with ingest, this one
   * clears when the sibling is acquired. Collapsing them would hide an
   * acquisition gap inside an indexing metric.
   *
   * A consumer must handle it, on the same terms as the stale-index state:
   * enrichment fails closed, a UI shows the candidate WITHOUT the claim of
   * uniqueness, and **it must never be widened back to `UNIQUE` by anything
   * downstream.** Widening it would restore exactly the 226 wrong pins the gate
   * exists to prevent.
   */
  | 'UNIQUE_UNCONFIRMED_COHORT'
  /**
   * Exactly one candidate was found, and the index is too far behind ingest for
   * that to mean "exactly one exists".
   *
   * A separate state rather than a downgrade to AMBIGUOUS, because AMBIGUOUS is
   * a claim — "we hold more than one" — and we do not hold more than one. What
   * we have is one candidate and no right to call it the only one. NEW2 measured
   * what happens when those are conflated: 33,013 shared-neutral groups answered
   * UNIQUE with total confidence from an index 309,130 citations behind.
   *
   * A consumer must handle it. Enrichment should fail closed on it; a UI should
   * show the candidate WITHOUT the claim of uniqueness. It must never be widened
   * back to UNIQUE by anything downstream.
   */
  | 'UNIQUE_UNCONFIRMED_STALE_INDEX';

export type ResolverCandidate = {
  readonly judgmentId: string;
  readonly source: 'neutral' | 'reporter' | 'alias';
  /** The corpus-side string that produced the matching key. Never the input. */
  readonly sourceText: string;
};

/**
 * A reference, and — where the caller knows it — WHO PRINTED IT.
 *
 * A bare string is still accepted, because most callers ask "what is this
 * citation" with no citing document in hand. But a sweep over
 * `judgment_citations` always knows, and passing the id is what lets the
 * resolver decline to pin a judgment to itself. `selfExcluded` on the result
 * reports which of the two happened, so a sweep that forgot to pass it is
 * visible in its own output instead of in a million rows a fortnight later.
 */
export type ResolverReference = {
  readonly raw: string;
  readonly citingJudgmentId?: string | null;
};

export type CohortEvidence = {
  readonly verdict: CohortVerdict;
  /** Distinct matters the candidate's cause title names. 0 when unreadable. */
  readonly declaredMatters: number;
  /** The conjunction the court printed between them, or null. */
  readonly connector: string | null;
};

export type Resolution = {
  /** The input, byte for byte. Never normalised in place, never discarded. */
  readonly raw: string;
  readonly state: ResolutionState;
  /** The canonical key actually looked up. Null when the reference was refused. */
  readonly key: string | null;
  /** Every candidate. One for UNIQUE, two or more for AMBIGUOUS, none otherwise. */
  readonly candidates: readonly ResolverCandidate[];
  /** How many judgments WE HOLD claim this key. Not a claim about the world. */
  readonly heldCandidates: number;
  /** Why, on REFUSED. Null otherwise. */
  readonly refusedReason: string | null;
  readonly version: string;
  /**
   * Always `'UNKNOWN'`. A citation edge says A printed B's citation and nothing
   * about what A did with it. Present as a VALUE so a consumer must handle it.
   */
  readonly relationship: 'UNKNOWN';
  /**
   * Always false. Resolution is not evidence of treatment, so nothing here may
   * be promoted into `judgment_citations` as a verified relationship or counted
   * toward currentness coverage.
   */
  readonly verifiedTreatmentEligible: false;
  /**
   * True when the citing judgment was dropped from its own candidate list.
   *
   * False on a bare string means "no citing context was supplied", NOT "nothing
   * was dropped" — the two are indistinguishable to a consumer and the second
   * would be a lie.
   */
  readonly selfExcluded: boolean;
  /**
   * What the candidate's own cause title said. Null wherever the gate was not
   * reached: a refusal, a target we do not hold, an already-ambiguous key, or a
   * single candidate the earlier freshness gates had already stopped.
   */
  readonly cohort: CohortEvidence | null;
};

/**
 * Strings that are not citations, and the reasons they exist.
 *
 * NEW2 found a large part of the 22M-row citation table is placeholders. A
 * resolver that tries to resolve them does two harmful things: it burns the
 * lookup on garbage, and — much worse — it occasionally MATCHES, because a
 * degenerate key like `NA` or `0` can collide with something real.
 */
const PLACEHOLDER_PATTERNS: readonly { readonly re: RegExp; readonly why: string }[] = [
  {
    re: /^(n\.?\s*a\.?|nil|none|null|not\s*available|not\s*applicable)$/i,
    why: 'placeholder token',
  },
  { re: /^(ibid|id\.?|supra|infra|op\.?\s*cit\.?)$/i, why: 'back-reference, not a citation' },
  { re: /^[\W_]+$/, why: 'punctuation only' },
  { re: /^0+$/, why: 'zeros only' },
  { re: /^(xxx+|\?+|-+|_+)$/i, why: 'redaction or fill character' },
];

/**
 * A key must contain at least one digit and at least one letter.
 *
 * Every real Indian citation form carries both — a year or a number, and a
 * reporter or court token. A key of digits alone (`2019`) or letters alone
 * (`SCC`) is a fragment, and a fragment is exactly the shape that produces a
 * confident wrong match against a short key in the table.
 */
const MIN_KEY_LENGTH = 5;
const MAX_KEY_LENGTH = 512; // the column's own CHECK; longer is extraction garbage

export type Refusal = { readonly refused: true; readonly why: string };
export type Accepted = { readonly refused: false; readonly key: string };

/**
 * A REGISTRY DESPATCH STAMP, not a citation. `2011:NOVEMBER:12`.
 *
 * NEW2 found these (bus 1112) as a REGRESSION my own citation-keys rebuild
 * caused. They sit in `judgments.neutral_citation` on 431 Madras judgments,
 * 165 distinct stamps, 2009-08-11 to 2012-03-02. Before the rebuild they carried
 * no key row, so the resolver answered `TARGET_NOT_HELD` and they were harmless.
 * The rebuild indexed `neutral_citation` wholesale and made them resolver
 * INPUTS — **75 of them now resolve to exactly one judgment each**, which is a
 * false pin, the one thing `CITATION_HARNESS.md` forbids outright.
 *
 * Every other rule waves it through: `2011NOVEMBER12` has digits, has letters,
 * and is far longer than {@link MIN_KEY_LENGTH}. Nothing about its SHAPE says
 * "not a citation" — only the month name does.
 *
 * **And the stamp is not even the judgment's date.** `2011:APRIL:05` keys a
 * judgment decided 2011-03-24; `2009:AUGUST:24` keys one decided 2009-08-11.
 * They are despatch or upload timestamps, so resolving one would not give the
 * right answer even by accident.
 *
 * Tested against the NORMALISED key rather than the raw string, because the
 * corpus writes them with colons and `PLACEHOLDER_PATTERNS` above runs before
 * normalisation. A pattern in that list would simply never have fired.
 */
const DESPATCH_STAMP_KEY =
  /^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$/;

/**
 * The refusal gate. **Pure** — no database, no clock, no network — so it can be
 * run over a million strings to estimate a batch before any query is issued.
 */
export function canonicalKeyFor(raw: string): Refusal | Accepted {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { refused: true, why: 'empty' };

  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.re.test(trimmed)) return { refused: true, why: p.why };
  }

  const key = citationLookupKey(trimmed);
  if (key.length < MIN_KEY_LENGTH) {
    return { refused: true, why: `key too short (${key.length} < ${MIN_KEY_LENGTH})` };
  }
  if (key.length > MAX_KEY_LENGTH) {
    return { refused: true, why: `key too long (${key.length} > ${MAX_KEY_LENGTH})` };
  }
  if (DESPATCH_STAMP_KEY.test(key)) {
    return { refused: true, why: 'registry despatch stamp, not a citation' };
  }
  if (!/[0-9]/.test(key)) return { refused: true, why: 'no digit — a citation carries a number' };
  if (!/[A-Z]/.test(key)) {
    return { refused: true, why: 'no letter — a bare number is not a citation' };
  }
  return { refused: false, key };
}

function refused(raw: string, why: string): Resolution {
  return {
    raw,
    state: 'REFUSED',
    key: null,
    candidates: [],
    heldCandidates: 0,
    refusedReason: why,
    version: RESOLVER_VERSION,
    relationship: 'UNKNOWN',
    verifiedTreatmentEligible: false,
    selfExcluded: false,
    cohort: null,
  };
}

/**
 * Read the cause title of each candidate judgment — the first
 * {@link CAUSE_TITLE_CHARS} characters, never the whole judgment.
 *
 * Injectable so the gate's failure mode is testable without arranging for a row
 * with no text. A stub returning an empty map is the "we could not read it"
 * case, and the gate must refuse on it rather than wave it through.
 */
export type ReadCauseTitles = (
  sql: Sql,
  judgmentIds: readonly string[],
) => Promise<Map<string, string>>;

const readCauseTitlesFromCorpus: ReadCauseTitles = async (sql, judgmentIds) => {
  if (judgmentIds.length === 0) return new Map();
  const rows = await sql<{ id: string; head: string }[]>`
    SELECT id, left(full_text, ${CAUSE_TITLE_CHARS}) AS head
      FROM judgments WHERE id = ANY(${judgmentIds}::uuid[])`;
  return new Map(rows.map((r) => [r.id, r.head]));
};

/**
 * Resolve a batch of raw references in ONE indexed read.
 *
 * A batch rather than a per-string call because the cost model demands it: one
 * query with 500 keys is one bitmap index scan; 500 queries are 500 round trips
 * plus 500 plans. Order is preserved, and every input produces exactly one
 * output — a caller can zip the arrays without matching on the string.
 */
export async function resolveBatch(
  sql: Sql,
  refs: readonly (string | ResolverReference)[],
  /**
   * The index's own freshness. Read once by the caller and passed in, rather
   * than read per batch — a resolver run walks thousands of batches and the
   * frontier does not move underneath it in a way that matters.
   *
   * OMITTING IT READS THE FRESHNESS ITSELF. It does not default to "fresh": a
   * safety gate whose default is "off" is a gate that is off in exactly the code
   * path nobody remembered to update.
   */
  freshness?: KeyFreshness,
  /** See {@link ReadCauseTitles}. Defaults to reading the corpus. */
  readCauseTitles: ReadCauseTitles = readCauseTitlesFromCorpus,
): Promise<Resolution[]> {
  const fresh = freshness ?? (await readKeyFreshness(sql));
  const state = fresh.state;
  const unique = mayAssertUnique(state);
  const gated = refs.map((ref) => {
    const raw = typeof ref === 'string' ? ref : ref.raw;
    const citing = typeof ref === 'string' ? null : (ref.citingJudgmentId ?? null);
    return { raw, citing, gate: canonicalKeyFor(raw) };
  });
  const keys = [
    ...new Set(gated.filter((g) => !g.gate.refused).map((g) => (g.gate as Accepted).key)),
  ];

  if (keys.length === 0) {
    return gated.map((g) => refused(g.raw, (g.gate as Refusal).why));
  }

  /**
   * The per-key half of the freshness gate. See
   * `key-freshness.ts` §THE EXACT FRONTIER CHECK for the reproduction.
   *
   * `mayAssertUnique` answers a question about the CORPUS: has the index fallen
   * far enough behind that uniqueness is generally unsafe? This answers the
   * question about THIS citation: is there something in the unwalked window that
   * claims it? A single newly-ingested collision passes the first and fails the
   * second, which is exactly the window R7 §8 named and which was measured open.
   *
   * Skipped entirely when the frontier reports nothing unwalked, which is the
   * ordinary case, so a healthy index pays one boolean.
   */
  const keyOf = (citation: string) => {
    const gate = canonicalKeyFor(citation);
    return gate.refused ? null : gate.key;
  };

  const collidingUnwalked = await collidingKeysInUnwalkedWindow(sql, fresh, keys, keyOf);

  /**
   * THE THIRD GATE — migration `0087`, FIFTH bus 1313.
   *
   * The two gates above both reason about the region ABOVE the builder's
   * cursor. A keyset cursor is monotonic, so neither can see a judgment that
   * arrived, or changed, BELOW it — and FIFTH produced exactly that: a second
   * judgment claiming an existing unique citation, `created_at` one day under
   * the cursor, `lagRows: 0`, `because: []`, resolver `UNIQUE`.
   *
   * There is no threshold below zero, so the fix is not a wider bound. The
   * triggers on `judgments` record WHICH judgments the index does not reflect,
   * durably, and this asks whether any of them claims the key in hand. Empty on
   * a healthy system, and it refuses the CLAIM rather than the candidate: the
   * authority is still returned, the word "only" is not.
   */
  const dirtyBlocked = await dirtyKeysBlockingUnique(sql, keys, keyOf);

  /**
   * The one query. `= ANY($1)` over the indexed `citation_key`, and a hard LIMIT
   * so a pathological key shared by a quarter of a million connected petitions
   * cannot pull the whole group into memory — `heldCandidates` is counted
   * separately and stays exact even where the candidate list is truncated.
   */
  const rows = await sql<
    { citation_key: string; judgment_id: string; source: string; source_text: string }[]
  >`
    SELECT citation_key, judgment_id, source, source_text
      FROM judgment_citation_keys
     WHERE citation_key = ANY(${keys}::text[])`;

  const byKey = new Map<string, ResolverCandidate[]>();
  for (const r of rows) {
    const list = byKey.get(r.citation_key) ?? [];
    // DISTINCT on the judgment: one judgment can claim the same key through both
    // its neutral citation and a reporter citation, and counting it twice would
    // turn a UNIQUE resolution into a false AMBIGUOUS.
    if (!list.some((c) => c.judgmentId === r.judgment_id)) {
      list.push({
        judgmentId: r.judgment_id,
        source: r.source as ResolverCandidate['source'],
        sourceText: r.source_text,
      });
    }
    byKey.set(r.citation_key, list);
  }

  /**
   * PASS 1 — decide each reference's candidate list and whether the three
   * freshness gates leave `UNIQUE` on the table. Nothing is finalised yet,
   * because the fourth gate needs one more read and reading it per reference
   * would be a round trip per row.
   */
  const pass1 = gated.map(({ raw, citing, gate }) => {
    if (gate.refused) return { raw, gate } as const;
    const held = byKey.get(gate.key) ?? [];
    /**
     * THE SELF-EDGE. Decided per REFERENCE and not per key: two judgments in one
     * batch can print the same citation, and only one of them wrote it.
     *
     * **The citer claiming the key ends the question, however many others claim
     * it too.** Dropping only the citer and pinning what is left looks obvious
     * and is a false pin: `2026:JHHC:24297` has two bearers, so asked as the
     * first of them it would leave exactly one candidate — the connected
     * sibling — and assert "M.A. 134/2018 cites C.O. 9/2022". It does not. Both
     * matters printed the citation of the one common order that disposed of
     * both. The first cut of this round produced exactly that, on FIFTH's own
     * falsifier, which is why it is a test.
     */
    const selfExcluded = citing !== null && held.some((c) => c.judgmentId === citing);
    const candidates = selfExcluded ? [] : held;
    const freshnessAllowsUnique =
      unique && !collidingUnwalked.has(gate.key) && !dirtyBlocked.has(gate.key);
    return {
      raw,
      gate,
      candidates,
      selfExcluded,
      /** The fourth gate is only reached where one candidate could still be
       *  UNIQUE. A self-reference has no candidates, so it never gets here. */
      needsCauseTitle: candidates.length === 1 && freshnessAllowsUnique,
      freshnessAllowsUnique,
    } as const;
  });

  /**
   * THE FOURTH GATE — one further indexed read, by primary key, and only for the
   * references that would otherwise be told they are the only one. `cohort.ts`
   * carries the mechanism and the measurement; the cost model is unchanged
   * because this is bounded by the batch, not by the corpus, and a batch with no
   * would-be-UNIQUE reference issues no query at all.
   */
  const needTitles = [
    ...new Set(
      pass1
        .filter((p) => 'needsCauseTitle' in p && p.needsCauseTitle)
        .map((p) => (p as { candidates: ResolverCandidate[] }).candidates[0]!.judgmentId),
    ),
  ];
  const causeTitles = await readCauseTitles(sql, needTitles);

  return pass1.map((p) => {
    const { raw, gate } = p;
    if (gate.refused) return refused(raw, gate.why);
    const { candidates, selfExcluded, needsCauseTitle, freshnessAllowsUnique } = p as Extract<
      typeof p,
      { candidates: readonly ResolverCandidate[] }
    >;

    /**
     * The citing judgment was the ONLY claimant. Its own citation, printed in
     * its own header. Not an edge, and never a refusal — the reference is
     * perfectly well formed, it just does not point anywhere else.
     */
    if (selfExcluded) {
      return {
        raw,
        state: 'SELF_REFERENCE' as const,
        key: gate.key,
        candidates: [],
        heldCandidates: 0,
        refusedReason: null,
        version: RESOLVER_VERSION,
        relationship: 'UNKNOWN' as const,
        verifiedTreatmentEligible: false as const,
        selfExcluded: true,
        cohort: null,
      };
    }

    const cohort: CohortEvidence | null = needsCauseTitle
      ? (() => {
          const declaration = declaredCohort(causeTitles.get(candidates[0]!.judgmentId));
          return {
            verdict: cohortVerdict(declaration, candidates.length),
            declaredMatters: declaration.declaredMatters,
            connector: declaration.connector,
          };
        })()
      : null;

    /**
     * Three states, and the ordering of these branches is the whole safety
     * argument. Nothing picks a winner: a two-candidate key is AMBIGUOUS whether
     * the candidates are two benches of one court, two years of one reporter, or
     * two copies of one common order. Choosing among them needs evidence this
     * module does not have.
     */
    /**
     * Staleness can only ever HIDE a candidate; it can never invent one. So it
     * falsifies exactly one of these four answers.
     *
     * AMBIGUOUS already says "more than one, choose" — a hidden candidate makes
     * it more so. TARGET_NOT_HELD already says "we do not hold this". REFUSED
     * was decided before any lookup. Only UNIQUE makes a claim about the WHOLE
     * corpus from an index that has not read all of it, and only UNIQUE is
     * therefore gated.
     */
    const state: ResolutionState =
      candidates.length === 0
        ? 'TARGET_NOT_HELD'
        : candidates.length === 1
          ? /* Both gates must pass. The corpus-wide one says the index is not
             * broadly behind; the per-key one says nothing in the unwalked
             * window claims THIS citation. A collision small enough to slip
             * under the threshold is caught by the second. */
            /* Three gates now. The corpus-wide one says the index is not
             * broadly behind; the unwalked-window one says nothing ABOVE the
             * cursor claims THIS citation; the dirty-work one says nothing
             * BELOW it does either. The third is the only one that can see a
             * mutation or a backfill, which is the shape FIFTH falsified. */
            !freshnessAllowsUnique
            ? 'UNIQUE_UNCONFIRMED_STALE_INDEX'
            : /* FOUR gates now. The first three ask whether the INDEX has read
               * everything; this one asks whether the CORPUS holds everything
               * the court said it decided together. A cohort of two with one
               * landed passes all three of the others and is still not one
               * judgment. NEW2 measured 226 references this would have pinned
               * wrongly on 18 August (R14 §7). Two verdicts withhold the claim:
               * a declared sibling we do not hold, and a cause title we could
               * not read at all — the second because a gate that cannot see is
               * a gate that must not vouch. */
              cohort !== null && cohort.verdict !== 'UNIQUE_NOT_REFUTED'
              ? 'UNIQUE_UNCONFIRMED_COHORT'
              : 'UNIQUE'
          : 'AMBIGUOUS';

    return {
      raw,
      state,
      key: gate.key,
      // Candidates are returned in the order the index produced them, NOT sorted
      // by date. Sorting by `judgment_date DESC` here would make "the newest" the
      // first thing a careless consumer reads, which is the exact wrong answer.
      candidates,
      heldCandidates: candidates.length,
      refusedReason: null,
      version: RESOLVER_VERSION,
      relationship: 'UNKNOWN' as const,
      verifiedTreatmentEligible: false as const,
      selfExcluded,
      cohort,
    };
  });
}

export type ResolverMetrics = {
  readonly n: number;
  readonly refused: number;
  readonly formed: number;
  readonly unique: number;
  readonly ambiguous: number;
  readonly targetNotHeld: number;
  /**
   * The three states that used to be reported as `unique` and are not.
   *
   * **`uniqueRate` in any report older than `citation-resolver-v0.2` is not
   * comparable with one after it**, and the drop is not a regression: a
   * self-reference and a cohort with one member landed were both being counted
   * as a confident pin. Reported as absolutes beside the rates so the size of
   * the correction is visible rather than inferred from a moved percentage.
   */
  readonly selfReference: number;
  readonly uniqueUnconfirmedCohort: number;
  readonly uniqueUnconfirmedStaleIndex: number;
  /** Of the FORMED references — the denominator that answers "did the key work". */
  readonly hitRate: number;
  readonly uniqueRate: number;
  readonly ambiguousRate: number;
  readonly targetNotHeldRate: number;
};

/**
 * The measurement a bounded dry run reports.
 *
 * **Rates are over FORMED references, not over all of them.** Including refusals
 * in the denominator would let the resolver improve its own hit rate by refusing
 * more, which is the metric gaming this repository has already been caught by
 * once (`decided_brief` at 15.6% precision). `refused` is reported as its own
 * absolute count so nobody has to infer it.
 */
export function metricsFor(results: readonly Resolution[]): ResolverMetrics {
  const n = results.length;
  const refusedN = results.filter((r) => r.state === 'REFUSED').length;
  const formed = n - refusedN;
  const unique = results.filter((r) => r.state === 'UNIQUE').length;
  const ambiguous = results.filter((r) => r.state === 'AMBIGUOUS').length;
  const targetNotHeld = results.filter((r) => r.state === 'TARGET_NOT_HELD').length;
  const count = (s: ResolutionState) => results.filter((r) => r.state === s).length;
  const over = (x: number) => (formed === 0 ? 0 : x / formed);
  return {
    n,
    refused: refusedN,
    formed,
    unique,
    ambiguous,
    targetNotHeld,
    selfReference: count('SELF_REFERENCE'),
    uniqueUnconfirmedCohort: count('UNIQUE_UNCONFIRMED_COHORT'),
    uniqueUnconfirmedStaleIndex: count('UNIQUE_UNCONFIRMED_STALE_INDEX'),
    hitRate: over(unique + ambiguous),
    uniqueRate: over(unique),
    ambiguousRate: over(ambiguous),
    targetNotHeldRate: over(targetNotHeld),
  };
}
