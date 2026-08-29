/**
 * NEW2 — R10 §4. THE RESUMABLE CITATION-GRAPH EXPANSION JOB.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES, AND THE ONE THING IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Walks the unresolved half of `judgment_citations`, asks the deterministic
 * resolver about each reference, and — only under `--apply` and only past the
 * gate below — writes `cited_judgment_id` for the references that resolve to
 * exactly one held judgment.
 *
 * It never pins a rank-1 candidate. AMBIGUOUS stays unresolved with every
 * candidate journalled; TARGET_NOT_HELD stays unresolved; REFUSED stays
 * unresolved. `resolver.ts` forbids folding an ambiguity down to one judgment
 * and this is the caller that would be tempted to.
 *
 * It also never writes `relationship`. A resolved citation is a POINTER, not a
 * treatment: `A cites B` says A printed B's citation and nothing about whether A
 * followed, doubted or overruled it. Resolver coverage going up must never make
 * currentness coverage go up, and the only column touched here is the pointer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE APPLY GATE IS MECHANICAL, NOT REMEMBERED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `resolver.ts` says a corpus backfill is forbidden until the truth battery is
 * finished, the fifth agent confirms safety, and an approved sample shows ZERO
 * material false unique resolutions. A rule somebody remembers is a rule that
 * gets skipped on the day they are not looking, so `--apply` re-derives it here
 * at run time and refuses out loud:
 *
 *   1. `readKeyFreshness(sql).state` must be CURRENT. A stale key index makes
 *      "exactly one candidate" mean "exactly one candidate we have got round to
 *      indexing", and 33,013 shared-neutral groups once answered UNIQUE with
 *      total confidence from an index 309,130 citations behind.
 *   2. The risk replay artifact must exist, be in WRITE mode, and report
 *      `false_unique_rate === 0` over a non-empty truth set.
 *   3. `--confirm` must be passed explicitly.
 *
 * Any of the three missing is a refusal with the reason printed, never a
 * downgrade to a smaller write.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DURABLE PER-ROW STATE, AND WHY AN ID WATERMARK IS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every decided edge is journalled by id with its state and candidates, flushed
 * per batch. Resumption reads the journal and skips what it holds, so a kill at
 * any point costs at most one batch.
 *
 * The scan cursor is `judgment_citations.id`, which is a random v4 uuid. That is
 * a fine cursor for sweeping a SNAPSHOT and a terrible frontier for catching new
 * work: a row inserted after the sweep passed a given id lands BELOW the cursor
 * at random and is never seen (`an-id-watermark-cannot-see-new-rows` — a whole
 * pass once exited clean having skipped every later row). So the run records
 * `sweepStartedAt`, and rows created after it are a SEPARATE catch-up selection
 * on `created_at`, not something the id cursor is trusted to reach.
 *
 * Usage:
 *   tsx scripts/n2-citation-expand.mts [--limit N] [--batch 2000]
 *                                      [--journal <path>] [--apply --confirm]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

import { readKeyFreshness } from '../services/api/src/citations/key-freshness.ts';
import { resolveBatch, RESOLVER_VERSION } from '../services/api/src/citations/resolver.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const has = (name: string) => process.argv.includes(`--${name}`);

const LIMIT = Number(arg('limit', String(Number.POSITIVE_INFINITY)));
const BATCH = Number(arg('batch', '2000'));
const JOURNAL = join(ROOT, arg('journal', '.tmp-new2/citation-expand-journal.ndjson'));
const STATE = JOURNAL.replace(/\.ndjson$/, '') + '.state.json';
const SUMMARY = join(ROOT, arg('summary', 'docs/ai/new2-r10/citation-expansion.json'));
const RISK_REPLAY = join(ROOT, arg('risk-replay', 'docs/ai/new2-r8/resolver-risk-replay.json'));
const APPLY = has('apply');
const CONFIRM = has('confirm');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type RunState = {
  sweepStartedAt: string;
  cursor: string | null;
  decided: number;
  applied: number;
  resolverVersion: string;
};

const sql = postgres(databaseUrl(), { max: 3, idle_timeout: 30, connect_timeout: 60, onnotice: () => {} });

try {
  const freshness = await readKeyFreshness(sql);

  // ── the gate ─────────────────────────────────────────────────────────────
  const refusals: string[] = [];
  let replay: Record<string, unknown> | null = null;
  if (APPLY) {
    if (freshness.state !== 'CURRENT') {
      refusals.push(`key index freshness is ${freshness.state}, not CURRENT — "exactly one candidate" is not assertable`);
    }
    if (!existsSync(RISK_REPLAY)) {
      refusals.push(`risk replay artifact absent at ${RISK_REPLAY}`);
    } else {
      replay = JSON.parse(readFileSync(RISK_REPLAY, 'utf8')) as Record<string, unknown>;
      const totals = replay['totals'] as { records?: number; false_unique?: number } | undefined;
      if (replay['mode'] !== 'WRITE') refusals.push(`risk replay mode is ${String(replay['mode'])}, not WRITE`);
      if (!totals?.records) refusals.push('risk replay covered no records');
      if (replay['false_unique_rate'] !== 0) {
        refusals.push(`risk replay false_unique_rate is ${String(replay['false_unique_rate'])}, not 0`);
      }
    }
    if (!CONFIRM) refusals.push('--confirm was not passed');
  }
  if (APPLY && refusals.length) {
    console.error('REFUSING TO APPLY. The gate is re-derived at run time, never remembered:');
    for (const r of refusals) console.error(`  - ${r}`);
    process.exit(3);
  }

  // ── resumable state ──────────────────────────────────────────────────────
  mkdirSync(dirname(JOURNAL), { recursive: true });
  let state: RunState;
  if (existsSync(STATE)) {
    state = JSON.parse(readFileSync(STATE, 'utf8')) as RunState;
    if (state.resolverVersion !== RESOLVER_VERSION) {
      console.error(
        `journal was written by ${state.resolverVersion}, this is ${RESOLVER_VERSION}. ` +
          'Refusing to resume across a resolver version change — the decisions are not comparable. ' +
          'Move the journal aside to start a fresh sweep.',
      );
      process.exit(4);
    }
    console.log(`[expand] resuming sweep started ${state.sweepStartedAt} at cursor ${state.cursor}`);
  } else {
    state = {
      sweepStartedAt: new Date().toISOString(),
      cursor: null,
      decided: 0,
      applied: 0,
      resolverVersion: RESOLVER_VERSION,
    };
    writeFileSync(JOURNAL, '');
  }

  const tally: Record<string, number> = {};
  const startedAt = Date.now();
  let processed = 0;
  let applied = 0;

  for (;;) {
    if (processed >= LIMIT) break;
    const take = Math.min(BATCH, LIMIT - processed);
    const rows = await sql<{ id: string; raw: string }[]>`
      SELECT id, COALESCE(NULLIF(btrim(normalised_citation), ''), citation_text) AS raw
        FROM judgment_citations
       WHERE cited_judgment_id IS NULL
         AND COALESCE(citation_text, '') <> ''
         AND created_at <= ${state.sweepStartedAt}::timestamptz
         ${state.cursor ? sql`AND id > ${state.cursor}::uuid` : sql``}
       ORDER BY id
       LIMIT ${take}`;
    if (rows.length === 0) break;

    const results = await resolveBatch(sql, rows.map((r) => r.raw), freshness);

    const pins: { id: string; cited: string }[] = [];
    let journal = '';
    results.forEach((r, i) => {
      const row = rows[i]!;
      tally[r.state] = (tally[r.state] ?? 0) + 1;
      if (r.state === 'UNIQUE' && r.candidates.length === 1) {
        pins.push({ id: row.id, cited: r.candidates[0]!.judgmentId });
      }
      journal +=
        JSON.stringify({
          edgeId: row.id,
          raw: r.raw,
          key: r.key,
          state: r.state,
          heldCandidates: r.heldCandidates,
          candidates: r.candidates.map((c) => c.judgmentId),
          refusedReason: r.refusedReason,
          version: r.version,
          at: new Date().toISOString(),
        }) + '\n';
    });

    if (APPLY && pins.length) {
      /*
       * One statement per batch, and it re-asserts `cited_judgment_id IS NULL`
       * in the WHERE so a concurrent resolution by another lane is never
       * overwritten. `relationship` is untouched: this writes a pointer, not a
       * treatment.
       */
      const ids = pins.map((p) => p.id);
      const cited = pins.map((p) => p.cited);
      const res = await sql`
        UPDATE judgment_citations jc
           SET cited_judgment_id = v.cited::uuid
          FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cited}::uuid[]) AS cited) v
         WHERE jc.id = v.id
           AND jc.cited_judgment_id IS NULL`;
      applied += res.count;
      state.applied += res.count;
    }

    appendFileSync(JOURNAL, journal);
    state.cursor = rows.at(-1)!.id;
    state.decided += rows.length;
    processed += rows.length;
    writeFileSync(STATE, JSON.stringify(state, null, 1));

    if (processed % 50_000 < BATCH) {
      const secs = (Date.now() - startedAt) / 1000;
      console.log(
        `[expand] ${processed} decided · ${applied} applied · ${Math.round(processed / secs)} rows/sec · cursor ${state.cursor}`,
      );
    }
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  const [{ n: resolvedNow }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM judgment_citations WHERE cited_judgment_id IS NOT NULL`;
  const [{ n: unresolvedNow }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM judgment_citations
     WHERE cited_judgment_id IS NULL AND COALESCE(citation_text,'') <> ''`;
  const [{ n: distinctEdges }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM (
      SELECT DISTINCT citing_judgment_id, cited_judgment_id
        FROM judgment_citations WHERE cited_judgment_id IS NOT NULL) t`;
  const [{ n: catchup }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM judgment_citations
     WHERE cited_judgment_id IS NULL AND COALESCE(citation_text,'') <> ''
       AND created_at > ${state.sweepStartedAt}::timestamptz`;

  const summary = {
    artifact: 'NEW2_CITATION_EXPANSION_R10',
    lane: 'NEW2',
    mode: APPLY ? 'APPLY' : 'DECIDE_ONLY',
    resolverVersion: RESOLVER_VERSION,
    indexFreshness: freshness.state,
    gate: APPLY
      ? {
          keyFreshness: freshness.state,
          riskReplayMode: replay?.['mode'] ?? null,
          riskReplayRecords: (replay?.['totals'] as { records?: number } | undefined)?.records ?? null,
          riskReplayFalseUniqueRate: replay?.['false_unique_rate'] ?? null,
          confirmed: CONFIRM,
        }
      : { note: 'decide-only run; the apply gate was not evaluated' },
    sweep: {
      startedAt: state.sweepStartedAt,
      cursor: state.cursor,
      decidedThisRun: processed,
      decidedTotal: state.decided,
      appliedThisRun: applied,
      appliedTotal: state.applied,
      elapsedSeconds: Number(elapsed.toFixed(1)),
      rowsPerSecond: Math.round(processed / Math.max(elapsed, 0.001)),
      journal: JOURNAL,
      cursorCaveat:
        'the id cursor sweeps a snapshot taken at sweepStartedAt; rows created after it are the catch-up selection below, never something a random-uuid watermark is trusted to reach',
      rowsCreatedAfterSweepStart: Number(catchup),
    },
    states: tally,
    corpus: {
      resolvedRows: Number(resolvedNow),
      unresolvedRows: Number(unresolvedNow),
      distinctResolvedEdges: Number(distinctEdges),
    },
    neverWritten: ['relationship', 'evidence', 'overruled_status', 'verification_state'],
  };
  mkdirSync(dirname(SUMMARY), { recursive: true });
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 1));

  console.log(`[expand] ${processed} decided, ${applied} applied, ${elapsed.toFixed(0)}s`);
  console.log(`[expand] states ${JSON.stringify(tally)}`);
  console.log(`[expand] distinct resolved edges now ${distinctEdges}`);
  console.log(`[expand] wrote ${SUMMARY}`);
} finally {
  await sql.end({ timeout: 15 });
}
