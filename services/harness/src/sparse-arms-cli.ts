/**
 * `pnpm --filter @lawmind/harness sparse:arms` — P4. Which bounded lexical policy
 * should replace a 15-second timeout that contributes nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SITUATION THIS DECIDES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC measured (bus 1014) that with a `statement_timeout` on the API pool, the
 * sparse arm times out on **6 of 6** concept queries, p50 15.1 s. So production
 * concept search is ALREADY dense-only in effect — the lexical half costs the
 * whole budget and returns nothing.
 *
 * "Delete it then" is the tempting conclusion and it is not safe to reach
 * without numbers, for a reason the coverage figures make plain: the dense arm
 * searches `judgment_chunks`, which holds **40,161 distinct judgments** — 0.21%
 * of the corpus and effectively Supreme Court only — while the sparse arm is the
 * only arm that searches all 18.7M. Removing it is not a no-op; it is a
 * coverage decision.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARMS, all on the SAME queries, in the SAME session
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   A CURRENT              `sparse()` exactly as production runs it: AND pass,
 *                          and below `SPARSE_RELAX_BELOW` rows the OR pass, the
 *                          larger result winning. Queries over
 *                          `SPARSE_AND_MAX_CHARS` go straight to OR.
 *   C NO_ALL_COMMON        the OR pass with the all-common fallback DELETED:
 *                          when no lexeme is at or below the df ceiling the arm
 *                          returns nothing instead of OR-ing every common word.
 *                          This is the dossier's LONG_QUERY_POLICY_V1 (1).
 *   D RAREST_N_AND         the N rarest lexemes, ANDed, ranked, LIMIT 50.
 *                          Deterministic and bounded by construction.
 *   E RAREST_N_OR          the same N lexemes ORed — same candidate bound, wider
 *                          recall, and the arm that says whether AND or OR is
 *                          what actually costs the time at equal term count.
 *
 * Arm B (dense-only) is not run as a query here: it is the CONTROL and it is a
 * coverage fact, reported as "is the gold reachable in `judgment_chunks` at
 * all". A dense arm cannot find what it does not hold, and that number belongs
 * next to every latency figure rather than inside one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REPORTED, AND WHY ALL THREE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * QUALITY (gold found, gold rank) · SAFETY/COVERAGE (rows returned, arms that
 * returned nothing, dense reachability) · LATENCY (p50/p95/timeouts). A fast arm
 * that finds nothing and a slow arm that finds everything are both failures, and
 * only reporting all three makes them distinguishable.
 *
 * Every arm carries the SAME `statement_timeout` as production, and a timeout is
 * recorded as a timeout — never as a zero-result.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

/** Copies of `retrieve.ts` constants — a copy, not an import, so a server edit cannot retune the instrument silently. */
const CANDIDATE_DEPTH = 50;
const SPARSE_MAX_DOCUMENT_FREQUENCY = 0.5;
const SPARSE_RELAX_BELOW = 10;
const SPARSE_AND_MAX_CHARS = 200;
/** Production's own bound, from LCC's pool change (bus 1014). */
const STATEMENT_TIMEOUT_MS = Number(process.env['ARM_TIMEOUT_MS'] ?? 15_000);
/** How many rarest lexemes arms D and E are allowed. */
const RAREST_N = Number(process.env['RAREST_N'] ?? 3);
const SAMPLE = Number(process.env['ARM_SAMPLE'] ?? 60);

const OUT = new URL('../../../docs/ai/new1-tier-a/sparse-arms.json', import.meta.url);
const CKPT = new URL('../../../docs/ai/new1-tier-a/sparse-arms.checkpoint.jsonl', import.meta.url);

type ArmResult = { rows: number; goldRank: number | null; ms: number; timedOut: boolean; note?: string };
type Row = {
  queryId: string;
  launchClass: string;
  goldId: string;
  chars: number;
  denseReachable: boolean;
  arms: Record<string, ArmResult>;
};

const isTimeout = (e: unknown): boolean =>
  /canceling statement|timeout/i.test(String((e as { message?: string }).message ?? e));

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = buildLaunchGold();
  // Stratified and deterministic: alternate the two semantic classes in gold order.
  const nl = gold.rows.filter((r) => r.launchClass === 'nl_doctrine');
  const fp = gold.rows.filter((r) => r.launchClass === 'fact_passage');
  const picked: typeof nl = [];
  for (let i = 0; picked.length < SAMPLE && (i < nl.length || i < fp.length); i += 1) {
    if (i < nl.length && picked.length < SAMPLE) picked.push(nl[i]!);
    if (i < fp.length && picked.length < SAMPLE) picked.push(fp[i]!);
  }

  const sql = postgres(url, {
    max: 2,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS + 5_000 },
  });

  const done = new Set<string>();
  const results: Row[] = [];
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const r = JSON.parse(line) as Row;
        done.add(r.queryId);
        results.push(r);
      } catch {
        /* truncated final line */
      }
    }
  }
  process.stdout.write(`sparse arms  sample=${picked.length}  done=${done.size}  timeout=${STATEMENT_TIMEOUT_MS}ms  rarestN=${RAREST_N}\n`);

  /** Every arm runs inside its own transaction with production's ceiling on it. */
  async function timed(fn: (tx: postgres.TransactionSql) => Promise<{ id: string }[]>, goldId: string): Promise<ArmResult> {
    const t = Date.now();
    try {
      const rows = await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        return await fn(tx);
      });
      const at = rows.findIndex((r) => r.id === goldId);
      return { rows: rows.length, goldRank: at === -1 ? null : at + 1, ms: Date.now() - t, timedOut: false };
    } catch (e) {
      if (!isTimeout(e)) throw e;
      return { rows: 0, goldRank: null, ms: Date.now() - t, timedOut: true };
    }
  }

  for (const [i, g] of picked.entries()) {
    if (done.has(g.queryId)) continue;
    const q = g.query;
    const row: Row = {
      queryId: g.queryId,
      launchClass: g.launchClass,
      goldId: g.goldAuthorityId,
      chars: q.length,
      denseReachable: false,
      arms: {},
    };

    // CONTROL — arm B. Not a query shape, a coverage fact.
    const [dr] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM (
        SELECT 1 FROM judgment_chunks WHERE judgment_id = ${g.goldAuthorityId} LIMIT 1
      ) s`;
    row.denseReachable = Number(dr!.n) > 0;

    // ARM A — production's `sparse()`, branch for branch.
    if (q.length > SPARSE_AND_MAX_CHARS) {
      row.arms['A_CURRENT'] = await timed((tx) => sparseAny(tx, q), g.goldAuthorityId);
      row.arms['A_CURRENT']!.note = 'OR pass (over SPARSE_AND_MAX_CHARS)';
    } else {
      const andPass = await timed((tx) => andSearch(tx, q), g.goldAuthorityId);
      if (andPass.timedOut || andPass.rows >= SPARSE_RELAX_BELOW) {
        row.arms['A_CURRENT'] = { ...andPass, note: 'AND pass kept' };
      } else {
        const or = await timed((tx) => sparseAny(tx, q), g.goldAuthorityId);
        row.arms['A_CURRENT'] =
          or.rows > andPass.rows
            ? { ...or, ms: or.ms + andPass.ms, note: 'AND then OR, OR kept' }
            : { ...andPass, ms: or.ms + andPass.ms, note: 'AND then OR, AND kept' };
      }
    }

    row.arms['C_NO_ALL_COMMON'] = await timed((tx) => sparseAny(tx, q, true), g.goldAuthorityId);
    row.arms['D_RAREST_N_AND'] = await timed((tx) => rarestN(tx, q, '&'), g.goldAuthorityId);
    row.arms['E_RAREST_N_OR'] = await timed((tx) => rarestN(tx, q, '|'), g.goldAuthorityId);

    appendFileSync(CKPT, `${JSON.stringify(row)}\n`);
    results.push(row);
    const fmt = (k: string): string => {
      const a = row.arms[k]!;
      return `${k.split('_')[0]}:${a.timedOut ? 'TO' : `${a.rows}r/${a.goldRank ?? '-'}`}@${a.ms}ms`;
    };
    process.stdout.write(
      `${String(i + 1).padStart(3)}/${picked.length} ${g.launchClass.padEnd(13)} ${row.chars}c dense=${row.denseReachable ? 'Y' : 'n'}  ${['A_CURRENT', 'C_NO_ALL_COMMON', 'D_RAREST_N_AND', 'E_RAREST_N_OR'].map(fmt).join('  ')}\n`,
    );
  }

  // ── Summary, all three dimensions per arm ────────────────────────────────
  const armNames = ['A_CURRENT', 'C_NO_ALL_COMMON', 'D_RAREST_N_AND', 'E_RAREST_N_OR'];
  const byArm: Record<string, unknown> = {};
  for (const name of armNames) {
    const rs = results.map((r) => r.arms[name]).filter((a): a is ArmResult => a !== undefined);
    const ms = rs.map((a) => a.ms).sort((a, b) => a - b);
    byArm[name] = {
      queries: rs.length,
      goldFound: rs.filter((a) => a.goldRank !== null).length,
      goldAt1: rs.filter((a) => a.goldRank === 1).length,
      goldAt5: rs.filter((a) => a.goldRank !== null && a.goldRank <= 5).length,
      goldAt50: rs.filter((a) => a.goldRank !== null).length,
      emptyResult: rs.filter((a) => !a.timedOut && a.rows === 0).length,
      timeouts: rs.filter((a) => a.timedOut).length,
      latencyMs: {
        p50: ms[Math.floor(ms.length * 0.5)] ?? null,
        p95: ms[Math.floor(ms.length * 0.95)] ?? null,
        max: ms[ms.length - 1] ?? null,
      },
    };
  }
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        kind: 'new1_sparse_arms',
        measuredAt: new Date().toISOString(),
        frozenHash: gold.frozenHash,
        conditions: 'LOCAL_CONTENDED — the Tier-A GPU walk was staging throughout',
        constants: { CANDIDATE_DEPTH, SPARSE_MAX_DOCUMENT_FREQUENCY, SPARSE_RELAX_BELOW, SPARSE_AND_MAX_CHARS, STATEMENT_TIMEOUT_MS, RAREST_N },
        sample: results.length,
        denseControl: {
          note: 'arm B is a coverage fact, not a query: judgment_chunks holds 40,161 distinct judgments',
          goldReachableInChunks: results.filter((r) => r.denseReachable).length,
          of: results.length,
        },
        byArm,
        rows: results,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`\n${JSON.stringify(byArm, null, 2)}\nWROTE ${OUT.pathname}\n`);
  await sql.end();
}

/** production `sparse()`'s AND pass. */
function andSearch(tx: postgres.TransactionSql, q: string): Promise<{ id: string }[]> {
  return tx<{ id: string }[]>`
    SELECT j.id
    FROM judgments j, plainto_tsquery('english', ${q}) AS qq
    WHERE j.full_text_tsv @@ qq
    ORDER BY ts_rank(j.full_text_tsv, qq) DESC
    LIMIT ${CANDIDATE_DEPTH}`;
}

/**
 * production `sparseAny()`. `dropAllCommon` removes the fallback that ORs every
 * lexeme when none is rare enough — arm C.
 */
function sparseAny(tx: postgres.TransactionSql, q: string, dropAllCommon = false): Promise<{ id: string }[]> {
  return tx<{ id: string }[]>`
    WITH scored AS (
      SELECT l.lexeme,
             coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
        FROM unnest(to_tsvector('english', ${q})) AS l
        LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ),
    discriminating AS (
      SELECT lexeme, df FROM scored WHERE df <= ${SPARSE_MAX_DOCUMENT_FREQUENCY}
    ),
    lex AS (
      SELECT lexeme FROM (
        SELECT lexeme, df FROM discriminating
        UNION ALL
        SELECT lexeme, df FROM scored
         WHERE ${dropAllCommon ? tx`FALSE` : tx`NOT EXISTS (SELECT 1 FROM discriminating)`}
      ) candidates
      ORDER BY df ASC, length(lexeme) DESC
      LIMIT 40
    ),
    qy AS (
      SELECT to_tsquery('english', string_agg(quote_literal(lexeme), ' | ')) AS tsq FROM lex
    )
    SELECT j.id
      FROM judgments j, qy
     WHERE qy.tsq IS NOT NULL
       AND j.full_text_tsv @@ qy.tsq
     ORDER BY ts_rank(j.full_text_tsv, qy.tsq) DESC
     LIMIT ${CANDIDATE_DEPTH}`;
}

/** Arms D and E: the N rarest lexemes only, joined by `op`. */
function rarestN(tx: postgres.TransactionSql, q: string, op: '&' | '|'): Promise<{ id: string }[]> {
  return tx<{ id: string }[]>`
    WITH scored AS (
      SELECT l.lexeme,
             coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
        FROM unnest(to_tsvector('english', ${q})) AS l
        LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ),
    lex AS (
      SELECT lexeme FROM scored ORDER BY df ASC, length(lexeme) DESC LIMIT ${RAREST_N}
    ),
    qy AS (
      SELECT to_tsquery('english', string_agg(quote_literal(lexeme), ${` ${op} `})) AS tsq FROM lex
    )
    SELECT j.id
      FROM judgments j, qy
     WHERE qy.tsq IS NOT NULL
       AND j.full_text_tsv @@ qy.tsq
     ORDER BY ts_rank(j.full_text_tsv, qy.tsq) DESC
     LIMIT ${CANDIDATE_DEPTH}`;
}

await main();
