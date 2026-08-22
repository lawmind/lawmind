/**
 * `pnpm --filter @lawmind/harness title:decompose` — WHY a case-name query
 * returns a different case at rank 1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHY IT IS NOT ANOTHER BENCHMARK RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `launch:bench` already measured the OUTCOME: case_title s@1 67.69%, s@5
 * 71.62%, 65 wrong pins, 56 retrieval misses, 9 timeouts (229 queries, frozen
 * gold `ba9357cba2fbf297`, 22 Aug 2026). An outcome number cannot say WHICH of
 * the seven decision points in `retrieve.ts`'s case-name path threw the query
 * away, and the prompt is explicit that the failure FAMILY must be identified
 * before any scoring is touched.
 *
 * So this walks the SAME decision points, in the SAME order, per query, and
 * records what each one decided:
 *
 *   1. `classifyQuery` — does `CASE_NAME_RE` (`\S+\s+(?:v|vs|versus)\.?\s+\S+`)
 *      even fire? If it does not, `caseNamePins` is NEVER CALLED and the query
 *      is answered by the ordinary dense+sparse pipeline. That is a routing
 *      fact, not a ranking one, and it is invisible in the outcome number.
 *   2. `exactCaseTitle` — whole normalised query = whole normalised title.
 *      Counted, not just tested: the function takes `LIMIT 2` and returns null
 *      unless EXACTLY ONE row matches, so a title printed twice in the corpus
 *      DISABLES the exact path. That is the `multiple orders for the same
 *      matter` family the prompt names, and it can only be seen by counting.
 *   3. `rarestToken` — the token the ILIKE will ride, computed here with the
 *      SAME stemming the fixed function uses (`to_tsvector('english', word)`,
 *      first lexeme, stopwords DROPPED).
 *   4. `ILIKE '%token%'` — does the GOLD judgment's own title contain that
 *      token at all? If not, gold is not in the candidate set and no threshold
 *      or ordering change downstream can ever recover it.
 *   5. `word_similarity(query, gold.case_title) >= 0.65` — gold's own score
 *      against the pin floor, recorded as a NUMBER so the floor can be argued
 *      with evidence instead of taste.
 *   6. The probe as production runs it (ILIKE + floor + ORDER BY ws DESC),
 *      under production's own `CASE_TITLE_BUDGET_MS = 2500`, recording gold's
 *      rank within it, the top hit, and whether the budget expired.
 *   7. Is the top hit THE SAME MATTER as gold — same normalised title, or the
 *      same case number? A different order in the same case is not the same
 *      error as another party's case, and grading them together is what makes
 *      "71.6%" unreadable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No embedding, no `/search`, no dense arm, no fusion. Every question above is
 * answerable from `judgments` and the trigram index alone, and adding the full
 * pipeline would (a) cost ~20s per query under LOCAL_CONTENDED and (b) mix the
 * pin decision with the ranker's, which is exactly the confusion this exists to
 * remove. The full-pipeline number already exists — that is `launch:bench`.
 *
 * Nothing here writes. Read-only, `max = 2` connections, every statement
 * budgeted, checkpointed per row so a kill costs one query and not the run
 * (`long-jobs-must-checkpoint-their-artifact`).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import { openDb } from '@lawmind/ingest/db-host';

import { buildLaunchGold } from './launch-gold.js';

/** Copies of `retrieve.ts` constants — a copy, not an import, so a server-lane edit cannot silently retune this instrument. */
const CASE_TITLE_BUDGET_MS = 2500;
const CASE_TITLE_MIN_SIMILARITY = 0.65;
/** `query-shape.ts` `CASE_NAME_RE`, verbatim. */
const CASE_NAME_RE = /\S+\s+(?:v|vs|versus)\.?\s+\S+/i;
/** `retrieve.ts` calls `caseNamePins(..., Math.floor(limit / 2))`; production `limit` is 5 → 2. */
const PIN_LIMIT = 2;
/** How deep the probe is inspected. Larger than PIN_LIMIT on purpose: a gold at probe rank 3 that the pin limit cut is a DIFFERENT finding from a gold the probe never contained. */
const PROBE_DEPTH = 20;

const OUT = new URL('../../../docs/ai/new1-tier-a/case-title-decomposition.json', import.meta.url);
const CKPT = new URL('../../../docs/ai/new1-tier-a/case-title-decomposition.checkpoint.jsonl', import.meta.url);

type Row = {
  queryId: string;
  query: string;
  goldId: string;
  /** Step 1 */
  shapeIsCaseName: boolean;
  /** Step 2 */
  goldTitle: string | null;
  goldCourt: string | null;
  goldDate: string | null;
  goldCaseNumber: string | null;
  normalisedTitleMatches: number | null;
  exactPathFires: boolean;
  exactPathHitsGold: boolean;
  /** Step 3 */
  rarestToken: string | null;
  droppedStopwords: string[];
  /** Step 4 */
  goldTitleContainsToken: boolean | null;
  /** Step 5 */
  goldWordSimilarity: number | null;
  goldClearsFloor: boolean | null;
  /** Step 6 */
  probeTimedOut: boolean;
  probeMs: number;
  probeSize: number;
  goldRankInProbe: number | null;
  topHitId: string | null;
  topHitTitle: string | null;
  topHitScore: number | null;
  topHitCaseNumber: string | null;
  /** Step 7 */
  topHitSameMatter: boolean | null;
  /** The verdict */
  family: string;
  pinnedId: string | null;
  pinIsGold: boolean;
};

/**
 * The earliest decision that lost the query, named.
 *
 * Ordered EARLIEST-CAUSE-WINS: a query whose gold title does not contain the
 * chosen token is a TOKEN family failure even though it would also have failed
 * the similarity floor, because fixing the floor could not have saved it.
 */
function classify(r: Row): string {
  if (!r.shapeIsCaseName) return 'NOT_ROUTED_TO_CASE_NAME';
  if (r.goldTitle === null) return 'GOLD_NOT_HELD';
  if (r.pinIsGold) return 'OK_PINNED_GOLD';
  if (r.exactPathFires && !r.exactPathHitsGold) return 'EXACT_PATH_PINNED_A_TWIN';
  if ((r.normalisedTitleMatches ?? 0) > 1) return 'EXACT_PATH_DISABLED_BY_DUPLICATE_TITLE';
  if (r.rarestToken === null) return 'NO_TOKEN_ALL_WORDS_SHORT_OR_STOPWORDS';
  if (r.goldTitleContainsToken === false) return 'TOKEN_NOT_IN_GOLD_TITLE';
  if (r.probeTimedOut) return 'BUDGET_EXCEEDED';
  if (r.goldClearsFloor === false) return 'GOLD_BELOW_SIMILARITY_FLOOR';
  if (r.goldRankInProbe === null) return 'GOLD_ABSENT_FROM_PROBE_UNEXPLAINED';
  if (r.topHitSameMatter === true) return 'SAME_MATTER_DIFFERENT_DOCUMENT';
  if (r.goldRankInProbe > PIN_LIMIT) return 'GOLD_OUTRANKED_WITHIN_PROBE';
  return 'OTHER';
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');

  const gold = buildLaunchGold().rows.filter((r) => r.launchClass === 'case_title');
  const done = new Set<string>();
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      done.add((JSON.parse(line) as Row).queryId);
    }
  }
  process.stdout.write(`case_title gold ${gold.length}, already done ${done.size}\n`);

  const sql = await openDb(url, 2, 30_000);
  const rows: Row[] = [];
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (line.trim().length !== 0) rows.push(JSON.parse(line) as Row);
    }
  }

  let n = 0;
  for (const g of gold) {
    n += 1;
    if (done.has(g.queryId)) continue;

    const q = g.query;
    const r: Row = {
      queryId: g.queryId,
      query: q,
      goldId: g.goldAuthorityId,
      shapeIsCaseName: CASE_NAME_RE.test(q),
      goldTitle: null,
      goldCourt: null,
      goldDate: null,
      goldCaseNumber: null,
      normalisedTitleMatches: null,
      exactPathFires: false,
      exactPathHitsGold: false,
      rarestToken: null,
      droppedStopwords: [],
      goldTitleContainsToken: null,
      goldWordSimilarity: null,
      goldClearsFloor: null,
      probeTimedOut: false,
      probeMs: 0,
      probeSize: 0,
      goldRankInProbe: null,
      topHitId: null,
      topHitTitle: null,
      topHitScore: null,
      topHitCaseNumber: null,
      topHitSameMatter: null,
      family: 'PENDING',
      pinnedId: null,
      pinIsGold: false,
    };

    // ── Step 2: the gold row itself, and how many judgments share its title ──
    const goldRow = await sql<
      { case_title: string; court: string | null; judgment_date: string | null; case_number: string | null }[]
    >`SELECT case_title, court, judgment_date::text AS judgment_date, case_number
        FROM judgments WHERE id = ${g.goldAuthorityId}`;
    if (goldRow.length === 1) {
      r.goldTitle = goldRow[0]!.case_title;
      r.goldCourt = goldRow[0]!.court;
      r.goldDate = goldRow[0]!.judgment_date;
      r.goldCaseNumber = goldRow[0]!.case_number;
    }

    if (r.goldTitle !== null) {
      // `exactCaseTitle`'s predicate, COUNTED rather than LIMIT 2'd, so a
      // disabled exact path is distinguishable from an absent one.
      const exact = await sql<{ id: string }[]>`
        SELECT j.id FROM judgments j
         WHERE lower(btrim(regexp_replace(j.case_title, '\\s+', ' ', 'g'))) =
               lower(btrim(regexp_replace(${q}, '\\s+', ' ', 'g')))
         LIMIT 5`;
      r.normalisedTitleMatches = exact.length;
      r.exactPathFires = exact.length === 1;
      r.exactPathHitsGold = exact.length === 1 && exact[0]!.id === g.goldAuthorityId;

      // ── Step 3: rarestToken, with the SAME stemming the fixed code uses ──
      const words = [
        ...new Set(
          q
            .toUpperCase()
            .replace(/[^A-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 4),
        ),
      ];
      if (words.length > 0) {
        const freq = await sql<{ word: string; lexeme: string | null; document_count: string | null }[]>`
          WITH w(word) AS (SELECT unnest(${words}::text[]))
          SELECT w.word, l.lexeme, f.document_count
            FROM w
            LEFT JOIN LATERAL (
              SELECT lexeme FROM unnest(to_tsvector('english', w.word)) AS lexeme LIMIT 1
            ) l ON TRUE
            LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme`;
        let best: string | null = null;
        let bestDf = Number.POSITIVE_INFINITY;
        for (const row of freq) {
          if (row.lexeme === null) {
            r.droppedStopwords.push(row.word);
            continue;
          }
          const df = row.document_count === null ? 0 : Number(row.document_count);
          if (df < bestDf) {
            bestDf = df;
            best = row.word;
          }
        }
        r.rarestToken = best;
      }

      // ── Steps 4 and 5: is gold even a candidate, and what does it score? ──
      if (r.rarestToken !== null) {
        const g45 = await sql<{ contains: boolean; ws: number }[]>`
          SELECT (case_title ILIKE ${'%' + r.rarestToken + '%'}) AS contains,
                 word_similarity(${q}, case_title) AS ws
            FROM judgments WHERE id = ${g.goldAuthorityId}`;
        if (g45.length === 1) {
          r.goldTitleContainsToken = g45[0]!.contains;
          r.goldWordSimilarity = Number(g45[0]!.ws);
          r.goldClearsFloor = r.goldWordSimilarity >= CASE_TITLE_MIN_SIMILARITY;
        }

        // ── Step 6: the probe, exactly as production runs it, same budget ──
        const t0 = Date.now();
        try {
          const probe = await sql.begin(async (tx) => {
            await tx.unsafe(`SET LOCAL statement_timeout = ${CASE_TITLE_BUDGET_MS}`);
            return await tx<{ id: string; case_title: string; ws: number; case_number: string | null }[]>`
              SELECT j.id, j.case_title, word_similarity(${q}, j.case_title) AS ws, j.case_number
                FROM judgments j
               WHERE j.case_title ILIKE ${'%' + r.rarestToken + '%'}
                 AND word_similarity(${q}, j.case_title) >= ${CASE_TITLE_MIN_SIMILARITY}
               ORDER BY word_similarity(${q}, j.case_title) DESC
               LIMIT ${PROBE_DEPTH}`;
          });
          r.probeMs = Date.now() - t0;
          r.probeSize = probe.length;
          const at = probe.findIndex((p) => p.id === g.goldAuthorityId);
          r.goldRankInProbe = at === -1 ? null : at + 1;
          if (probe.length > 0) {
            r.topHitId = probe[0]!.id;
            r.topHitTitle = probe[0]!.case_title;
            r.topHitScore = Number(probe[0]!.ws);
            r.topHitCaseNumber = probe[0]!.case_number;
            const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
            r.topHitSameMatter =
              r.topHitId === g.goldAuthorityId ||
              (r.goldTitle !== null && norm(r.topHitTitle) === norm(r.goldTitle)) ||
              (r.goldCaseNumber !== null &&
                r.topHitCaseNumber !== null &&
                norm(r.goldCaseNumber) === norm(r.topHitCaseNumber));
          }
        } catch (error) {
          r.probeMs = Date.now() - t0;
          const msg = String((error as { message?: string }).message ?? error);
          if (!/canceling statement|timeout/i.test(msg)) throw error;
          r.probeTimedOut = true;
        }
      }
    }

    // What production would actually pin, given all of the above.
    r.pinnedId = r.exactPathFires
      ? // exactCaseTitle returns the single match
        (r.exactPathHitsGold ? g.goldAuthorityId : (r.topHitId ?? 'OTHER'))
      : r.goldRankInProbe !== null && r.goldRankInProbe <= PIN_LIMIT
        ? g.goldAuthorityId
        : r.topHitId;
    r.pinIsGold = r.pinnedId === g.goldAuthorityId;
    r.family = classify(r);

    appendFileSync(CKPT, `${JSON.stringify(r)}\n`);
    rows.push(r);
    process.stdout.write(
      `${String(n).padStart(3)}/${gold.length} ${r.family.padEnd(38)} ws=${r.goldWordSimilarity?.toFixed(3) ?? '  -  '} tok=${r.rarestToken ?? '-'} ${r.probeMs}ms\n`,
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const byFamily: Record<string, number> = {};
  for (const r of rows) byFamily[r.family] = (byFamily[r.family] ?? 0) + 1;
  const rankDist: Record<string, number> = {};
  for (const r of rows) {
    const k = r.goldRankInProbe === null ? 'absent' : r.goldRankInProbe <= 5 ? String(r.goldRankInProbe) : '6-20';
    rankDist[k] = (rankDist[k] ?? 0) + 1;
  }
  const scored = rows.filter((r) => r.goldWordSimilarity !== null).map((r) => r.goldWordSimilarity!);
  scored.sort((a, b) => a - b);
  const pct = (p: number): number | null => (scored.length === 0 ? null : scored[Math.floor(scored.length * p)]!);

  const summary = {
    kind: 'new1_case_title_decomposition',
    measuredAt: new Date().toISOString(),
    frozenHash: buildLaunchGold().frozenHash,
    conditions: 'LOCAL_CONTENDED — the Tier-A GPU walk was staging throughout',
    constants: { CASE_TITLE_BUDGET_MS, CASE_TITLE_MIN_SIMILARITY, PIN_LIMIT, PROBE_DEPTH },
    queries: rows.length,
    byFamily,
    goldRankInProbeDistribution: rankDist,
    goldWordSimilarity: { p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) },
    shapeNotCaseName: rows.filter((r) => !r.shapeIsCaseName).length,
    duplicateTitleDisabledExact: rows.filter((r) => (r.normalisedTitleMatches ?? 0) > 1).length,
    probeTimeouts: rows.filter((r) => r.probeTimedOut).length,
    probeMs: {
      p50: [...rows.map((r) => r.probeMs)].sort((a, b) => a - b)[Math.floor(rows.length * 0.5)] ?? null,
      p95: [...rows.map((r) => r.probeMs)].sort((a, b) => a - b)[Math.floor(rows.length * 0.95)] ?? null,
    },
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`\nWROTE ${OUT.pathname}\n${JSON.stringify(byFamily, null, 2)}\n`);
  await sql.end();
}

await main();
