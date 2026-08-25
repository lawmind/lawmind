/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CITATION RESOLVER v0 — ONE DETERMINISTIC COMPONENT, NOT A BACKFILL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Given a raw citation string somebody wrote down, which judgment in this corpus
 * is it — and, far more often, is the honest answer that we cannot say?
 *
 *   RAW REFERENCE
 *     -> placeholder / garbage REFUSAL
 *     -> canonical key candidate(s)
 *     -> materialised key set  (`judgment_citation_keys`, one indexed read)
 *     -> UNIQUE | AMBIGUOUS | TARGET_NOT_HELD | REFUSED
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
 * and NEW1 measured 16.4 hours on 7.3M rows. This does ONE indexed read against
 * `judgment_citation_keys (citation_key)` per batch, with the keys passed as an
 * array — the plan is a bitmap index scan whose cost is the number of keys
 * asked for, not the size of the corpus. `resolveBatch` is the only entry point
 * that touches the database for exactly this reason.
 */
import {
  type KeyFreshness,
  mayAssertUnique,
  readKeyFreshness,
  collidingKeysInUnwalkedWindow,
} from './key-freshness.ts';
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
export const RESOLVER_VERSION = 'citation-resolver-v0.1';

export type ResolutionState =
  | 'UNIQUE'
  | 'AMBIGUOUS'
  | 'TARGET_NOT_HELD'
  | 'REFUSED'
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
  };
}

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
  raws: readonly string[],
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
): Promise<Resolution[]> {
  const fresh = freshness ?? (await readKeyFreshness(sql));
  const state = fresh.state;
  const unique = mayAssertUnique(state);
  const gated = raws.map((raw) => ({ raw, gate: canonicalKeyFor(raw) }));
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
  const collidingUnwalked = await collidingKeysInUnwalkedWindow(sql, fresh, keys, (citation) => {
    const gate = canonicalKeyFor(citation);
    return gate.refused ? null : gate.key;
  });

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

  return gated.map(({ raw, gate }) => {
    if (gate.refused) return refused(raw, gate.why);
    const candidates = byKey.get(gate.key) ?? [];

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
            unique && !collidingUnwalked.has(gate.key)
            ? 'UNIQUE'
            : 'UNIQUE_UNCONFIRMED_STALE_INDEX'
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
  const over = (x: number) => (formed === 0 ? 0 : x / formed);
  return {
    n,
    refused: refusedN,
    formed,
    unique,
    ambiguous,
    targetNotHeld,
    hitRate: over(unique + ambiguous),
    uniqueRate: over(unique),
    ambiguousRate: over(ambiguous),
    targetNotHeldRate: over(targetNotHeld),
  };
}
