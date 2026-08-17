/**
 * `pnpm --filter @lawmind/harness gate:postmigration` — the correctness gate
 * that stands between the local restore and deleting Railway.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WILL NOT CONNECT TO RAILWAY. THAT IS THE FIRST THING IT DOES.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Railway is now the rollback copy and nothing else. `classifyDatabaseUrl`
 * refuses every host that is not this machine — an allowlist, not a denylist,
 * because a denylist passes the moment the rollback copy answers to a new proxy
 * name. The refusal happens before a connection is opened, so a misconfigured
 * run costs nothing.
 *
 *   POST_MIGRATION_DATABASE_URL  optional override, checked first
 *   LOCAL_DATABASE_URL           the migration tooling's own variable
 *   DATABASE_URL                 last, because it still points at Railway until
 *                                cutover flips it
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT GRADES, AND WHAT IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Eight classes, A–H, from the post-migration directive. Every one asks whether
 * MEANING survived: same authority, same citation resolution, same currentness,
 * same evidence bytes, same duplicate identity, same generated-column
 * semantics.
 *
 * **Latency and query plans are recorded as INFO and block nothing.** LCC
 * measured `random_page_cost` at 4.0 on Railway against 1.1 locally and
 * recorded a collation-provider difference by design; both legitimately move
 * ranking and timing. A gate that failed on those would fail on the migration
 * working as intended. Correctness first, performance separately, and the
 * report says which is which on every line.
 *
 * **No new gold.** Every fixture is a row this project already captured:
 * `fixtures/post-migration-probes.json` (from the pre-migration baseline's §4
 * and §5), `deployed-safety.ts`'s three standing citation probes, and
 * `docs/ops/migration/freeze-baseline.json`'s twice-corrected row count.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import type { Sql } from 'postgres';

import { resolveExactSpan } from '@lawmind/api/judgments/paragraphs';
import { hybridSearch } from '@lawmind/api/search/retrieve';
import type { RetrievalMode, RetrievedJudgment } from '@lawmind/api/search/retrieve';
import { classifyQuery, warrantsExactLookup } from '@lawmind/api/search/query-shape';
import { answerStructured } from '@lawmind/api/search/structured';

import {
  type Check,
  CHECK_CLASSES,
  check,
  classifyDatabaseUrl,
  gradeAmbiguous,
  gradeCitationIdentity,
  gradeDuplicateCollapse,
  gradeExactSpan,
  gradeGeneratedBehaviour,
  gradeGeneratedFlag,
  gradeNamedResolution,
  gradeNoMatch,
  gradeOverruled,
  gradeRowCount,
  summarise,
} from './post-migration.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

type Probes = {
  overruled: {
    id: string;
    caseTitle: string;
    overruledStatus: string;
    overruledByJudgmentId: string | null;
  }[];
  citationIdentity: {
    id: string;
    caseTitle: string;
    neutralCitation: string | null;
    reporterCitation: string | null;
  }[];
};

const probes = JSON.parse(
  readFileSync(path.join(HERE, 'fixtures', 'post-migration-probes.json'), 'utf8'),
) as Probes;

/**
 * The freeze target is read from LCC's file at run time, not copied into this
 * one. It was corrected once already (6,994,646 → 7,296,068); a second copy of
 * a number that has moved before is a second thing to forget to update.
 */
function freezeTargetJudgments(): number | null {
  try {
    const raw = JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, 'docs', 'ops', 'migration', 'freeze-baseline.json'),
        'utf8',
      ),
    ) as { authoritativeCounts?: { judgments?: number } };
    return raw.authoritativeCounts?.judgments ?? null;
  } catch {
    return null;
  }
}

/**
 * A fixed lexical query for the arm comparison.
 *
 * Deliberately ordinary — the point is that all three arms answer at all after
 * the move, not that this particular query ranks well. Its terms are common
 * enough in an Indian criminal corpus that an empty sparse result means the
 * full-text path is broken, not that the corpus lacks the case.
 */
const ARM_QUERY = 'anticipatory bail NDPS commercial quantity twin conditions section 37';

/** How many results each retrieval probe asks for. Small: this is a gate, not a benchmark. */
const PROBE_LIMIT = 10;

/** Deterministic sample size for the storage-level evidence check. */
const SPAN_SAMPLE = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Timing helper — recorded on checks, never graded
// ─────────────────────────────────────────────────────────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const v = await fn();
  return [v, Date.now() - t0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Classes A and B — citation identity and ambiguity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `emit` exists because this class alone runs for HOURS.
 *
 * LCC measured a single `cite:"…"` at **14m39s** (bus 0593): `countStructured`
 * builds `A OR B OR C` with an unindexable `EXISTS(unnest(reporter_citations))`
 * arm, so the planner takes a sequential scan of 7.3M rows however well the
 * neutral-citation index would have served predicate A. A dozen probes is most
 * of an afternoon — and LCC also reports the server has crashed four times on
 * Windows console signals.
 *
 * Per-STAGE persistence is not enough at that duration: A and B are one stage,
 * so a drop at probe eleven would discard the ten already paid for. Each probe
 * is therefore handed up the moment it is graded, and the caller writes the
 * report. **A crash then costs one probe.**
 */
async function classAB(sql: Sql, emit?: (c: Check) => void): Promise<Check[]> {
  const out: Check[] = [];
  const push = (c: Check) => {
    out.push(c);
    emit?.(c);
  };

  /**
   * The named probe first, because the directive names it first:
   * `cite:"(1994) 3 SCC 1"` → S.R. Bommai. Same literal and same expectation
   * as `deployed-safety.ts`'s `bommai-exact` case, run in process rather than
   * over HTTP because there is no deployed service to ask any more.
   */
  {
    const q = 'cite:"(1994) 3 SCC 1"';
    const [outcome, ms] = await timed(() => answerStructured(sql, q, PROBE_LIMIT));
    push(gradeNamedResolution('bommai-exact', '(1994) 3 SCC 1', 'BOMMAI', outcome, ms));
  }

  for (const f of probes.citationIdentity) {
    if (f.neutralCitation) {
      const [outcome, ms] = await timed(() =>
        answerStructured(sql, `cite:"${f.neutralCitation!}"`, PROBE_LIMIT),
      );
      push(
        gradeCitationIdentity(`neutral-${f.id.slice(0, 8)}`, f.neutralCitation, f.id, outcome, ms),
      );
    }
    /**
     * The reporter citation is graded too, and it is the harder half. It goes
     * through `unnest(reporter_citations)` plus normalisation — an array column
     * and a regexp, both of which a restore can get subtly wrong in ways a
     * scalar column cannot.
     */
    if (f.reporterCitation) {
      const [outcome, ms] = await timed(() =>
        answerStructured(sql, `cite:"${f.reporterCitation!}"`, PROBE_LIMIT),
      );
      push(
        gradeCitationIdentity(
          `reporter-${f.id.slice(0, 8)}`,
          f.reporterCitation,
          f.id,
          outcome,
          ms,
        ),
      );
    }
  }

  {
    const [outcome, ms] = await timed(() =>
      answerStructured(sql, 'cite:"2020 INSC 189"', PROBE_LIMIT),
    );
    push(gradeAmbiguous('insc-189-ambiguous', '2020 INSC 189', outcome, ms));
  }
  {
    const [outcome, ms] = await timed(() =>
      answerStructured(sql, 'cite:"(9999) 99 SCC 999"', PROBE_LIMIT),
    );
    push(gradeNoMatch('nonexistent-citation', '(9999) 99 SCC 999', outcome, ms));
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Class C — adverse / currentness
// ─────────────────────────────────────────────────────────────────────────────

async function classC(sql: Sql): Promise<Check[]> {
  const out: Check[] = [];
  const ids = probes.overruled.map((o) => o.id);

  const [rows, ms] = await timed(
    () => sql<
      {
        id: string;
        overruled_status: string;
        overruled_by_judgment_id: string | null;
        neutral_citation: string | null;
      }[]
    >`
      SELECT id, overruled_status, overruled_by_judgment_id, neutral_citation
        FROM judgments WHERE id = ANY(${ids})`,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const expected of probes.overruled) {
    const row = byId.get(expected.id);
    out.push(gradeOverruled(expected, row ?? null, ms));
  }

  /**
   * The stored value is only half the rule. `CITATION_HARNESS.md` says
   * `overruled_status` is read LIVE at render on every surface and never
   * cached, so the gate also checks that what retrieval HANDS BACK equals what
   * the row holds — a `set_aside` judgment served as `none` through the search
   * path is the same product failure as a flipped column, with no column to
   * inspect afterwards.
   */
  for (const expected of probes.overruled) {
    const row = byId.get(expected.id);
    if (!row?.neutral_citation) {
      out.push(
        check(
          'C',
          `live-read-${expected.id.slice(0, 8)}`,
          'INFO',
          'no neutral citation on this row — nothing to address it by through the structured path',
        ),
      );
      continue;
    }
    const [outcome, lms] = await timed(() =>
      answerStructured(sql, `cite:"${row.neutral_citation!}"`, PROBE_LIMIT),
    );
    if (outcome.kind !== 'matched' && outcome.kind !== 'ambiguous') {
      out.push(
        check(
          'C',
          `live-read-${expected.id.slice(0, 8)}`,
          'FAIL',
          `an overruled judgment could not be reached by its own citation (${outcome.kind})`,
          { expected: expected.overruledStatus, actual: outcome.kind, ms: lms },
        ),
      );
      continue;
    }
    const hit = outcome.hits.find((h) => h.judgmentId === expected.id);
    if (!hit) {
      out.push(
        check(
          'C',
          `live-read-${expected.id.slice(0, 8)}`,
          'FAIL',
          'its own citation no longer returns it',
          {
            expected: expected.id,
            actual: outcome.hits.map((h) => h.judgmentId).join(', ') || '(none)',
            ms: lms,
          },
        ),
      );
      continue;
    }
    out.push(
      hit.overruledStatus === row.overruled_status
        ? check(
            'C',
            `live-read-${expected.id.slice(0, 8)}`,
            'PASS',
            'retrieval serves the stored overruled_status, live',
            {
              expected: row.overruled_status,
              actual: hit.overruledStatus,
              ms: lms,
            },
          )
        : check(
            'C',
            `live-read-${expected.id.slice(0, 8)}`,
            'FAIL',
            'retrieval served a DIFFERENT overruled_status than the row holds — the LAW MOVED mark would be wrong on screen',
            { expected: row.overruled_status, actual: hit.overruledStatus, ms: lms },
          ),
    );
  }

  /**
   * Population shape, as INFO. There is no pre-migration figure to diff
   * against — the baseline's own §2 was taken before the freeze and its
   * `overruledJudgments: 95` is explicitly labelled stale there — so this is a
   * fresh floor recorded for the next run, not a comparison.
   */
  const [dist, dms] = await timed(
    () => sql<{ overruled_status: string; n: string }[]>`
      SELECT overruled_status, count(*)::text AS n
        FROM judgments WHERE overruled_status <> 'none'
       GROUP BY overruled_status ORDER BY 1`,
  );
  out.push(
    check(
      'C',
      'currentness-population',
      'INFO',
      dist.length === 0
        ? 'no judgment in this corpus carries a non-none overruled_status'
        : dist
            .map((d) => `${d.overruled_status}=${Number(d.n).toLocaleString('en-IN')}`)
            .join(' · '),
      { ms: dms },
    ),
  );

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Class D — exact evidence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two levels, because they fail differently.
 *
 * STORAGE: do the stored offsets still describe the stored text? This reuses
 * `resolveExactSpan` and the same `chunk_text.endsWith(span)` invariant
 * `services/api/.../verify-exact-span-cli.ts` established — including its two
 * table-wide signature counts, which are indexed and cheap and catch the two
 * offset bugs that tool was written for.
 *
 * **Sampled deterministically (`ORDER BY judgment_id, chunk_index`), not
 * `ORDER BY random()`.** A gate that draws a different sample every run cannot
 * distinguish "this fails now" from "this row was never looked at before". The
 * deep, stratified, randomised pass is still that tool's job and is worth
 * running after this gate — it is a corpus audit, not a migration check.
 */
async function classD(sql: Sql): Promise<Check[]> {
  const out: Check[] = [];

  const [sig, sms] = await timed(
    () => sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgment_chunks
       WHERE char_offset = 0 AND chunk_index > 0`,
  );
  const zeroOffset = Number(sig[0]?.n ?? 0);
  out.push(
    zeroOffset === 0
      ? check(
          'D',
          'span-signature-zero-offset',
          'PASS',
          'no chunk carries the char_offset=0 defect signature',
          { ms: sms },
        )
      : check(
          'D',
          'span-signature-zero-offset',
          'FAIL',
          `${zeroOffset.toLocaleString('en-IN')} chunks carry char_offset=0 with chunk_index>0`,
          {
            expected: '0',
            actual: String(zeroOffset),
            ms: sms,
          },
        ),
  );

  const [over, oms] = await timed(
    () => sql<{ n: string }[]>`
      SELECT count(*)::text AS n
        FROM judgment_chunks c JOIN judgments j ON j.id = c.judgment_id
       WHERE c.char_offset IS NOT NULL
         AND c.char_offset + c.char_length > length(j.full_text)`,
  );
  const overshoot = Number(over[0]?.n ?? 0);
  out.push(
    overshoot === 0
      ? check(
          'D',
          'span-signature-overshoot',
          'PASS',
          'no chunk span runs past the end of its own full_text',
          { ms: oms },
        )
      : check(
          'D',
          'span-signature-overshoot',
          'FAIL',
          `${overshoot.toLocaleString('en-IN')} chunk spans overshoot full_text`,
          {
            expected: '0',
            actual: String(overshoot),
            ms: oms,
          },
        ),
  );

  const [rows, rms] = await timed(
    () => sql<
      {
        judgment_id: string;
        chunk_index: number;
        chunk_text: string;
        char_offset: number;
        char_length: number;
        full_text: string;
      }[]
    >`
      SELECT c.judgment_id, c.chunk_index, c.chunk_text, c.char_offset, c.char_length, j.full_text
        FROM judgment_chunks c JOIN judgments j ON j.id = c.judgment_id
       WHERE c.char_offset IS NOT NULL AND c.char_length IS NOT NULL
       ORDER BY c.judgment_id, c.chunk_index
       LIMIT ${SPAN_SAMPLE}`,
  );

  if (rows.length === 0) {
    out.push(
      check(
        'D',
        'span-storage-sample',
        'INFO',
        'no chunk in this corpus carries a verified offset — nothing to sample',
        { ms: rms },
      ),
    );
  } else {
    const bad: string[] = [];
    for (const r of rows) {
      const span = resolveExactSpan(r.full_text, r.char_offset, r.char_length);
      if (!span || !r.chunk_text.endsWith(span.text)) {
        bad.push(`${r.judgment_id.slice(0, 8)}#${r.chunk_index}`);
      }
    }
    out.push(
      bad.length === 0
        ? check(
            'D',
            'span-storage-sample',
            'PASS',
            `${rows.length} chunk spans re-resolve byte-identically against full_text`,
            { ms: rms },
          )
        : check(
            'D',
            'span-storage-sample',
            'FAIL',
            `${bad.length} of ${rows.length} spans no longer match their own text`,
            {
              expected: '0 mismatches',
              actual: bad.slice(0, 8).join(', '),
              ms: rms,
            },
          ),
    );
  }

  return out;
}

/** Class D's retrieval half, graded on whatever a live search actually handed back. */
async function spansFromResults(
  sql: Sql,
  results: readonly RetrievedJudgment[],
  label: string,
): Promise<Check[]> {
  const withSpan = results.filter((r) => r.exactSpan !== null);
  if (withSpan.length === 0) {
    return [
      check('D', `span-retrieval-${label}`, 'INFO', 'no result in this probe carried an exactSpan'),
    ];
  }
  const ids = withSpan.map((r) => r.judgmentId);
  const rows = await sql<{ id: string; full_text: string | null }[]>`
    SELECT id, full_text FROM judgments WHERE id = ANY(${ids})`;
  const byId = new Map(rows.map((r) => [r.id, r.full_text]));
  return withSpan.map((r) =>
    gradeExactSpan(
      `span-retrieval-${label}-${r.judgmentId.slice(0, 8)}`,
      r.exactSpan,
      byId.get(r.judgmentId) ?? null,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Classes E and F — duplicate collapse, and the three arms
// ─────────────────────────────────────────────────────────────────────────────

async function classEF(sql: Sql, queryVector: string | null): Promise<Check[]> {
  const out: Check[] = [];
  const arms: Record<RetrievalMode, RetrievedJudgment[]> = { sparse: [], dense: [], hybrid: [] };

  for (const mode of ['sparse', 'dense', 'hybrid'] as RetrievalMode[]) {
    if (mode === 'dense' && queryVector === null) {
      out.push(
        check(
          'F',
          'arm-dense',
          'INFO',
          'no query embedding available in this environment — the dense arm was not exercised',
        ),
      );
      continue;
    }
    const [results, ms] = await timed(() =>
      hybridSearch(sql, ARM_QUERY, mode === 'sparse' ? null : queryVector, {}, PROBE_LIMIT, mode),
    );
    arms[mode] = results;
    out.push(
      results.length > 0
        ? check(
            'F',
            `arm-${mode}`,
            'PASS',
            `the ${mode} arm returned ${results.length} result(s)`,
            { ms },
          )
        : check(
            'F',
            `arm-${mode}`,
            'FAIL',
            `the ${mode} arm returned nothing — ${mode === 'sparse' ? 'the full-text path is not answering' : 'the vector path is not answering'}`,
            { expected: '>0 results', actual: '0', ms },
          ),
    );
  }

  /**
   * Fusion may reorder freely — RRF over two arms whose planners changed is
   * expected to move — but it may not INVENT. Every hybrid result must have
   * come from one of the arms or from the exact-lookup pin, which is a third
   * mechanism and runs in every mode by design.
   */
  if (arms.hybrid.length > 0) {
    const known = new Set([...arms.sparse, ...arms.dense].map((r) => r.judgmentId));
    // The pin is legitimate and belongs to neither arm; allow exactly the head.
    const head = arms.hybrid[0]?.judgmentId;
    const invented = arms.hybrid.filter((r) => !known.has(r.judgmentId) && r.judgmentId !== head);
    out.push(
      invented.length === 0 || queryVector === null
        ? check(
            'F',
            'fusion-provenance',
            queryVector === null ? 'INFO' : 'PASS',
            queryVector === null
              ? 'dense arm not exercised, so hybrid provenance cannot be checked against both arms'
              : 'every hybrid result came from an arm or the exact-lookup pin',
          )
        : check(
            'F',
            'fusion-provenance',
            'FAIL',
            `${invented.length} hybrid result(s) appear in neither arm`,
            {
              expected: 'hybrid ⊆ sparse ∪ dense ∪ {pinned}',
              actual: invented.map((r) => r.judgmentId.slice(0, 8)).join(', '),
            },
          ),
    );
  }

  /**
   * The pin itself, checked only when the code's own classifier says it should
   * fire. Deriving the expectation from `classifyQuery` rather than asserting a
   * remembered one means this check cannot go stale against a classifier change
   * — it would simply stop applying, and say so.
   */
  const pinFixture = probes.citationIdentity.find((f) => f.neutralCitation);
  if (pinFixture?.neutralCitation) {
    const shape = classifyQuery(pinFixture.neutralCitation);
    if (!warrantsExactLookup(shape)) {
      out.push(
        check(
          'F',
          'citation-pin',
          'INFO',
          `classifyQuery does not route "${pinFixture.neutralCitation}" to exact lookup — nothing to pin`,
        ),
      );
    } else {
      for (const mode of ['sparse', 'hybrid'] as RetrievalMode[]) {
        const [results, ms] = await timed(() =>
          hybridSearch(
            sql,
            pinFixture.neutralCitation!,
            mode === 'sparse' ? null : queryVector,
            {},
            PROBE_LIMIT,
            mode,
          ),
        );
        const top = results[0]?.judgmentId ?? null;
        out.push(
          top === pinFixture.id
            ? check(
                'F',
                `citation-pin-${mode}`,
                'PASS',
                `the citation query pins its judgment at rank 1 in ${mode} mode`,
                { ms },
              )
            : check(
                'F',
                `citation-pin-${mode}`,
                'FAIL',
                `the citation query no longer pins its judgment at rank 1 in ${mode} mode`,
                {
                  expected: pinFixture.id,
                  actual: top ?? '(no results)',
                  ms,
                },
              ),
        );
      }
    }
  }

  // Class D's retrieval half rides on the results already fetched.
  if (arms.hybrid.length > 0) out.push(...(await spansFromResults(sql, arms.hybrid, 'hybrid')));
  else if (arms.sparse.length > 0)
    out.push(...(await spansFromResults(sql, arms.sparse, 'sparse')));

  // ── Class E ────────────────────────────────────────────────────────────────

  for (const mode of ['sparse', 'hybrid'] as RetrievalMode[]) {
    const results = arms[mode];
    if (results.length === 0) continue;
    const ids = results.map((r) => r.judgmentId);
    const rows = await sql<{ id: string; content_hash: string | null }[]>`
      SELECT id, content_hash FROM judgments WHERE id = ANY(${ids})`;
    const byId = new Map(rows.map((r) => [r.id, r.content_hash]));
    out.push(
      gradeDuplicateCollapse(
        `collapse-${mode}`,
        ids.map((id) => byId.get(id) ?? null),
      ),
    );
  }

  /**
   * The invariant above only bites if the probe happened to surface a
   * duplicate. This aims one at a real duplicate group directly: two judgments
   * that ARE the same document by sha256, searched by the title they share.
   * `exactCaseTitle` deliberately declines to pin when two rows share a title,
   * so this exercises the collapse rather than the pin.
   */
  /**
   * SEVERAL candidate groups, not one — because the first live run drew a group
   * whose members never reached the top `PROBE_LIMIT` for their own shared
   * title, and a probe that cannot reach its target measures nothing however it
   * is graded. Each group is tried until one actually surfaces a member; only
   * then is the collapse invariant genuinely under test.
   *
   * Bounded at 5 because each attempt is a real search (a shared title is
   * `case_name`-shaped, so it also pays `exactCaseTitle`'s sequential scan —
   * §NEW1.M2), and an unbounded hunt for a cooperative fixture is how a gate
   * turns into a benchmark.
   */
  const DUP_GROUP_ATTEMPTS = 5;
  const [groups, gms] = await timed(
    () => sql<{ content_hash: string; case_title: string; n: string }[]>`
      SELECT j.content_hash, min(j.case_title) AS case_title, count(*)::text AS n
        FROM judgments j
       WHERE j.content_hash IS NOT NULL
       GROUP BY j.content_hash
      HAVING count(*) > 1
       ORDER BY j.content_hash
       LIMIT ${DUP_GROUP_ATTEMPTS}`,
  );
  if (groups.length === 0) {
    out.push(
      check(
        'E',
        'collapse-known-duplicate',
        'INFO',
        'this corpus holds no content_hash duplicate group to aim at',
        { ms: gms },
      ),
    );
  } else {
    let members: { id: string }[] = [];
    let returned: RetrievedJudgment[] = [];
    let tried = 0;

    for (const candidate of groups) {
      tried += 1;
      const ms = await sql<{ id: string }[]>`
        SELECT id FROM judgments WHERE content_hash = ${candidate.content_hash}`;
      const ids = new Set(ms.map((m) => m.id));
      const res = await hybridSearch(sql, candidate.case_title, null, {}, PROBE_LIMIT, 'sparse');
      members = ms;
      returned = res.filter((r) => ids.has(r.judgmentId));
      // The first group the search can actually reach is the one worth grading.
      if (returned.length > 0) break;
    }
    /**
     * **ZERO IS NOT A PASS, and grading it as one was a real defect in this
     * gate** — caught on the first live run, where this line reported
     * `0 result slot(s), as designed`.
     *
     * `≤1` is satisfied by 0, but 0 means NEITHER member of the duplicate group
     * came back at all, so the collapse was never exercised and the check
     * measured nothing. A vacuous pass in a migration gate is worse than a gap,
     * because it is counted as evidence. This file already applies the opposite
     * rule elsewhere — *a probe with nothing to aim at says so rather than
     * reading green* — and this branch simply did not follow it.
     *
     * Why 0 happens here is understood, not mysterious: `exactCaseTitle`
     * deliberately declines to pin when two rows share a title, so the group can
     * only arrive through the sparse ranker, and a shared title is no guarantee
     * of a top-`PROBE_LIMIT` finish in a 7.3M-row corpus.
     */
    out.push(
      returned.length === 0
        ? check(
            'E',
            'collapse-known-duplicate',
            'INFO',
            `${tried} duplicate group(s) tried and none reached the top ${PROBE_LIMIT} for its own shared title, so collapse was NOT exercised — this is a gap in the evidence, not evidence that collapse works`,
            { expected: 'exactly 1 slot', actual: '0 — no probe reached a group', ms: gms },
          )
        : returned.length === 1
          ? check(
              'E',
              'collapse-known-duplicate',
              'PASS',
              `a ${members.length}-row duplicate group occupies exactly 1 result slot — collapsed, not dropped`,
              { expected: 'exactly 1 slot', actual: '1', ms: gms },
            )
          : check(
              'E',
              'collapse-known-duplicate',
              'FAIL',
              'a duplicate group took more than one slot — collapse regressed',
              {
                expected: 'exactly 1 slot',
                actual: `${returned.length} of ${members.length}`,
                ms: gms,
              },
            ),
    );
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Class G — paragraph fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The population this exists for: 93.2% of judgments carry no chunk at all, so
 * their only evidence is `judgment_paragraphs`. A migration that lost that
 * table's offsets would leave search answering normally with empty evidence —
 * the exact shape of failure this fallback was built to end.
 *
 * Addressed by its own case title so the probe is deterministic:
 * `exactCaseTitle` pins a unique title at rank 1, which removes ranking from
 * the question entirely. A title that is not unique is skipped rather than
 * graded — two judgments printed with the same title is a corpus fact, not a
 * migration defect.
 */
async function classG(sql: Sql): Promise<Check[]> {
  const [candidates, cms] = await timed(
    () => sql<{ id: string; case_title: string }[]>`
      SELECT j.id, j.case_title
        FROM judgments j
       WHERE EXISTS (SELECT 1 FROM judgment_paragraphs p WHERE p.judgment_id = j.id)
         AND NOT EXISTS (SELECT 1 FROM judgment_chunks c WHERE c.judgment_id = j.id)
         AND length(j.case_title) BETWEEN 20 AND 200
       ORDER BY j.id
       LIMIT 25`,
  );

  if (candidates.length === 0) {
    return [
      check(
        'G',
        'paragraph-fallback',
        'INFO',
        'no judgment holds paragraphs without chunks — the fallback has nothing to answer here',
        { ms: cms },
      ),
    ];
  }

  /**
   * Title uniqueness for all 25 candidates in ONE pass, not one query each.
   *
   * The only index on `judgments.case_title` is `judgments_case_title_trgm`,
   * GIN `gin_trgm_ops` (migration `0026`) — built for the structured-search
   * `party:` predicate, not for equality. Whether that opclass can serve a bare
   * `=` is version-dependent and is NOT assumed here: if it can, 25 round trips
   * still cost 25 index probes where one grouped probe answers the same
   * question; if it cannot, this is the difference between one sequential scan
   * of 7,296,068 rows and twenty-five of them.
   *
   * Either way the batched form is bounded and the per-candidate form is not —
   * the same shape as the resolver defect in bus 0523, where a per-row
   * formulation written against 38,341 rows survived into a corpus 190x larger.
   * The gate is the thing LCC waits on, and a gate nobody can afford to run is
   * not a gate.
   *
   * Titles absent from the map appear zero times, which cannot happen — they
   * were just read out of this table — so `?? 0` skips rather than grades.
   */
  const [titleCounts, tms] = await timed(
    () => sql<{ case_title: string; n: string }[]>`
      SELECT case_title, count(*)::text AS n
        FROM judgments
       WHERE case_title = ANY(${candidates.map((c) => c.case_title)})
       GROUP BY case_title`,
  );
  const timesSeen = new Map(titleCounts.map((r) => [r.case_title, Number(r.n)]));

  for (const c of candidates) {
    if ((timesSeen.get(c.case_title) ?? 0) !== 1) continue;

    const [results, ms] = await timed(() =>
      hybridSearch(sql, c.case_title, null, {}, PROBE_LIMIT, 'sparse'),
    );
    const hit = results.find((r) => r.judgmentId === c.id);
    if (!hit) {
      return [
        check(
          'G',
          'paragraph-fallback',
          'FAIL',
          'a judgment addressed by its own unique title did not come back',
          {
            expected: c.id,
            actual: results.map((r) => r.judgmentId.slice(0, 8)).join(', ') || '(none)',
            ms,
          },
        ),
      ];
    }
    const problems: string[] = [];
    if (hit.operativeParagraph.trim() === '') problems.push('operativeParagraph is empty');
    if (!hit.operativeParagraphVerified) problems.push('operativeParagraphVerified is false');
    if (hit.exactSpan === null) problems.push('exactSpan is null');

    if (problems.length > 0) {
      return [
        check(
          'G',
          'paragraph-fallback',
          'FAIL',
          `the paragraph fallback did not fill this result: ${problems.join('; ')}`,
          {
            expected: 'non-empty verified paragraph with an exactSpan',
            actual: problems.join('; '),
            ms,
          },
        ),
      ];
    }

    const [row] = await sql<
      { full_text: string | null }[]
    >`SELECT full_text FROM judgments WHERE id = ${c.id}`;
    return [
      check(
        'G',
        'paragraph-fallback',
        'PASS',
        `a chunkless judgment is served evidence from judgment_paragraphs (${hit.operativeParagraph.length} chars, verified)`,
        { ms },
      ),
      gradeExactSpan('paragraph-fallback-span', hit.exactSpan, row?.full_text ?? null),
    ];
  }

  return [
    check(
      'G',
      'paragraph-fallback',
      'INFO',
      `none of the ${candidates.length} chunkless candidates has a unique case_title — no deterministic probe available`,
      { ms: cms + tms },
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Class H — generated columns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two STORED generated columns this schema declares, with the expression
 * each is supposed to carry. Read out of `packages/db/src/schema.ts` and the
 * migrations that created them (`0004`, `0005`), which are the source of truth
 * a restore is being compared against.
 */
/**
 * Thrown to make the driver roll the write probe back. Identity-compared, never
 * matched on a message, so a genuine error can never be mistaken for it.
 */
const PROBE_ROLLBACK = Symbol('post-migration write probe: roll back');

const GENERATED_COLUMNS = [
  {
    table: 'judgments',
    column: 'full_text_tsv',
    sourceColumn: 'full_text',
    expects: "to_tsvector('english', full_text)",
  },
  {
    table: 'statute_sections',
    column: 'full_text_tsv',
    sourceColumn: 'section_text',
    expects: "to_tsvector('english', coalesce(heading, '') || ' ' || section_text)",
  },
] as const;

async function classH(sql: Sql): Promise<Check[]> {
  const out: Check[] = [];

  for (const g of GENERATED_COLUMNS) {
    const [meta, ms] = await timed(
      () => sql<{ attgenerated: string; expr: string | null }[]>`
        SELECT a.attgenerated::text AS attgenerated,
               pg_get_expr(d.adbin, d.adrelid) AS expr
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE n.nspname = 'public' AND c.relname = ${g.table} AND a.attname = ${g.column}`,
    );
    const m = meta[0];
    if (!m) {
      out.push(
        check(
          'H',
          `generated-${g.table}.${g.column}`,
          'FAIL',
          'the column does not exist post-migration',
          { ms },
        ),
      );
      continue;
    }
    /**
     * **Compare CANONICAL against CANONICAL, never hand-written against
     * canonical.** The first live run FAILED here, wrongly:
     *
     *     declared  to_tsvector('english', coalesce(heading, '') || ' ' || section_text)
     *     printed   to_tsvector('english'::regconfig, ((COALESCE(heading, ''::text) || ' '::text) || section_text))
     *
     * Identical expressions. `||` is left-associative, so `a || b || c` IS
     * `((a || b) || c)`, and Postgres re-prints with the parentheses explicit.
     * `normaliseExpr` strips casts, quoting and whitespace but not parentheses,
     * so the substring test missed — and no amount of extra string-mangling is
     * the right answer, because each new rule is another chance to normalise
     * away a difference that MATTERS.
     *
     * So the declared expression is handed to Postgres on a throwaway temp
     * table and read back through `pg_get_expr` — the same printer that
     * produced the real one. Two canonical forms, compared directly. A
     * formatting difference cannot survive that, and a semantic difference
     * cannot hide in it.
     *
     * This matters more than a tidier diff: this file's own note says a check
     * that fails on formatting "teaches everyone to ignore this check", and a
     * class-H FAIL nobody believes is exactly how a genuinely lost generation
     * expression would get waved through.
     */
    let expectCanonical: string | null = null;
    try {
      expectCanonical = await sql.begin(async (tx) => {
        const t = `pmg_expect_${g.table}`;
        await tx.unsafe(`CREATE TEMP TABLE ${t} (LIKE public.${g.table}) ON COMMIT DROP`);
        await tx.unsafe(`ALTER TABLE pg_temp.${t} DROP COLUMN ${g.column}`);
        await tx.unsafe(
          `ALTER TABLE pg_temp.${t} ADD COLUMN ${g.column} tsvector GENERATED ALWAYS AS (${g.expects}) STORED`,
        );
        const r = await tx.unsafe<{ expr: string | null }[]>(
          `SELECT pg_get_expr(d.adbin, d.adrelid) AS expr
             FROM pg_attribute a
             JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE a.attrelid = 'pg_temp.${t}'::regclass AND a.attname = '${g.column}'`,
        );
        return r[0]?.expr ?? null;
      });
    } catch {
      // Fall back to the literal declaration; gradeGeneratedFlag still
      // normalises, and a failure here must not be reported as a schema defect.
      expectCanonical = null;
    }

    out.push(
      gradeGeneratedFlag(
        g.table,
        g.column,
        m.attgenerated,
        m.expr,
        expectCanonical ?? g.expects,
        ms,
      ),
    );
  }

  /**
   * The behavioural half — LCC's explicit ask, and the half a catalogue read
   * cannot give.
   *
   * **Nothing canonical is written.** Each probe runs inside a transaction that
   * creates a TEMP clone with `ON COMMIT DROP` and is then ROLLED BACK, so the
   * clone cannot outlive the check even if it throws. The clone is built with
   * `LIKE <table> INCLUDING GENERATED`, which is what makes the test meaningful:
   * if the real column had lost its generation expression, the clone's column
   * would be an ordinary one and the insert below would leave it NULL. The
   * clone therefore tests the SOURCE's semantics, not its own.
   *
   * NOT NULL is dropped on the clone's plain columns because `LIKE` always
   * copies it, and this probe has no interest in supplying twenty unrelated
   * required fields to write one tsvector.
   *
   * **The rollback is a THROW, not a `ROLLBACK` statement, and that is
   * deliberate.** Read out of the driver rather than assumed
   * (`postgres@3.4.9/src/index.js`, `begin`/`scope`): when the callback
   * resolves the driver sends `commit`, and when it throws the driver sends
   * `rollback` itself. Issuing a raw `ROLLBACK` inside the callback therefore
   * ends the transaction and leaves the driver committing into no transaction —
   * which Postgres answers with a warning rather than an error, so it works,
   * but it works by accident and prints noise into a gate whose output someone
   * has to read at 3am. Throwing uses the driver's own rollback path. The
   * measured pair is captured before the throw, so nothing is lost with it.
   */
  for (const g of GENERATED_COLUMNS) {
    const t0 = Date.now();
    /** Written by the callback before it throws to force the driver's rollback. */
    let measured: [string | null, string | null] | null = null;
    try {
      await sql.begin(async (tx) => {
        const clone = `pmg_clone_${g.table}`;
        await tx.unsafe(
          `CREATE TEMP TABLE ${clone} (LIKE public.${g.table} INCLUDING GENERATED INCLUDING DEFAULTS) ON COMMIT DROP`,
        );
        await tx.unsafe(`
          DO $$
          DECLARE r record;
          BEGIN
            FOR r IN SELECT a.attname FROM pg_attribute a
                      WHERE a.attrelid = 'pg_temp.${clone}'::regclass
                        AND a.attnum > 0 AND NOT a.attisdropped
                        AND a.attnotnull AND a.attgenerated = ''
            LOOP
              EXECUTE format('ALTER TABLE pg_temp.${clone} ALTER COLUMN %I DROP NOT NULL', r.attname);
            END LOOP;
          END $$;`);
        await tx.unsafe(
          `INSERT INTO pg_temp.${clone} (${g.sourceColumn}) VALUES ('habeas corpus preventive detention quashing')`,
        );
        const ins = await tx.unsafe<{ v: string | null }[]>(
          `SELECT ${g.column}::text AS v FROM pg_temp.${clone}`,
        );
        await tx.unsafe(
          `UPDATE pg_temp.${clone} SET ${g.sourceColumn} = 'anticipatory bail commercial quantity narcotic'`,
        );
        const upd = await tx.unsafe<{ v: string | null }[]>(
          `SELECT ${g.column}::text AS v FROM pg_temp.${clone}`,
        );
        measured = [ins[0]?.v ?? null, upd[0]?.v ?? null];
        // The clone is temporary and ON COMMIT DROP already disposes of it, but
        // a probe that never commits cannot leave anything behind by any path.
        throw PROBE_ROLLBACK;
      });
    } catch (error) {
      if (error !== PROBE_ROLLBACK) {
        out.push(
          check(
            'H',
            `generated-write-${g.table}.${g.column}`,
            'FAIL',
            `the write probe could not run: ${(error as Error).message}`,
            {
              ms: Date.now() - t0,
            },
          ),
        );
        continue;
      }
    }

    if (measured === null) {
      // The driver resolved without the callback reaching its throw. Nothing
      // was measured, so nothing is graded — reported rather than defaulted,
      // because a silent PASS here is exactly the false assurance class H exists
      // to prevent.
      out.push(
        check(
          'H',
          `generated-write-${g.table}.${g.column}`,
          'FAIL',
          'the write probe returned without measuring the column',
          { ms: Date.now() - t0 },
        ),
      );
      continue;
    }

    out.push(
      gradeGeneratedBehaviour(
        `generated-write-${g.table}.${g.column}`,
        measured[0],
        measured[1],
        Date.now() - t0,
      ),
    );
  }

  /**
   * A bounded read-only sample rather than a table-wide count: a predicate over
   * `full_text_tsv IS NULL` has no index behind it and would sequentially scan
   * 7.3M TOASTed rows to prove a negative. Deterministic by id, so the same
   * rows are looked at every run.
   */
  const [gap, gms] = await timed(
    () => sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM (
        SELECT full_text, full_text_tsv FROM judgments ORDER BY id LIMIT 5000
      ) t WHERE t.full_text IS NOT NULL AND length(t.full_text) > 0 AND t.full_text_tsv IS NULL`,
  );
  const missing = Number(gap[0]?.n ?? 0);
  out.push(
    missing === 0
      ? check(
          'H',
          'tsv-populated-sample',
          'PASS',
          '5,000 judgments sampled by id: every one with text carries a tsvector',
          { ms: gms },
        )
      : check(
          'H',
          'tsv-populated-sample',
          'FAIL',
          `${missing} of 5,000 sampled judgments hold text but no tsvector`,
          {
            expected: '0',
            actual: String(missing),
            ms: gms,
          },
        ),
  );

  /**
   * Does the STORED value equal what the expression computes NOW?
   *
   * **This is not the tautology it looks like.** For a generated column the two
   * agree by construction only when every row was *generated*; a row whose
   * tsvector was WRITTEN — loaded into a column that was temporarily plain — is
   * not recomputed just because the column is generated again afterwards.
   * `MIGRATION_RUNBOOK` §4d is exactly that story: `COPY` refuses generated
   * columns, and the first workaround altered the real table. LCC's landed fix
   * never alters it, and this check is what makes that claim falsifiable rather
   * than trusted, on the one migration where those two tables are rebuilt and
   * their tsvectors recomputed by a different server (bus 0578).
   *
   * A mismatch here and a PASS on the catalogue half together mean something
   * very specific: the expression is right and the DATA was not produced by it.
   *
   * **Bounded three ways, and the sample is small on purpose.** 500 rows,
   * deterministic by id; only rows under `TSV_RECOMPUTE_MAX_CHARS`, because
   * `to_tsvector` raises on input whose output would exceed the 1 MB tsvector
   * limit and this corpus holds judgments of 2.9M characters. Skipped rows are
   * excluded from the denominator and named in the message, never silently
   * counted as agreeing.
   *
   * 500 rather than 5,000 because the defect this looks for is **systematic** —
   * a load path that wrote the column wrote it for every row it touched, so a
   * small sample finds it just as surely — while the cost is not: unlike the
   * NULL check above, this one must detoast `full_text` for every row it reads.
   */
  const TSV_RECOMPUTE_MAX_CHARS = 200_000;
  try {
    const [drift, dms] = await timed(
      () => sql<{ n: string; sampled: string }[]>`
        SELECT count(*) FILTER (
                 WHERE t.full_text_tsv IS DISTINCT FROM to_tsvector('english', t.full_text)
               )::text AS n,
               count(*)::text AS sampled
          FROM (
            SELECT full_text, full_text_tsv FROM judgments
             WHERE full_text IS NOT NULL AND length(full_text) BETWEEN 1 AND ${TSV_RECOMPUTE_MAX_CHARS}
             ORDER BY id LIMIT 500
          ) t`,
    );
    const differing = Number(drift[0]?.n ?? 0);
    const sampled = Number(drift[0]?.sampled ?? 0);
    out.push(
      differing === 0
        ? check(
            'H',
            'tsv-matches-recomputation',
            'PASS',
            `${sampled.toLocaleString('en-IN')} judgments sampled by id: every stored tsvector equals to_tsvector('english', full_text) recomputed now`,
            { ms: dms },
          )
        : check(
            'H',
            'tsv-matches-recomputation',
            'FAIL',
            `${differing} of ${sampled} sampled judgments hold a tsvector the generation expression does not reproduce — written, not generated`,
            { expected: '0', actual: String(differing), ms: dms },
          ),
    );
  } catch (error) {
    // Reported, never swallowed: an unrunnable check is not a passing one.
    out.push(
      check(
        'H',
        'tsv-matches-recomputation',
        'INFO',
        `recomputation comparison could not run: ${(error as Error).message}`,
      ),
    );
  }

  /**
   * And the plan, as INFO only. LCC predicted local would CHOOSE
   * `judgments_full_text_idx` where Railway (`random_page_cost` 4.0) refuses
   * it, and asked for the measured answer either way. It is recorded, never
   * graded — a planner choice is infrastructure, and this gate grades meaning.
   */
  try {
    const [rpc] = await sql<{ v: string }[]>`SELECT current_setting('random_page_cost') AS v`;
    /**
     * **Whether ANALYZE has run is a PRECONDITION of this line meaning
     * anything, so it is read and stated rather than assumed.**
     *
     * Postgres discards the statistics collector on an unclean shutdown, and
     * this cluster took one (NEW2, bus 0580): `reltuples` reads -1 with
     * `relpages` 0. A planner with no size information for `judgments` plans it
     * as though it were tiny, and a tiny table is sequentially scanned
     * **whatever `random_page_cost` is set to**.
     *
     * That matters because this line is the first measurement anyone takes of
     * LCC's §M3.5 prediction — that local at 1.1 chooses the GIN index where
     * Railway at 4.0 refuses it. Printed bare, "planner refuses" reads as that
     * prediction REFUTED, when the real cause would be missing statistics. A
     * fake refutation recorded once is quoted for weeks.
     */
    const [stats] = await sql<{ reltuples: string; relpages: string }[]>`
      SELECT reltuples::text, relpages::text FROM pg_class WHERE relname = 'judgments'`;
    const analysed = Number(stats?.reltuples ?? -1) >= 0 && Number(stats?.relpages ?? 0) > 0;

    const plan = await sql.unsafe(
      `EXPLAIN (FORMAT JSON) SELECT j.id FROM judgments j, plainto_tsquery('english', 'res ipsa loquitur') AS q
         WHERE j.full_text_tsv @@ q ORDER BY ts_rank(j.full_text_tsv, q) DESC LIMIT 50`,
    );
    const text = JSON.stringify(plan);
    const chooses = /judgments_full_text_idx/.test(text);
    out.push(
      check(
        'H',
        'tsv-index-plan',
        'INFO',
        analysed
          ? `random_page_cost=${rpc?.v ?? '?'} · planner ${chooses ? 'CHOOSES' : 'refuses'} judgments_full_text_idx`
          : `random_page_cost=${rpc?.v ?? '?'} · planner ${chooses ? 'CHOOSES' : 'refuses'} judgments_full_text_idx — ` +
            `BUT judgments HAS NO STATISTICS (reltuples=${stats?.reltuples ?? '?'}, relpages=${stats?.relpages ?? '?'}). ` +
            `ANALYZE has not run since the rebuild, so this plan is NOT evidence about random_page_cost either way. Re-take it after ANALYZE.`,
      ),
    );
  } catch (error) {
    out.push(
      check('H', 'tsv-index-plan', 'INFO', `plan probe unavailable: ${(error as Error).message}`),
    );
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Corpus counts
// ─────────────────────────────────────────────────────────────────────────────

async function counts(sql: Sql): Promise<Check[]> {
  const out: Check[] = [];
  const target = freezeTargetJudgments();

  const [rows, ms] = await timed(
    () => sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgments`,
  );
  const actual = Number(rows[0]?.n ?? 0);

  out.push(
    target === null
      ? check(
          'C',
          'judgments-count',
          'INFO',
          `${actual.toLocaleString('en-IN')} judgments — freeze-baseline.json unreadable, nothing to compare against`,
          { ms },
        )
      : gradeRowCount('judgments-count', 'C', target, actual, ms),
  );

  /**
   * `judgment_paragraphs` and `judgment_citations` were deliberately NOT
   * re-counted at the 20:57Z freeze — `freeze-baseline.json` says so in
   * writing and tells anyone verifying to take them from the frozen source
   * instead of carrying the 19:33Z figures forward. So they are recorded here,
   * not graded: an equality check against a number its own author marked stale
   * would fail for a reason that has nothing to do with this migration.
   */
  for (const table of ['judgment_paragraphs', 'judgment_citations', 'judgment_chunks'] as const) {
    const [r, tms] = await timed(() =>
      sql.unsafe<{ n: string }[]>(`SELECT count(*)::text AS n FROM ${table}`),
    );
    out.push(
      check('C', `${table}-count`, 'INFO', `${Number(r[0]?.n ?? 0).toLocaleString('en-IN')} rows`, {
        ms: tms,
      }),
    );
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(path.join(REPO_ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m?.[1]) out[m[1]] = (m[2] ?? '').trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env is fine — the environment may carry the variables directly */
  }
  return out;
}

/**
 * Tries three variables in a fixed order and reports WHICH one it used.
 *
 * `DATABASE_URL` is last on purpose: it still points at Railway until cutover
 * flips it, and a gate that silently preferred it would run the whole suite
 * against the rollback copy and pass. The refusal below is what actually stops
 * that; the ordering just means the right answer is found first.
 */
function pickUrl(env: Record<string, string>): { name: string; url: string | undefined } {
  for (const name of ['POST_MIGRATION_DATABASE_URL', 'LOCAL_DATABASE_URL', 'DATABASE_URL']) {
    const url = env[name];
    if (url && url.trim() !== '') return { name, url };
  }
  return { name: 'LOCAL_DATABASE_URL', url: undefined };
}

async function embedderOrNull(): Promise<((text: string) => Promise<string | null>) | null> {
  try {
    const { getEmbedder, toVectorLiteral } = await import('@lawmind/embed');
    const embedder = await getEmbedder();
    return async (text: string) => {
      const [embedded] = await embedder.embed([text]);
      return embedded ? toVectorLiteral(embedded.vector) : null;
    };
  } catch (error) {
    console.log(
      `  embedder unavailable (${(error as Error).message.slice(0, 120)}) — the dense arm will be reported as INFO`,
    );
    return null;
  }
}

async function main(): Promise<number> {
  console.log('LAWMIND POST-MIGRATION CORRECTNESS GATE');
  console.log('='.repeat(78));

  const env = { ...readEnvFile(), ...process.env } as Record<string, string>;
  const picked = pickUrl(env);
  const verdict = classifyDatabaseUrl(picked.url, picked.name);

  if (!verdict.ok) {
    console.error('');
    console.error('REFUSED — no connection was opened.');
    console.error(`  ${verdict.reason}`);
    console.error('');
    console.error('  Railway is the rollback copy. This gate runs against the migrated local');
    console.error('  cluster only. Set POST_MIGRATION_DATABASE_URL or LOCAL_DATABASE_URL to a');
    console.error('  localhost connection string and run again.');
    return 2;
  }

  console.log(`database  ${verdict.host} (from ${picked.name})`);
  console.log(
    `classes   ${Object.entries(CHECK_CLASSES)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ')}`,
  );
  console.log('');

  const sql = postgres(picked.url!, {
    max: 4,
    ssl: false,
    connect_timeout: 60,
    idle_timeout: 0,
    // Server-side, via the connection parameter rather than a client option:
    // some of these checks are whole-table counts and none of them is hung.
    connection: { statement_timeout: 0 },
    onnotice: () => {},
  });

  /**
   * PRE-FLIGHT: is `judgments` the table that holds the data yet?
   *
   * **NEW2, bus 0580, measured on this cluster.** LCC's rebuild loads into
   * `public.judgments__stage` and swaps at the end; the 16 Aug power loss landed
   * before the swap. So `public.judgments` held **0 rows** while
   * `judgments__stage` held all **7,296,068** — and this gate, run then, would
   * have graded the empty one and announced `judgments-count` FAIL, expected
   * 7,296,068, actual 0. Every downstream class would have failed too.
   *
   * That output is not merely wrong, it is wrong in the most expensive
   * direction: it reads as catastrophic data loss, at the exact moment someone
   * might respond by re-restoring 40 GB or rewinding ingest checkpoints. **The
   * distinction between "this table is empty" and "this is not the table yet"
   * has to be made BEFORE anything is graded.**
   *
   * **Existence, not emptiness — and NEW2's 0586 proved the difference 40
   * minutes later.** Their own version of this check fired only when
   * `judgments` counted 0. The cluster then crashed mid-refill and recovered
   * with the partial rows committed in batches, leaving `judgments` holding
   * SOME rows while the stage table still existed — a state an empty-only test
   * sails past, grading a half-loaded table and reporting the shortfall as an
   * unexplained deficit. The stage table existing AT ALL is the real
   * precondition; emptiness was only ever a proxy for it.
   *
   * **The count decides refuse-vs-warn, and is paid only when the table is
   * there.** `to_regclass` is instant; `count(*)` on a table this size is
   * minutes (NEW2 measured 224.9s on the stage copy). So the common case —
   * no stage table — costs one catalogue lookup and nothing else.
   *
   * The count exists because a *completed* load may legitimately leave the
   * stage table behind: NEW2 reports LCC refilling `judgments` FROM it rather
   * than renaming it into place, so its disappearance marks completion but its
   * presence does not, by itself, mark incompleteness. Refusing on existence
   * alone would then refuse a healthy database. **Rather than depend on
   * someone else's cleanup step, decide from the row count**, which is the
   * thing actually being asserted.
   *
   * Refusal (exit 2) rather than FAIL throughout: the migration is unfinished,
   * not broken, and a gate that cannot yet answer must say so instead of
   * answering wrongly. Only one of those two words invites someone to
   * re-restore 40 GB at 3am.
   */
  const [stage] = await sql<{ present: boolean }[]>`
    SELECT to_regclass('public.judgments__stage') IS NOT NULL AS present`;
  if (stage?.present) {
    const target = freezeTargetJudgments();
    const [held] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgments`;
    const actual = Number(held?.n ?? 0);

    if (target !== null && actual === target) {
      // Load complete, artefact not yet dropped. Say so loudly and continue —
      // the gate's own judgments-count check re-establishes this independently.
      console.log(
        `note      public.judgments__stage still exists, but judgments already holds all ` +
          `${target.toLocaleString('en-IN')} rows — treating it as a leftover artefact, not an ` +
          `unfinished load. Grading proceeds.`,
      );
      console.log('');
    } else {
      await sql.end();
      console.error('');
      console.error('REFUSED — nothing was graded.');
      console.error("  public.judgments__stage EXISTS and LCC's rebuild has not finished.");
      console.error('');
      console.error(`  judgments holds ${actual.toLocaleString('en-IN')} rows against a frozen`);
      console.error(`  source of ${target === null ? '(unknown)' : target.toLocaleString('en-IN')}.`);
      console.error('  Grading now would report the shortfall as lost data for a migration that');
      console.error('  has lost nothing — the rows are in the stage table (NEW2, bus 0580/0586).');
      console.error('');
      console.error('  DO NOT re-restore. DO NOT rewind ingest checkpoints. DO NOT start workers.');
      console.error('  Wait for LCC to finish the refill and send');
      console.error('  LOCAL_READY_FOR_POST_MIGRATION_GATE, then run this again.');
      return 2;
    }
  }

  /**
   * STAGE SELECTION AND INCREMENTAL PERSISTENCE — added at gate time, on LCC's
   * own numbers (bus 0593), and it changes no grading logic.
   *
   * Two facts made a single uninterruptible pass the wrong shape:
   *
   * 1. **`cite:"…"` costs 14m39s each.** `countStructured` builds `A OR B OR C`
   *    where B is `EXISTS(unnest(reporter_citations) …)` — unindexable, so no
   *    BitmapOr, so the whole table is scanned however well the neutral-citation
   *    index would have served predicate A. Classes A and B fire roughly a dozen
   *    of those: about three hours.
   * 2. **The server has crashed four times** on Windows console signals
   *    (`0xC000013A`), most recently an autovacuum worker. LCC says plainly the
   *    connection may drop mid-run.
   *
   * A three-hour pass that writes its report only at the end loses everything to
   * a crash at minute 170 — the same trap the pre-migration baseline already
   * fell into once, when the Gate S2 re-run was killed before its single
   * `writeFileSync` and left `HARNESS_JSON` empty.
   *
   * So: `--only A,B` runs a subset, the report is written after EVERY stage, and
   * a later run MERGES into the existing file by replacing only the classes it
   * re-ran. Running the cheap classes first buys a correctness answer in minutes;
   * the citation classes then take their hours without holding it hostage.
   */
  const argv = process.argv.slice(2);
  const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined;
  const only = onlyArg
    ? new Set(
        onlyArg
          .toUpperCase()
          .split(/[,\s]+/)
          .filter(Boolean),
      )
    : null;
  const wants = (...cls: string[]) => only === null || cls.some((c) => only.has(c));

  const outPath =
    env['POST_MIGRATION_JSON'] ??
    path.join(REPO_ROOT, 'docs', 'ops', 'migration', 'post-migration-gate.json');

  /** Checks carried over from an earlier partial run, for classes not re-run now. */
  const carried: Check[] = [];
  if (only !== null) {
    try {
      const prior = JSON.parse(readFileSync(outPath, 'utf8')) as { checks?: Check[] };
      for (const c of prior.checks ?? []) if (!only.has(c.cls)) carried.push(c);
      if (carried.length > 0) {
        console.log(
          `carried   ${carried.length} check(s) from the previous report for classes not re-run now`,
        );
        console.log('');
      }
    } catch {
      /* no previous report is fine — this is the first partial run */
    }
  }

  const checks: Check[] = [];
  const persist = () => {
    const partial = summarise(new Date().toISOString(), verdict.host, [...carried, ...checks]);
    writeFileSync(outPath, `${JSON.stringify(partial, null, 2)}\n`);
  };

  const runStage = async (label: string, cls: string[], run: () => Promise<Check[]>) => {
    if (!wants(...cls)) return;
    const t = Date.now();
    console.log(`run       ${label} …`);
    checks.push(...(await run()));
    // Written after EVERY stage, so a dropped connection costs one stage, not all.
    persist();
    console.log(`done      ${label} · ${Math.round((Date.now() - t) / 1000)}s · report updated`);
  };

  try {
    const embed = wants('E', 'F') ? await embedderOrNull() : null;
    const queryVector = embed ? await embed(ARM_QUERY) : null;

    await runStage('counts', ['C'], () => counts(sql));
    await runStage('C · currentness', ['C'], () => classC(sql));
    await runStage('D · exact evidence', ['D'], () => classD(sql));
    await runStage('E/F · duplicates and arms', ['E', 'F'], () => classEF(sql, queryVector));
    await runStage('G · paragraph fallback', ['G'], () => classG(sql));
    await runStage('H · generated columns', ['H'], () => classH(sql));
    // LAST on purpose: ~14m39s per cite probe (LCC 0593). Everything cheap is
    // already graded and persisted before this begins.
    await runStage('A/B · citation identity and ambiguity', ['A', 'B'], async () => {
      /**
       * Streaming, unlike every other class: each probe is persisted the moment
       * it is graded, because at ~14m39s apiece a connection drop late in this
       * class would otherwise discard hours of completed work.
       *
       * Returns EMPTY deliberately — the callback has already appended every
       * check to `checks`, and returning them again would double-count each one
       * in the report.
       */
      await classAB(sql, (c) => {
        checks.push(c);
        persist();
        console.log(`  ${c.verdict.padEnd(5)} ${c.id} · ${c.ms ?? '?'} ms`);
      });
      return [];
    });
  } finally {
    await sql.end();
  }
  checks.unshift(...carried);

  const report = summarise(new Date().toISOString(), verdict.host, checks);

  for (const cls of Object.keys(CHECK_CLASSES) as (keyof typeof CHECK_CLASSES)[]) {
    const inClass = report.checks.filter((c) => c.cls === cls);
    if (inClass.length === 0) continue;
    console.log(
      `── ${cls} · ${CHECK_CLASSES[cls]} ${'─'.repeat(Math.max(0, 60 - CHECK_CLASSES[cls].length))}`,
    );
    for (const c of inClass) {
      console.log(`${c.verdict.padEnd(5)} ${c.id}`);
      console.log(`      ${c.detail}`);
      if (c.expected !== undefined) console.log(`      expected  ${c.expected}`);
      if (c.actual !== undefined) console.log(`      actual    ${c.actual}`);
      if (c.ms !== undefined) console.log(`      ${c.ms} ms  (recorded, never graded)`);
    }
    console.log('');
  }

  console.log('='.repeat(78));
  /**
   * Said out loud, because a silent dedupe is the same defect wearing a new
   * coat. If a check was graded twice in the merged set, the reader is entitled
   * to know which one and to ask why before quoting the total.
   */
  if (report.collapsed !== undefined && report.collapsed.length > 0) {
    console.log(
      `collapsed ${report.collapsed.length} check(s) graded more than once in the merged ` +
        `report — counts below are over UNIQUE ids, freshest grade kept:`,
    );
    for (const key of report.collapsed) console.log(`          ${key}`);
    console.log('');
  }
  console.log(
    `${report.counts.pass} PASS · ${report.counts.fail} FAIL · ${report.counts.info} INFO`,
  );
  console.log(
    report.passed
      ? 'POST_MIGRATION_RETRIEVAL_GATE_PASS — every correctness check held. INFO lines are measurements, not failures.'
      : 'POST_MIGRATION_RETRIEVAL_GATE_FAIL — see the FAIL lines above. Do not delete Railway.',
  );

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
  if (only !== null) {
    console.log(
      `PARTIAL RUN — classes ${[...only].sort().join(',')} were graded this pass. ` +
        `The verdict above covers the merged report; any class never run is simply absent, ` +
        `which is NOT a pass.`,
    );
  }

  return report.passed ? 0 : 1;
}

/**
 * `process.exitCode`, not `process.exit()` — same reason `deployed-safety-cli.ts`
 * records: forcing an exit while a socket is being torn down crashes Node on
 * Windows, which is where this runs.
 */
process.exitCode = await main();
