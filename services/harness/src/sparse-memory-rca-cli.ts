/**
 * SPARSE-SEARCH MEMORY INCIDENT — A BOUNDED REPRODUCER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT HAPPENED, AND WHAT WAS ALREADY RULED OUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A full-suite run surfaced this, unlooked-for:
 *
 *     PostgresError: out of memory
 *       code 53200
 *       detail "Failed on request of size 100663296 in memory context
 *               \"ExecutorState\""
 *       at sparseAny (services/api/src/search/retrieve.ts:438)
 *
 * 100663296 is exactly 96 MiB, and it is a SINGLE allocation request rather
 * than a running total.
 *
 * **LCC's first mechanism is REFUTED and is not re-tested here.** The proposal
 * was one pathological judgment whose `full_text_tsv` detoasts to ~96 MiB.
 * NEW1 measured it (bus 1063): zero judgments in the corpus have a tsvector
 * over 4 MiB, the largest detoasts to about 388 KiB, and `pg_column_size` was
 * checked against `octet_length` first so the answer is not a TOAST-pointer
 * artefact. No such judgment exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PROBE ASKS INSTEAD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `EXPLAIN` only — never `ANALYZE` — because the fault under investigation is an
 * out-of-memory and executing the suspect query to diagnose it is how a
 * diagnosis becomes an outage. The plan answers the questions that matter
 * without running anything:
 *
 *   * is the `ORDER BY ts_rank(...)` sort BOUNDED by the `LIMIT`? A top-N heap
 *     sort holds ~2xN tuples and cannot grow to 96 MiB. An unbounded sort holds
 *     every matching row, and at 24 bytes per `SortTuple` a 96 MiB memtuples
 *     array is about 4.2 million rows — which is the size of a match set, not
 *     the size of a document.
 *   * how many rows does the planner EXPECT to match? That is the difference
 *     between "a broad query is expensive" and "the planner had no idea".
 *   * is it a PARALLEL plan? Each worker gets its own `work_mem` and its own
 *     `ExecutorState`, so the per-query memory is a multiple of the setting,
 *     not the setting.
 *
 * **Parameters are BOUND, not inlined.** `docs/ai/lcc` already records a case
 * where an inlined `EXPLAIN` showed cost 18.72 while the real bind-parameter
 * plan cost 9,255,009 and 500'd every request. An inlined EXPLAIN is not
 * evidence about a parameterised query.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE MACHINE IS PART OF THE MECHANISM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The original report noted 13.9 GiB of RAM free at the moment of failure and
 * concluded the machine was not exhausted. That is PHYSICAL memory, and on
 * Windows a `palloc` is a commit, not a page-in: an allocation fails when the
 * system COMMIT CHARGE reaches the COMMIT LIMIT, which can happen with physical
 * RAM free. This box runs a six-worker ingest fleet and a GPU embedding walk
 * alongside PostgreSQL, so the commit headroom is not a constant.
 *
 * So the probe records both, and the write-up is required to say which it was.
 */
import { execFileSync } from 'node:child_process';

import postgres from 'postgres';

/** Straight from `retrieve.ts`. Drift here would make the plan meaningless. */
const SPARSE_MAX_DOCUMENT_FREQUENCY = 0.5;
const SPARSE_RARE_LEXEMES = 3;
const CANDIDATE_DEPTH = 50;
const BODY_TEXT_UNCONVICTED = ['unknown', 'good', 'degraded'];

/**
 * The queries, chosen for SHAPE rather than for meaning.
 *
 * The suspect mechanism is match-set size, so the set spans an ordinary advocate
 * question, one made only of high-frequency legal words (the case the
 * all-common fallback exists for), and one long enough that its rarest three
 * lexemes are still common.
 */
const QUERIES = [
  { label: 'ordinary', text: 'anticipatory bail in a dowry harassment case' },
  { label: 'all-common', text: 'court state order petition appeal judgment' },
  { label: 'single-common', text: 'court' },
  {
    label: 'long-narrative',
    text:
      'the petitioner was arrested by the police at the residence of his father in law ' +
      'and produced before the magistrate the next day where the remand was granted ' +
      'without hearing counsel and the case diary was not produced before the court',
  },
];

type PlanRow = { 'QUERY PLAN': string };

function commitState(): { limitGiB: number; chargedGiB: number; freeGiB: number } | null {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "$c=(Get-Counter '\\Memory\\Committed Bytes').CounterSamples[0].CookedValue; " +
          "$l=(Get-Counter '\\Memory\\Commit Limit').CounterSamples[0].CookedValue; " +
          'Write-Output ("{0} {1}" -f $c,$l)',
      ],
      { encoding: 'utf8', timeout: 30000 },
    ).trim();
    const [charged, limit] = out.split(/\s+/).map(Number);
    if (!charged || !limit) return null;
    const g = (n: number) => Math.round((n / 1024 ** 3) * 100) / 100;
    return { limitGiB: g(limit), chargedGiB: g(charged), freeGiB: g(limit - charged) };
  } catch {
    return null;
  }
}

/**
 * The EXACT text of `sparseAny`, with `$n` placeholders where the driver puts
 * them. Copied rather than imported because `sparseAny` builds its SQL through
 * tagged templates and there is no way to ask it for the string; the constants
 * above are the guard against the copy drifting.
 */
const SPARSE_SQL = `
    WITH scored AS (
      SELECT
        l.lexeme,
        coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
      FROM unnest(to_tsvector('english', $1)) AS l
      LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ),
    discriminating AS (
      SELECT lexeme, df FROM scored WHERE df <= $2
    ),
    lex AS (
      SELECT lexeme FROM (
        SELECT lexeme, df FROM discriminating
        UNION ALL
        SELECT lexeme, df FROM scored
        WHERE NOT EXISTS (SELECT 1 FROM discriminating)
      ) candidates
      ORDER BY df ASC, length(lexeme) DESC
      LIMIT $3
    ),
    q AS (
      SELECT to_tsquery('english', string_agg(quote_literal(lexeme), ' & ')) AS tsq FROM lex
    )
    SELECT j.id
    FROM judgments j, q
    WHERE q.tsq IS NOT NULL
      AND j.full_text_tsv @@ q.tsq
      AND (j.script_quality IS NULL OR j.script_quality = ANY($4))
    ORDER BY ts_rank(j.full_text_tsv, q.tsq) DESC
    LIMIT $5
`;

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  const before = commitState();
  console.log('commit charge before:', JSON.stringify(before));

  const settings = await sql<{ name: string; setting: string; unit: string | null }[]>`
    SELECT name, setting, unit FROM pg_settings
     WHERE name IN ('work_mem','hash_mem_multiplier','shared_buffers',
                    'max_parallel_workers_per_gather','temp_buffers')
     ORDER BY name`;
  console.log('\nsettings:');
  for (const s of settings) console.log(' ', s.name.padEnd(34), s.setting, s.unit ?? '');

  for (const q of QUERIES) {
    console.log(`\n──────── ${q.label} ────────\n${q.text}\n`);

    /**
     * Which lexemes actually survive the rarest-3 filter, and how common they
     * are. This is the INPUT to the match-set size, and it is measured rather
     * than assumed — the last time this function was changed on a proxy for
     * document frequency instead of the measurement, it cost 94.1% of the
     * corpus in an OR'd tsquery.
     */
    const lex = await sql<{ lexeme: string; df: string }[]>`
      WITH scored AS (
        SELECT l.lexeme,
               coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
          FROM unnest(to_tsvector('english', ${q.text})) AS l
          LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
      ),
      discriminating AS (SELECT lexeme, df FROM scored WHERE df <= ${SPARSE_MAX_DOCUMENT_FREQUENCY})
      SELECT lexeme, df::text AS df FROM (
        SELECT lexeme, df FROM discriminating
        UNION ALL
        SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM discriminating)
      ) c ORDER BY df ASC, length(lexeme) DESC LIMIT ${SPARSE_RARE_LEXEMES}`;
    console.log(
      'rarest lexemes:',
      lex.map((l) => `${l.lexeme}@df=${Number(l.df).toFixed(4)}`).join('  '),
    );

    const plan = await sql.unsafe<PlanRow[]>(`EXPLAIN (COSTS, VERBOSE OFF) ${SPARSE_SQL}`, [
      q.text,
      SPARSE_MAX_DOCUMENT_FREQUENCY,
      SPARSE_RARE_LEXEMES,
      BODY_TEXT_UNCONVICTED,
      CANDIDATE_DEPTH,
    ]);
    const text = plan.map((r) => r['QUERY PLAN']).join('\n');
    console.log(text);

    /**
     * The three verdicts the plan can give, stated rather than left for a
     * reader to squint at.
     */
    const boundedSort = /Sort Method|Top-N/.test(text) || / Limit\b/.test(text);
    const parallel = /Parallel|Gather/.test(text);
    const sortRows = /-> +Sort +\(cost=[^)]*rows=(\d+)/.exec(text);
    console.log(
      `\n  verdict: sort under a LIMIT=${boundedSort}  parallel=${parallel}` +
        `  sort input rows(est)=${sortRows?.[1] ?? 'n/a'}`,
    );
  }

  console.log('\ncommit charge after:', JSON.stringify(commitState()));
  await sql.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
