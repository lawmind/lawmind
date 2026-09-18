/**
 * The EXACT Tier-A census, and the exact-content representative map.
 *
 *   pnpm --filter @lawmind/embed run tier-census -- [--page 5000] [--force]
 *                                                   [--reset] [--max-pages N]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS WHEN `tier-manifest-cli.ts` ALREADY WALKS THE SAME VIEW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The manifest CLI answers "give me the ids of a tier". It holds every id and
 * every content hash in memory, has no checkpoint, and dies with its process.
 * For a bounded sample that is exactly right and it is not being replaced.
 *
 * This answers three questions it structurally cannot:
 *
 *   1. **How many, exactly.** The 8.49M Tier-A figure in the contract is a
 *      projection from a 0.2% sample. A projection is fine for sizing a disk
 *      and useless for a selector: NEW1 cannot measure per-class precision
 *      against a population whose size is an estimate.
 *   2. **Which rows are the same text.** The manifest counts distinct content
 *      hashes; it never says WHICH judgment represents a duplicate group, so
 *      nothing downstream can act on it.
 *   3. **Survive a crash.** Postgres died six times in four days on this box —
 *      0xC000013A console control signals, not OOM (NEW2 bus 0685). A 27-minute
 *      full walk that loses everything on interruption will, on this hardware,
 *      lose everything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXACTLY-ONCE PER PAGE, AND WHY THAT IS THE ENTIRE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `member_count` and every cell count ACCUMULATE. That makes double-processing
 * a page silently wrong — not an error, a plausible number. And a plausible
 * wrong number is undetectable by any later check, which is the failure mode
 * this whole file is shaped around.
 *
 * So the cursor is not a file and not a variable. Each page's aggregates and the
 * cursor that accounts for them are written in ONE transaction. Commit both or
 * neither. Interrupt it anywhere — kill -9, a console signal, a power cut — and
 * the resume is correct, because the only two states that can exist are "page
 * fully counted and cursor advanced" and "neither".
 *
 * This is why `--reset` exists and why it truncates rather than re-walking: a
 * definition change makes every accumulated count evidence about a population
 * that no longer exists, and adding to it would blend two definitions into one
 * unfalsifiable total.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres, { type Sql } from 'postgres';

import type { JobClass } from '../../../scripts/resource-gate.d.mts';
import { sslFor } from './db-ssl.ts';
import { checkView, CONTRACT_VERSION } from './eligibility.ts';

const JOB = 'tier-census';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
function num(name: string, fallback: number): number {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * The seven buckets every row lands in — exhaustively, including the excluded.
 *
 * A census that counts only what it keeps cannot answer "what did we throw away
 * and why", which is the question a selector has to survive. Counting the
 * exclusions costs nothing: the row has already been read and its length
 * already computed by the view.
 *
 * ORDER MATTERS and is not arbitrary. A row failing identity AND text is
 * reported as an identity failure, because identity is the cheaper thing to fix
 * and a text repair on a row we cannot name is wasted. Each row lands in
 * exactly one bucket, so the buckets sum to the corpus.
 *
 * `tier_a_standard` and `tier_a_core` are separate because A_CORE is a SUBSET of
 * A, not a sibling of it:
 *
 *     Tier A      = tier_a_standard + tier_a_core
 *     Tier A-Core =                   tier_a_core
 *
 * A single `tier_a` bucket alongside a `tier_a_core` one would be added together
 * by the first person to write a SUM, and the resulting number would be neither.
 */
type Bucket =
  | 'tier_a_standard'
  | 'tier_a_core'
  | 'bail_order'
  | 'excluded_identity'
  | 'excluded_text'
  | 'excluded_role'
  | 'excluded_stub';

type Row = {
  id: string;
  court: string | null;
  judgmentYear: number | null;
  contentHash: string | null;
  textLength: number | null;
  valueBand: string;
  axisA: boolean;
  axisB: boolean;
  axisC: boolean;
  isBailOrder: boolean;
};

function bucketOf(r: Row): Bucket {
  if (!r.axisA) return 'excluded_identity';
  if (!r.axisB) return 'excluded_text';
  if (!r.axisC) return 'excluded_role';
  if (r.isBailOrder) return 'bail_order';
  if (r.valueBand === 'stub' || r.valueBand === 'brief') return 'excluded_stub';
  if (r.valueBand === 'full' || r.valueBand === 'substantial') return 'tier_a_core';
  return 'tier_a_standard';
}

const TIER_A: ReadonlySet<Bucket> = new Set<Bucket>(['tier_a_standard', 'tier_a_core']);

async function gate(jobClass: JobClass): Promise<{ allow: boolean; reasons: string[] }> {
  try {
    const mod = await import('../../../scripts/resource-gate.mjs');
    const v = await mod.check(jobClass);
    return { allow: v.allow, reasons: v.reasons };
  } catch (error) {
    return {
      allow: false,
      reasons: ['resource gate unavailable: ' + String((error as Error).message)],
    };
  }
}

async function readProgress(sql: Sql): Promise<{
  cursor: string | null;
  rowsSeen: number;
  pagesDone: number;
  version: string;
  hash: string;
} | null> {
  const rows = await sql<
    {
      cursor: string | null;
      rows_seen: string;
      pages_done: number;
      definition_version: string;
      definition_hash: string;
    }[]
  >`SELECT cursor, rows_seen, pages_done, definition_version, definition_hash
      FROM embedding_census_progress WHERE job = ${JOB}`;
  const r = rows[0];
  if (!r) return null;
  return {
    cursor: r.cursor,
    rowsSeen: Number(r.rows_seen),
    pagesDone: r.pages_done,
    version: r.definition_version,
    hash: r.definition_hash,
  };
}

async function main(): Promise<number> {
  const pageSize = num('--page', 5000);
  const maxPages = num('--max-pages', 0); // 0 = until exhausted
  const outDir = flag('--out') ?? join('docs', 'ai', 'embedding-manifests');

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL unset');
    return 2;
  }

  // A full walk detoasts every `full_text` in the corpus — 140 GB of relation,
  // measured at ~11k rows/s. That is DB_SCAN class and it is exactly the shape
  // NEW2 measured contending with retrieval at p50 43s. `--force` exists so a
  // deliberate human decision to pay the cost stays visible rather than being
  // routed around some less inspectable way.
  const verdict = await gate('DB_SCAN');
  if (!verdict.allow && !has('--force')) {
    console.error('DEFER DB_SCAN — not running.');
    for (const r of verdict.reasons) console.error('  - ' + r);
    console.error(
      'Re-run when the box is quieter, or pass --force to accept the cost deliberately.',
    );
    return 3;
  }

  const sql = postgres(url, { ssl: sslFor(url), max: 2, onnotice: () => {}, idle_timeout: 0 });
  try {
    const view = await checkView(sql);
    if (!view.present) {
      console.error('REFUSED: ' + view.why);
      return 4;
    }
    const defHash = view.definitionHash;

    if (has('--reset')) {
      // Truncate rather than re-walk. Accumulated counts under one definition
      // are not evidence about another, and adding to them produces a total
      // that describes no population at all.
      await sql.begin(async (tx) => {
        await tx`DELETE FROM embedding_census_cell WHERE definition_version = ${CONTRACT_VERSION}`;
        await tx`DELETE FROM embedding_content_representative WHERE definition_version = ${CONTRACT_VERSION}`;
        await tx`DELETE FROM embedding_census_progress WHERE job = ${JOB}`;
      });
      console.log('reset: cleared census + representatives for ' + CONTRACT_VERSION);
    }

    let prog = await readProgress(sql);
    if (prog && (prog.version !== CONTRACT_VERSION || prog.hash !== defHash)) {
      // Refuse rather than silently continue. Resuming a walk started under a
      // different view definition mixes two populations in one set of counts,
      // and nothing downstream could ever tell which rows came from which.
      console.error('REFUSED: a census is in progress under a DIFFERENT definition.');
      console.error('  in progress: ' + prog.version + ' / ' + prog.hash);
      console.error('  this build:  ' + CONTRACT_VERSION + ' / ' + defHash);
      console.error('Re-run with --reset to start a fresh census under the current definition.');
      return 5;
    }
    if (!prog) {
      await sql`
        INSERT INTO embedding_census_progress (job, definition_version, definition_hash)
        VALUES (${JOB}, ${CONTRACT_VERSION}, ${defHash})
        ON CONFLICT (job) DO NOTHING`;
      prog = { cursor: null, rowsSeen: 0, pagesDone: 0, version: CONTRACT_VERSION, hash: defHash };
    }

    console.log(
      'census ' +
        CONTRACT_VERSION +
        ' / ' +
        defHash +
        ' — resuming at cursor ' +
        (prog.cursor ?? '(start)') +
        ', ' +
        prog.rowsSeen.toLocaleString() +
        ' rows already counted',
    );

    const startedAt = Date.now();
    let cursor = prog.cursor;
    let rowsSeen = prog.rowsSeen;
    let pagesDone = prog.pagesDone;
    let pagesThisRun = 0;

    for (;;) {
      if (maxPages > 0 && pagesThisRun >= maxPages) {
        console.log(
          'stopping: --max-pages ' + maxPages + ' reached (this is a pause, not a finish)',
        );
        break;
      }

      const rows = await sql<Row[]>`
        SELECT
          id,
          court,
          -- Year extracted in SQL, not in JS. The driver parses a date column
          -- into a JS Date at LOCAL midnight, so getFullYear() on a 1 January
          -- judgment can report the previous year in a negative-offset zone.
          -- EXTRACT is the calendar year Postgres stored, with no zone in it.
          EXTRACT(YEAR FROM judgment_date)::int AS "judgmentYear",
          content_hash      AS "contentHash",
          text_length       AS "textLength",
          value_band        AS "valueBand",
          axis_a_identity   AS "axisA",
          axis_b_text       AS "axisB",
          axis_c_role       AS "axisC",
          is_bail_order     AS "isBailOrder"
        FROM judgment_embedding_eligibility
        ${cursor ? sql`WHERE id > ${cursor}::uuid` : sql``}
        ORDER BY id
        LIMIT ${pageSize}
      `;
      if (rows.length === 0) break;

      // ── aggregate the page in memory, then write it in one transaction ──
      // Grouping here rather than in SQL keeps the transaction short: the page
      // is already read, and a long-running transaction on this box is the
      // thing that stalled a DDL for 1,683 seconds.
      const cells = new Map<
        string,
        { court: string; year: number; band: string; bucket: Bucket; rows: number; chars: number }
      >();
      const groups = new Map<string, { minId: string; n: number }>();

      for (const r of rows) {
        const bucket = bucketOf(r);
        const court = r.court ?? '(unknown)';
        // -1, never NULL. A NULL in a primary key never equals itself, so the
        // upsert would insert a brand new row on every page instead of adding
        // to the existing one — and the count would be low by however many
        // pages contained an undated judgment.
        const year = r.judgmentYear ?? -1;
        const key = court + ' ' + year + ' ' + r.valueBand + ' ' + bucket;
        const cell = cells.get(key);
        if (cell) {
          cell.rows += 1;
          cell.chars += r.textLength ?? 0;
        } else {
          cells.set(key, {
            court,
            year,
            band: r.valueBand,
            bucket,
            rows: 1,
            chars: r.textLength ?? 0,
          });
        }

        // Representatives are built for the TIER-A population only. A duplicate
        // group among excluded rows is real but nothing will ever embed it, and
        // carrying it would make `member_count` mean "copies in the corpus"
        // rather than "vectors saved" — two different numbers that would be
        // read as one.
        if (TIER_A.has(bucket) && r.contentHash) {
          const g = groups.get(r.contentHash);
          if (g) {
            g.n += 1;
            if (r.id < g.minId) g.minId = r.id;
          } else {
            groups.set(r.contentHash, { minId: r.id, n: 1 });
          }
        }
      }

      const lastId = rows[rows.length - 1]!.id;
      const cellRows = [...cells.values()];
      const groupRows = [...groups.entries()];

      await sql.begin(async (tx) => {
        if (cellRows.length > 0) {
          await tx`
            INSERT INTO embedding_census_cell ${tx(
              cellRows.map((c) => ({
                definition_version: CONTRACT_VERSION,
                court: c.court,
                judgment_year: c.year,
                value_band: c.band,
                bucket: c.bucket,
                rows: c.rows,
                chars_total: c.chars,
              })),
            )}
            ON CONFLICT (definition_version, court, judgment_year, value_band, bucket)
            DO UPDATE SET
              rows        = embedding_census_cell.rows + EXCLUDED.rows,
              chars_total = embedding_census_cell.chars_total + EXCLUDED.chars_total,
              updated_at  = now()`;
        }

        if (groupRows.length > 0) {
          await tx`
            INSERT INTO embedding_content_representative ${tx(
              groupRows.map(([hash, g]) => ({
                content_hash: hash,
                representative_judgment_id: g.minId,
                member_count: g.n,
                definition_version: CONTRACT_VERSION,
                definition_hash: defHash,
              })),
            )}
            ON CONFLICT (content_hash) DO UPDATE SET
              member_count = embedding_content_representative.member_count + EXCLUDED.member_count,
              -- LEAST, so the representative is min(id) over the WHOLE
              -- population and not min(id) of whichever page happened to see
              -- the group first. Without this the representative would depend
              -- on page size, and two runs at different page sizes would
              -- disagree about which row represents a group.
              representative_judgment_id = LEAST(
                embedding_content_representative.representative_judgment_id,
                EXCLUDED.representative_judgment_id
              ),
              updated_at = now()`;
        }

        // Same transaction as the aggregates above. This line is the whole
        // exactly-once guarantee.
        await tx`
          UPDATE embedding_census_progress
             SET cursor = ${lastId}::uuid,
                 rows_seen = rows_seen + ${rows.length},
                 pages_done = pages_done + 1,
                 updated_at = now()
           WHERE job = ${JOB}`;
      });

      cursor = lastId;
      rowsSeen += rows.length;
      pagesDone += 1;
      pagesThisRun += 1;

      if (pagesThisRun % 20 === 0) {
        const secs = (Date.now() - startedAt) / 1000;
        const rate = Math.round((pagesThisRun * pageSize) / secs);
        console.log(
          '  ' +
            rowsSeen.toLocaleString() +
            ' rows · ' +
            pagesDone +
            ' pages · ' +
            rate.toLocaleString() +
            ' rows/s · cursor ' +
            cursor,
        );
      }

      if (rows.length < pageSize) break; // short page = end of table
    }

    const exhausted = maxPages === 0 || pagesThisRun < maxPages;
    if (exhausted) {
      await sql`UPDATE embedding_census_progress SET finished_at = now(), updated_at = now() WHERE job = ${JOB}`;
    }

    // ── the report, read back from the tables rather than from local variables ──
    // Reading back is the point: it proves what LANDED, not what this process
    // believes it sent. A summary computed from in-memory counters would be
    // identical whether or not a single row committed.
    const totals = await sql<{ bucket: string; rows: string; chars: string }[]>`
      SELECT bucket, sum(rows)::text AS rows, sum(chars_total)::text AS chars
        FROM embedding_census_cell WHERE definition_version = ${CONTRACT_VERSION}
       GROUP BY bucket ORDER BY sum(rows) DESC`;

    const reps = await sql<{ groups: string; members: string; multi: string; saved: string }[]>`
      SELECT count(*)::text                                        AS groups,
             coalesce(sum(member_count), 0)::text                  AS members,
             count(*) FILTER (WHERE member_count > 1)::text        AS multi,
             coalesce(sum(member_count - 1), 0)::text              AS saved
        FROM embedding_content_representative
       WHERE definition_version = ${CONTRACT_VERSION}`;

    const byCourt = await sql<{ court: string; tier_a: string }[]>`
      SELECT court, sum(rows)::text AS tier_a
        FROM embedding_census_cell
       WHERE definition_version = ${CONTRACT_VERSION}
         AND bucket IN ('tier_a_standard', 'tier_a_core')
       GROUP BY court ORDER BY sum(rows) DESC`;

    const byYear = await sql<{ judgment_year: number; tier_a: string }[]>`
      SELECT judgment_year, sum(rows)::text AS tier_a
        FROM embedding_census_cell
       WHERE definition_version = ${CONTRACT_VERSION}
         AND bucket IN ('tier_a_standard', 'tier_a_core')
       GROUP BY judgment_year ORDER BY judgment_year`;

    const byBand = await sql<{ value_band: string; rows: string; chars: string }[]>`
      SELECT value_band, sum(rows)::text AS rows, sum(chars_total)::text AS chars
        FROM embedding_census_cell
       WHERE definition_version = ${CONTRACT_VERSION}
       GROUP BY value_band ORDER BY sum(rows) DESC`;

    const n = (s: string | undefined): number => Number(s ?? 0);
    const bucketMap = Object.fromEntries(totals.map((t) => [t.bucket, n(t.rows)]));
    const tierA = (bucketMap['tier_a_standard'] ?? 0) + (bucketMap['tier_a_core'] ?? 0);
    const tierACore = bucketMap['tier_a_core'] ?? 0;

    const summary = {
      job: JOB,
      contractVersion: CONTRACT_VERSION,
      definitionHash: defHash,
      complete: exhausted,
      rowsCounted: Object.values(bucketMap).reduce((a, b) => a + b, 0),
      tierA,
      tierACore,
      // Vectors actually needed once byte-identical text is collapsed. This is
      // the number that should price a GPU run, not `tierA`.
      tierADistinctTexts: n(reps[0]?.groups),
      duplicateGroups: n(reps[0]?.multi),
      vectorsSavedByDedup: n(reps[0]?.saved),
      buckets: bucketMap,
      byValueBand: Object.fromEntries(
        byBand.map((b) => [b.value_band, { rows: n(b.rows), chars: n(b.chars) }]),
      ),
      byCourtTierA: Object.fromEntries(byCourt.map((c) => [c.court, n(c.tier_a)])),
      byYearTierA: Object.fromEntries(byYear.map((y) => [String(y.judgment_year), n(y.tier_a)])),
      generatedAt: new Date().toISOString(),
    };

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'tier-census.json'), JSON.stringify(summary, null, 2) + '\n');

    console.log('');
    console.log(exhausted ? '── CENSUS COMPLETE ──' : '── CENSUS PAUSED (resumable) ──');
    console.log('rows counted        ' + summary.rowsCounted.toLocaleString());
    console.log('TIER A              ' + tierA.toLocaleString());
    console.log('TIER A-CORE         ' + tierACore.toLocaleString() + '  (subset of Tier A)');
    console.log(
      'distinct texts      ' +
        summary.tierADistinctTexts.toLocaleString() +
        '  <- vectors actually needed',
    );
    console.log('duplicate groups    ' + summary.duplicateGroups.toLocaleString());
    console.log('vectors saved       ' + summary.vectorsSavedByDedup.toLocaleString());
    console.log('wrote ' + join(outDir, 'tier-census.json'));
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
