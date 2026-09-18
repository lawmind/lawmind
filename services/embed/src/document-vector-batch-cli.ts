/**
 * GPU-ready batches of Tier-A document representations, for NEW1.
 *
 *   pnpm --filter @lawmind/embed run doc-vector-batches -- \
 *     [--tier A|A_CORE] [--batch 10000] [--max-batches N]
 *     [--out DIR] [--emit-text] [--reset] [--force]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE VECTOR PER DOCUMENT, NOT 15.45
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The existing chunk architecture produced 15.45 vectors per represented
 * document. NEW1 measured (bus 0735) that ONE vector per document retains
 * 89–96% of full-chunk retrieval quality at ~3% of the vector count. At Tier-A
 * scale that is the difference between ~131M vectors and ~8.5M — and NEW1's
 * 0697 priced the 15.45 version at 70 GiB in halfvec, which is why this is a
 * different architecture rather than a tuning parameter.
 *
 * This CLI emits LEVEL A only: one canonical vector per authority. Level B
 * (holding / issue / proposition) and Level C (SELECTED paragraphs, never all
 * of them) are separate populations with their own manifests. Nothing here
 * deletes or supersedes the existing chunk vectors — this is additive
 * experimentation and the old arm keeps serving retrieval until a measurement
 * says otherwise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BATCH SOURCE IS THE REPRESENTATIVE TABLE, AND THAT IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Walking `judgment_embedding_eligibility` directly would hand the GPU forty
 * copies of one common order disposing of forty writ petitions. Walking
 * `embedding_content_representative` hands it one, with `member_count` saying
 * how many identities it stands for.
 *
 * No case identity is lost. Every petition keeps its `judgments` row; the map
 * back is `WHERE content_hash = $1` on `judgments_content_hash_idx`. What is
 * collapsed is the EMBEDDING, and only for byte-identical text — nothing fuzzy,
 * no near-duplicate merging, no touching the ~2k genuine citation conflicts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE MANIFEST CARRIES IDS AND NOT TEXT, BY DEFAULT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The requirement is that NEW1 gets from manifest to embedded vectors without a
 * CPU-heavy candidate scan per batch. That is already satisfied by ids: the
 * expensive part — evaluating eligibility over 140 GB of judgments — is done
 * ONCE here, and fetching a batch's text is `WHERE id = ANY($ids)` against the
 * primary key, which is 10,000 index lookups and no scan at all.
 *
 * Writing the text into the manifest would mean ~40 GB of duplicated corpus on
 * disk that goes stale the moment an extractor improves. `--emit-text` exists
 * for a genuinely detached GPU run and is off by default for that reason.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Batches are keyset-ordered by `representative_judgment_id`, so batch N holds
 * the same rows on every run against the same data and definition. Each batch
 * carries an `idsHash`; the run carries a `manifestHash` over the batch hashes.
 * A measured quality figure is about a specific population, and a population
 * that cannot be re-identified makes the figure unfalsifiable.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres, { type Sql } from 'postgres';

import type { JobClass } from '../../../scripts/resource-gate.d.mts';
import { sslFor } from './db-ssl.ts';
import { checkView, CONTRACT_VERSION, TIERS, type Tier } from './eligibility.ts';

const JOB_PREFIX = 'doc-vector-batches';

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

/** Bands each tier accepts. Mirrors `eligibility.ts` — see the note in main(). */
const BANDS: Record<Tier, readonly string[]> = {
  A: ['standard', 'full', 'substantial'],
  A_CORE: ['full', 'substantial'],
};

type BatchRow = {
  judgmentId: string;
  contentHash: string;
  memberCount: number;
  court: string | null;
  judgmentYear: number | null;
  textLength: number | null;
  valueBand: string;
  scriptQuality: string | null;
  hcDocumentClass: string | null;
  fullText?: string | null;
};

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

/**
 * One keyset batch: a BOUNDED page of representatives, then a join.
 *
 * ── THE SHAPE THAT DID NOT WORK, AND WHY, MEASURED 19 AUG 2026
 *
 * The obvious version joins `embedding_content_representative` to the
 * eligibility view and puts `ORDER BY … LIMIT 10000` on the result. It ran for
 * over 70 seconds without producing a single batch, with parallel workers on
 * `DataFileRead`.
 *
 * The reason is not the join, it is WHERE the filter sits. `LIMIT` can only stop
 * an index scan early when everything it filters on is available from that
 * index. Here the predicates are on the VIEW side — `axis_b_text` needs
 * `text_quality`, `value_band` needs `length(full_text)` — so the planner has to
 * join and evaluate all 8.85M representatives before it can know which first
 * 10,000 survive. The `LIMIT` describes the output and constrains nothing about
 * the work.
 *
 * The census walk did not have this problem because it filtered nothing: it took
 * a page and bucketed whatever it got.
 *
 * ── THE FIX: BOUND FIRST, JOIN SECOND
 *
 * The CTE takes its page from the representative table alone, ordered by the
 * column its index is on, with no view predicate in sight — so `LIMIT` really
 * does stop after 10,000 index entries. Only then does the join run, against a
 * set that is already bounded, detoasting at most `limit` documents.
 *
 * ── WHY THE BAND FILTER STAYS EVEN THOUGH TIER A CANNOT FAIL IT
 *
 * Representatives are built from the Tier-A population, so for `--tier A` every
 * row in the page passes. `A_CORE` is a NARROWER band set and genuinely drops
 * rows. Trusting an upstream filter for a narrower question is how a selector
 * quietly widens, so the check stays — it is now one comparison on a row already
 * fetched rather than the thing that decides the plan.
 *
 * Consequence the caller must handle: a batch can come back SHORTER than the
 * page. `pageLastId` is therefore returned separately from the rows — advancing
 * the cursor to the last EMITTED row would silently re-walk every filtered-out
 * representative on the next call, forever.
 */
type Page = { rows: BatchRow[]; pageLastId: string | null; pageRows: number };

async function batch(
  sql: Sql,
  tier: Tier,
  cursor: string | null,
  limit: number,
  withText: boolean,
): Promise<Page> {
  const bands = BANDS[tier];
  const rows = await sql<(BatchRow & { pageLastId: string; pageRows: string })[]>`
    WITH page AS (
      SELECT representative_judgment_id, content_hash, member_count
        FROM embedding_content_representative
       WHERE definition_version = ${CONTRACT_VERSION}
         ${cursor ? sql`AND representative_judgment_id > ${cursor}::uuid` : sql``}
       ORDER BY representative_judgment_id
       LIMIT ${limit}
    ),
    bounds AS (
      SELECT (SELECT representative_judgment_id FROM page
               ORDER BY representative_judgment_id DESC LIMIT 1) AS last_id,
             (SELECT count(*)::text FROM page) AS n
    )
    SELECT
      p.representative_judgment_id AS "judgmentId",
      p.content_hash               AS "contentHash",
      p.member_count               AS "memberCount",
      e.court,
      EXTRACT(YEAR FROM e.judgment_date)::int AS "judgmentYear",
      e.text_length                AS "textLength",
      e.value_band                 AS "valueBand",
      e.script_quality             AS "scriptQuality",
      e.hc_document_class          AS "hcDocumentClass",
      b.last_id                    AS "pageLastId",
      b.n                          AS "pageRows"
      ${withText ? sql`, (SELECT j.full_text FROM judgments j WHERE j.id = p.representative_judgment_id) AS "fullText"` : sql``}
    FROM page p
    CROSS JOIN bounds b
    JOIN judgment_embedding_eligibility e ON e.id = p.representative_judgment_id
    WHERE e.axis_a_identity
      AND e.axis_b_text
      AND e.axis_c_role
      AND coalesce(e.is_bail_order, false) = false
      AND e.value_band = ANY(${bands as string[]})
    ORDER BY p.representative_judgment_id
  `;

  // `bounds` is a single row cross-joined onto every result, so any row carries
  // it. When the filter removes EVERYTHING the rows are empty and the page
  // bounds are lost with them — hence the separate probe, which only runs in
  // that case and reads one index entry.
  if (rows.length > 0) {
    return { rows, pageLastId: rows[0]!.pageLastId, pageRows: Number(rows[0]!.pageRows) };
  }
  const [probe] = await sql<{ last_id: string | null; n: string }[]>`
    WITH page AS (
      SELECT representative_judgment_id
        FROM embedding_content_representative
       WHERE definition_version = ${CONTRACT_VERSION}
         ${cursor ? sql`AND representative_judgment_id > ${cursor}::uuid` : sql``}
       ORDER BY representative_judgment_id
       LIMIT ${limit}
    )
    SELECT (SELECT representative_judgment_id FROM page
             ORDER BY representative_judgment_id DESC LIMIT 1) AS last_id,
           (SELECT count(*)::text FROM page) AS n
  `;
  return { rows: [], pageLastId: probe?.last_id ?? null, pageRows: Number(probe?.n ?? 0) };
}

async function main(): Promise<number> {
  const tier = (flag('--tier') ?? 'A') as Tier;
  if (!TIERS.includes(tier)) {
    console.error('--tier must be one of ' + TIERS.join(', '));
    return 2;
  }
  const batchSize = num('--batch', 10000);
  const maxBatches = num('--max-batches', 0); // 0 = until exhausted
  const withText = has('--emit-text');
  const outDir = flag('--out') ?? join('docs', 'ai', 'embedding-manifests', 'document-vectors');
  const job = JOB_PREFIX + ':' + tier;

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL unset');
    return 2;
  }

  // Bounded runs are LIGHT: a few batches off a PK-ordered index is not what
  // contends with retrieval. An unbounded run over the whole tier is DB_SCAN.
  const need: JobClass = maxBatches > 0 ? 'LIGHT' : 'DB_SCAN';
  const verdict = await gate(need);
  if (!verdict.allow && !has('--force')) {
    console.error('DEFER ' + need + ' — not running.');
    for (const r of verdict.reasons) console.error('  - ' + r);
    return 3;
  }

  const sql = postgres(url, { ssl: sslFor(url), max: 2, onnotice: () => {}, idle_timeout: 0 });
  try {
    const view = await checkView(sql);
    if (!view.present) {
      console.error('REFUSED: ' + view.why);
      return 4;
    }

    // The census must have finished, or the representative table is a PREFIX of
    // the population and every batch after the cursor is missing. A partial
    // source that emits happily is the failure this check exists for: the
    // manifests would look complete, be internally consistent, and describe a
    // population nobody selected.
    const prog = await sql<
      { finished_at: string | null; rows_seen: string; definition_hash: string }[]
    >`
      SELECT finished_at, rows_seen, definition_hash FROM embedding_census_progress WHERE job = 'tier-census'`;
    const p = prog[0];
    if (!p) {
      console.error('REFUSED: no tier-census has been run. Representatives do not exist yet.');
      console.error('  run: pnpm --filter @lawmind/embed run tier-census');
      return 5;
    }
    if (!p.finished_at && !has('--allow-partial')) {
      console.error(
        'REFUSED: tier-census is INCOMPLETE (' +
          Number(p.rows_seen).toLocaleString() +
          ' rows so far).',
      );
      console.error(
        '  The representative table is a prefix of the population, not the population.',
      );
      console.error('  Wait for it, or pass --allow-partial to deliberately manifest a prefix.');
      return 5;
    }
    if (p.definition_hash !== view.definitionHash) {
      console.error('REFUSED: representatives were built under definition ' + p.definition_hash);
      console.error('  the deployed view is now ' + view.definitionHash);
      console.error('  re-run tier-census --reset before manifesting.');
      return 5;
    }

    await sql`
      INSERT INTO embedding_census_progress (job, definition_version, definition_hash)
      VALUES (${job}, ${CONTRACT_VERSION}, ${view.definitionHash})
      ON CONFLICT (job) DO NOTHING`;

    if (has('--reset')) {
      await sql`UPDATE embedding_census_progress
                   SET cursor = NULL, rows_seen = 0, pages_done = 0,
                       finished_at = NULL, updated_at = now()
                 WHERE job = ${job}`;
      console.log('reset: ' + job + ' cursor cleared');
    }

    const state = await sql<{ cursor: string | null; rows_seen: string; pages_done: number }[]>`
      SELECT cursor, rows_seen, pages_done FROM embedding_census_progress WHERE job = ${job}`;
    let cursor = state[0]?.cursor ?? null;
    let emitted = Number(state[0]?.rows_seen ?? 0);
    let index = state[0]?.pages_done ?? 0;

    mkdirSync(outDir, { recursive: true });
    console.log(
      'tier ' +
        tier +
        ' · batch ' +
        batchSize +
        ' · resuming at batch ' +
        index +
        ' (' +
        emitted.toLocaleString() +
        ' already emitted)',
    );

    const batchHashes: string[] = [];
    let batchesThisRun = 0;

    for (;;) {
      if (maxBatches > 0 && batchesThisRun >= maxBatches) break;
      const page = await batch(sql, tier, cursor, batchSize, withText);
      // An EMPTY page means the representative table is exhausted. An empty
      // `rows` with a non-empty page means the tier's band filter removed
      // everything in this window, which is ordinary for A_CORE and must
      // advance rather than stop.
      if (page.pageRows === 0 || page.pageLastId === null) break;
      const rows = page.rows;
      if (rows.length === 0) {
        cursor = page.pageLastId;
        await sql`
          UPDATE embedding_census_progress
             SET cursor = ${cursor}::uuid, updated_at = now()
           WHERE job = ${job}`;
        if (page.pageRows < batchSize) break;
        continue;
      }

      const ids = rows.map((r) => r.judgmentId);
      const idsHash = createHash('sha256').update(ids.join('\n')).digest('hex');
      batchHashes.push(idsHash);

      const stem = 'tier-' + tier.toLowerCase() + '-batch-' + String(index).padStart(5, '0');

      // JSONL, one object per line. NEW1 streams it: a 100,000-element JSON
      // array has to be fully parsed before the first row is available, and a
      // truncated array is unrecoverable while a truncated JSONL loses only its
      // last line.
      const lines = rows.map((r) =>
        JSON.stringify({
          judgmentId: r.judgmentId,
          contentHash: r.contentHash,
          // Present so a downstream surface can see that a hit on this vector
          // stands for N case identities and MUST fan out before display.
          memberCount: r.memberCount,
          court: r.court,
          year: r.judgmentYear,
          textLength: r.textLength,
          valueBand: r.valueBand,
          // Stratifiers, never filters. NEW2 measured 51.2% of everything ever
          // assessed as unclassifiable, so filtering on class would discard the
          // majority of the corpus for not having been judged. UNKNOWN is not BAD.
          scriptQuality: r.scriptQuality,
          documentClass: r.hcDocumentClass,
          ...(withText ? { text: r.fullText ?? null } : {}),
        }),
      );
      writeFileSync(join(outDir, stem + '.jsonl'), lines.join('\n') + '\n');

      writeFileSync(
        join(outDir, stem + '.meta.json'),
        JSON.stringify(
          {
            job,
            tier,
            batchIndex: index,
            rows: rows.length,
            idsHash,
            contractVersion: CONTRACT_VERSION,
            definitionHash: view.definitionHash,
            representationType: 'document',
            includesText: withText,
            // What the vectors stand for, once dedup is accounted: more case
            // identities than vectors, and by exactly this much.
            caseIdentitiesCovered: rows.reduce((a, r) => a + r.memberCount, 0),
            firstId: ids[0],
            lastId: ids[ids.length - 1],
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ) + '\n',
      );

      // The PAGE's last id, never the last emitted row. Those differ whenever
      // the band filter dropped the tail of a page, and using the emitted one
      // would re-read the dropped rows on the next call — forever, since they
      // would be dropped again.
      cursor = page.pageLastId;
      emitted += rows.length;
      index += 1;
      batchesThisRun += 1;

      await sql`
        UPDATE embedding_census_progress
           SET cursor = ${cursor}::uuid, rows_seen = ${emitted},
               pages_done = ${index}, updated_at = now()
         WHERE job = ${job}`;

      console.log(
        '  ' +
          stem +
          '.jsonl · ' +
          rows.length.toLocaleString() +
          ' rows · ' +
          idsHash.slice(0, 12),
      );
      // Short PAGE means the table is exhausted. A short batch does not.
      if (page.pageRows < batchSize) break;
    }

    const exhausted = maxBatches === 0 || batchesThisRun < maxBatches;
    if (exhausted) {
      await sql`UPDATE embedding_census_progress SET finished_at = now() WHERE job = ${job}`;
    }

    const manifest = {
      job,
      tier,
      complete: exhausted,
      batchSize,
      batches: index,
      rowsEmitted: emitted,
      includesText: withText,
      contractVersion: CONTRACT_VERSION,
      definitionHash: view.definitionHash,
      representationType: 'document',
      // Over the batch hashes IN ORDER. Re-running against unchanged data and
      // an unchanged definition reproduces it exactly; anything else does not.
      manifestHash: createHash('sha256').update(batchHashes.join('\n')).digest('hex'),
      batchHashes,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(outDir, 'manifest-tier-' + tier.toLowerCase() + '.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );

    console.log('');
    console.log(exhausted ? '── MANIFEST COMPLETE ──' : '── MANIFEST PAUSED (resumable) ──');
    console.log('batches      ' + index);
    console.log('rows         ' + emitted.toLocaleString());
    console.log('manifestHash ' + manifest.manifestHash.slice(0, 16));
    console.log('out          ' + outDir);
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
