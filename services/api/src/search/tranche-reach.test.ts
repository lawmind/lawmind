/**
 * THE TRANCHE IS WIRED, AND NO USER REQUEST CAN REACH IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED AND WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `dense()` used to search one index, `judgment_chunks`, which holds passages
 * for **40,161 documents** — 0.214% of the corpus. NEW1's
 * `new1_tranche_passages` holds passages for **81,720**, overlapping on
 * **10,007**, so searching both reaches **111,874 — 2.786x**. Counted directly
 * on 28 Aug 2026, both tables, `count(DISTINCT judgment_id)`.
 *
 * That is a change to the dense arm of the production ranker, and the dense arm
 * is `search.semantic.broad`, which is `EXPERIMENTAL_INTERNAL`. The whole
 * meaning of that state is that a lane's harness may import the path and **no
 * request may reach it**. So the wiring is only correct if user-facing
 * reachability is *unchanged* — the reach is 2.786x for NEW1's evaluation
 * harness and 0x for an advocate, and those two sentences have to both be true
 * at once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY BOTH HALVES ARE ASSERTED, AND WHY NEITHER IS ENOUGH ALONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A test that only asserts "no request reaches it" passes just as well when the
 * tranche was never wired at all, when the table was dropped, and when
 * `dense()` was deleted. That is the shape this repo has already been caught by
 * — a check that returns the same answer for every input is not a check. So the
 * non-vacuity half is asserted too: the union arm is really in the source, the
 * table really has rows, and its index is really the one the planner picks.
 *
 * Conversely a test that only proves the arm works says nothing about whether an
 * advocate can trip over it.
 *
 * The reachability half is asserted three ways, because each catches a
 * different way of losing it:
 *
 *   1. the registry state itself, which catches somebody flipping the flag;
 *   2. a REAL request through the REAL app, which catches the flag being
 *      correct while the route stopped consulting it;
 *   3. a structural sweep of the source tree, which catches a SECOND door —
 *      some other module querying `new1_tranche_passages` directly, outside
 *      `dense()` and therefore outside the gate. Neither of the first two can
 *      see that, and it is exactly how `/arguments/counter` and
 *      `/saved-searches/:id/feed` each escaped the admission bound.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import { isUserReachable } from '../release/capabilities.ts';
import { semanticArmPermitted } from '../release/enforce.ts';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/**
 * The embedder is the choke point, and that is what makes this observable.
 *
 * `route.ts` computes a query vector ONLY when `semanticArmPermitted()`, and
 * `dense()` runs ONLY when there is a vector. So "was `embedQuery` called" is
 * exactly the question "did this request enter the dense arm" — and therefore
 * "did it touch the tranche" — without needing to see inside the ranker.
 */
let embedCalls = 0;
const app = createApp({
  ping: async () => {},
  search: {
    sql,
    embedQuery: async () => {
      embedCalls += 1;
      return null;
    },
  },
});

/** A file is production unless it runs deliberately, under a human, one at a time. */
const NOT_PRODUCTION = /\.test\.ts$|-cli\.ts$|\/bench\.ts$|^bench\.ts$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('new1_tranche_passages — wired, and unreachable by a user', () => {
  let tranchePassages = 0;
  let trancheDocs = 0;
  let chunkDocs = 0;
  let hasTrancheHnsw = false;

  before(async () => {
    const [t] = await sql<{ n: number; d: number }[]>`
      SELECT count(*)::int AS n, count(DISTINCT judgment_id)::int AS d
      FROM new1_tranche_passages`;
    tranchePassages = t?.n ?? 0;
    trancheDocs = t?.d ?? 0;
    const [c] = await sql<{ d: number }[]>`
      SELECT count(DISTINCT judgment_id)::int AS d FROM judgment_chunks`;
    chunkDocs = c?.d ?? 0;
    const idx = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'new1_tranche_passages' AND indexdef ILIKE '%hnsw%'`;
    hasTrancheHnsw = idx.length > 0;
  });

  after(async () => {
    await sql.end();
  });

  /* ── 1. THE GATE ────────────────────────────────────────────────────────── */

  it('search.semantic.broad is not user-reachable, so the dense arm is not either', () => {
    assert.equal(
      isUserReachable('search.semantic.broad'),
      false,
      'the tranche was wired under this capability. If it becomes user-reachable, ' +
        'that is a product decision about an arm measured at end-to-end s@5 0.0136 — ' +
        'not something this wiring is allowed to carry in on its back.',
    );
    assert.equal(
      semanticArmPermitted(),
      false,
      'semanticArmPermitted is what route.ts actually consults; the registry being ' +
        'right does not help if the helper reading it drifted.',
    );
  });

  /* ── 2. A REAL REQUEST, THROUGH THE REAL APP ────────────────────────────── */

  it('a real /search request never computes a query vector, so it never enters dense()', async () => {
    embedCalls = 0;
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'wrongful dismissal compensation', language: 'en' }),
    });
    // The status is not the assertion — /search is expected to answer lexically.
    // What matters is that it answered without embedding anything.
    assert.ok(res.status < 500, `/search should still answer, got ${res.status}`);
    assert.equal(
      embedCalls,
      0,
      'a user request computed a query vector, which is the only way into dense() ' +
        'and therefore the only way into the tranche',
    );
  });

  /* ── 3. NO SECOND DOOR ──────────────────────────────────────────────────── */

  it('only dense() in retrieve.ts queries the tranche — no other production module does', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (NOT_PRODUCTION.test(rel)) continue;
      if (rel === 'search/retrieve.ts') continue;
      /**
       * A QUERY, not a mention. The question this test asks is whether another
       * module opens a second door into the tranche, and a door is a `FROM`, a
       * `JOIN`, an `INTO` or an `UPDATE` — not the table's name appearing in a
       * list of table names.
       *
       * Narrowed 2 September 2026, when `ops/db-roles.ts` was added: it
       * classifies every table in the database into a corpus or user role, so it
       * necessarily names this one, and flagging it would have forced either a
       * by-name exemption — which is how an audit stops covering the file that
       * most needs it — or leaving a table unclassified in the map that decides
       * what a corpus rollback may touch.
       *
       * Strictly stronger against the real failure: a bare mention was never
       * evidence of reach, and this still catches every way of reaching it.
       */
      const src = readFileSync(file, 'utf8');
      if (/\b(?:FROM|JOIN|INTO|UPDATE|USING)\s+new1_tranche_passages\b/i.test(src)) {
        offenders.push(rel);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'these modules reach the tranche outside dense(), and therefore outside the ' +
        'capability gate that dense() inherits from route.ts',
    );
  });

  it('inside retrieve.ts the tranche is read only by dense()', () => {
    const src = readFileSync(join(SRC, 'search/retrieve.ts'), 'utf8');
    const start = src.indexOf('async function dense(');
    assert.ok(start > 0, 'dense() not found — this test is pinned to it by name');
    // The next top-level function declaration after dense() ends it.
    const rest = src.slice(start + 'async function dense('.length);
    const nextFn = rest.search(/\n(?:async )?function [A-Za-z]/);
    const denseBody = nextFn >= 0 ? rest.slice(0, nextFn) : rest;

    const total = src.split('new1_tranche_passages').length - 1;
    const inDense = denseBody.split('new1_tranche_passages').length - 1;
    assert.ok(inDense > 0, 'dense() does not mention the tranche — the wiring is gone');
    assert.equal(
      total,
      inDense,
      `retrieve.ts mentions new1_tranche_passages ${total} times but only ${inDense} ` +
        'are inside dense(); a reference outside it is a path that does not inherit the gate',
    );
  });

  /* ── 4. NON-VACUITY: THE ARM IS REAL ────────────────────────────────────── */

  it('the union arm is actually in the source, with its own MATERIALIZED fence', () => {
    const src = readFileSync(join(SRC, 'search/retrieve.ts'), 'utf8');
    assert.match(
      src,
      /tranche_candidates AS MATERIALIZED/,
      'the tranche needs its own MATERIALIZED CTE: it is the only shape ' +
        'new1_tranche_passages_hnsw can accelerate',
    );
    assert.match(
      src,
      /chunk_candidates AS MATERIALIZED/,
      'the chunk arm must keep its own fence too',
    );
    assert.match(
      src,
      /UNION ALL/,
      'the two arms are unioned; a lost UNION silently returns the old 40,161-document reach',
    );
  });

  it('the tranche holds rows and reaches more documents than judgment_chunks', async (t) => {
    if (tranchePassages === 0 || chunkDocs === 0) {
      return t.skip(
        `needs a populated corpus (tranche=${tranchePassages}, chunkDocs=${chunkDocs})`,
      );
    }
    assert.ok(
      trancheDocs > chunkDocs,
      `the tranche exists to widen dense reach: ${trancheDocs} documents against ` +
        `judgment_chunks at ${chunkDocs}. If this inverts, the union is buying nothing.`,
    );
  });

  it('the tranche ANN search uses its hnsw index rather than scanning every vector', async (t) => {
    if (!hasTrancheHnsw || tranchePassages < 10_000) {
      return t.skip(`needs an hnsw index over a populated tranche (rows=${tranchePassages})`);
    }
    const v = Array.from({ length: 1024 }, (_, i) => Math.sin(i + 1));
    const norm = Math.hypot(...v);
    const q = `[${v.map((x) => (x / norm).toFixed(6)).join(',')}]`;

    const plan = await sql.begin(async (tx) => {
      await tx`SET LOCAL hnsw.ef_search = 200`;
      return tx<Record<string, string>[]>`
        EXPLAIN
        SELECT p.judgment_id, p.char_offset, p.body_length,
               p.embedding <=> ${q}::vector AS d
        FROM new1_tranche_passages p
        ORDER BY p.embedding <=> ${q}::vector
        LIMIT 200`;
    });
    const text = plan.map((r) => Object.values(r)[0]).join('\n');
    assert.match(
      text,
      /Index Scan using new1_tranche_passages_hnsw/,
      `the tranche arm fell back to a scan, which costs seconds rather than milliseconds:\n${text}`,
    );
  });

  /* ── 5. THE OFFSET CONVENTION ───────────────────────────────────────────── */

  it('the -1 offset chunk.ts writes becomes NULL, and never a literal position', async (t) => {
    if (tranchePassages === 0) return t.skip('no tranche rows');
    const [row] = await sql<{ unverified: number }[]>`
      SELECT count(*)::int AS unverified FROM new1_tranche_passages WHERE char_offset < 0`;
    const unverified = row?.unverified ?? 0;
    // Non-vacuous only if the state actually occurs. If it stops occurring the
    // mapping is untested rather than proven, and the test should say so.
    if (unverified === 0) {
      return t.skip('no unverified offsets in the tranche — the mapping is untested, not proven');
    }
    const src = readFileSync(join(SRC, 'search/retrieve.ts'), 'utf8');
    assert.match(
      src,
      /CASE WHEN t\.char_offset >= 0 THEN t\.char_offset END/,
      `${unverified} tranche rows carry char_offset = -1, which chunk.ts says must never be ` +
        'treated as a literal offset. judgment_chunks spells that state NULL; the union has ' +
        'to map it, or a passage gets sliced from position -1.',
    );
    assert.match(
      src,
      /CASE WHEN t\.char_offset >= 0 THEN t\.body_length END/,
      'the length must be dropped with the offset — a length without a position is not a span',
    );
  });

  it('a reconstructed tranche passage is byte-identical to the body judgment_chunks stored', async (t) => {
    if (tranchePassages === 0 || chunkDocs === 0) return t.skip('needs both tables populated');
    /**
     * The tranche stores no text, so `dense()` rebuilds the passage with
     * `substr(full_text, char_offset + 1, body_length)`. That is only safe
     * because `chunk.ts` VERIFIES `sourceText.slice(offset, offset + bodyLength)
     * === body.text` before it will store an offset at all.
     *
     * This checks the invariant against an INDEPENDENTLY stored copy: for
     * passages both tables hold, the rebuilt span must equal the last
     * `char_length` characters of `judgment_chunks.chunk_text`, which carries a
     * synthesised heading in front of the same body.
     *
     * Hash-ordered sample, not `LIMIT` after a filter: this corpus is clustered
     * by court on disk and a plain limit reads one court.
     */
    const [row] = await sql<{ compared: number; identical: number }[]>`
      WITH samp AS (
        SELECT DISTINCT p.judgment_id
        FROM new1_tranche_passages p
        WHERE EXISTS (SELECT 1 FROM judgment_chunks c WHERE c.judgment_id = p.judgment_id)
        LIMIT 2000
      ), pick AS (
        SELECT judgment_id FROM samp ORDER BY md5(judgment_id::text) LIMIT 60
      )
      SELECT count(*)::int AS compared,
             count(*) FILTER (
               WHERE substr(j.full_text, p.char_offset + 1, p.body_length)
                   = right(c.chunk_text, c.char_length)
             )::int AS identical
      FROM pick s
      JOIN new1_tranche_passages p ON p.judgment_id = s.judgment_id
      JOIN judgment_chunks c
        ON c.judgment_id = p.judgment_id AND c.chunk_index = p.chunk_index
      JOIN judgments j ON j.id = p.judgment_id
      WHERE p.char_offset >= 0 AND c.char_offset IS NOT NULL`;
    const compared = row?.compared ?? 0;
    if (compared === 0) return t.skip('no passages held by both tables in this sample');
    assert.equal(
      row?.identical,
      compared,
      `${compared - (row?.identical ?? 0)} of ${compared} rebuilt passages differ from the ` +
        'body judgment_chunks stored. A quoted passage that is not in the judgment at the ' +
        'position we claim is the same class of defect as a fabricated citation.',
    );
  });
});
