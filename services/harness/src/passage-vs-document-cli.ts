/**
 * `pnpm --filter @lawmind/harness rep:passage` — P3's one arm that the P2
 * evidence actually justifies: does indexing PASSAGES instead of a whole
 * document fix the granularity mismatch?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT P2 ESTABLISHED, AND WHY THIS IS THE ONLY ARM WORTH GPU TIME
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Same documents, two queries (`DENSE_FAILURE_ANALYSIS.md` §2.4):
 *
 *   query = the document's whole embedded head text   ->  rank 1, 68 of 68
 *   query = ONE SENTENCE from inside that same text   ->  top-5 17.5%
 *
 * A `HEAD:4800` vector is one point for 4,800 characters. A sentence is a few
 * percent of that and shares its legal register with hundreds of thousands of
 * judgments, so its vector lands where the document's centroid is not the
 * nearest member. That predicts a specific, falsifiable thing: **cut the same
 * text into passages, embed each, and the same sentence query should find its
 * own document far more often — with no model change, no longer window, and no
 * index change.**
 *
 * Every other candidate was refuted first: the index (ANN_MISS 3.7%), the
 * document vector itself (self-retrieval 68/68 at rank 1), truncation (worth
 * about 8 points, measured by character offset), query length (flat).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESIGN, AND ITS HONEST LIMITS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PAIRED, over the SAME document set, so the two arms cannot differ by corpus:
 *
 *   ARM DOC      the existing `HEAD:4800` vectors, restricted to the subset
 *   ARM PASSAGE  the SAME documents' SAME head text, cut into overlapping
 *                passages of PASSAGE_CHARS, each embedded, judgment scored by
 *                its best passage
 *
 * The subset is deliberately small — a few thousand documents — because this is
 * a MECHANISM test, not a benchmark. Both arms see the same distractors, so the
 * comparison is valid; neither absolute number transfers to a 257k or 8.85M
 * corpus, and this file says so in its own output rather than leaving it to be
 * misread later.
 *
 * Passages come from the same `left(full_text, HEAD_CHARS)` the stored vector
 * used, NOT from the whole judgment. That isolates ONE variable. Extending the
 * window is a separate question, already measured as worth about 8 points, and
 * mixing the two would leave neither answered.
 *
 * GPU: the sidecar is shared with the Tier-A walk, which is the priority job.
 * The subset size is chosen so this costs minutes, and the cost is reported.
 */
import { writeFileSync } from 'node:fs';

// GPU sidecar, not the in-process CPU embedder. See harness-embedder.ts: the CPU
// default is right for production and was silently starving the Tier-A walk here.
import { getHarnessEmbedder } from './harness-embedder.ts';
import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const PROBE = process.env['PROBE_TABLE'] ?? 'new1_probe_half_250k';
const HEAD_CHARS = Number(process.env['HEAD_CHARS'] ?? 4800);
const PASSAGE_CHARS = Number(process.env['PASSAGE_CHARS'] ?? 1200);
const PASSAGE_STRIDE = Number(process.env['PASSAGE_STRIDE'] ?? 900);
/** Distractors drawn from the probe, deterministically by id order. */
const DISTRACTORS = Number(process.env['DISTRACTORS'] ?? 2500);
const TOP_K = 20;
const OUT = new URL('../../../docs/ai/new1-tier-a/passage-vs-document.json', import.meta.url);

const cos = (a: Float32Array | number[], b: Float32Array | number[]): number => {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d += (a[i] as number) * (b[i] as number);
  return d;
};

function passages(text: string): string[] {
  const head = text.slice(0, HEAD_CHARS);
  if (head.length <= PASSAGE_CHARS) return [head];
  const out: string[] = [];
  for (let i = 0; i + 1 < head.length; i += PASSAGE_STRIDE) {
    const p = head.slice(i, i + PASSAGE_CHARS);
    if (p.trim().length > 0) out.push(p);
    if (i + PASSAGE_CHARS >= head.length) break;
  }
  return out;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = buildLaunchGold();
  const semantic = gold.rows.filter(
    (r) => r.launchClass === 'nl_doctrine' || r.launchClass === 'fact_passage',
  );

  const sql = postgres(url, {
    max: 2,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 120_000 },
  });

  // Gold targets that are actually in the probe — the only ones either arm can find.
  const goldIds = [...new Set(semantic.map((r) => r.goldAuthorityId))];
  const present = new Set<string>();
  for (let i = 0; i < goldIds.length; i += 500) {
    const r = await sql.unsafe(
      `SELECT judgment_id FROM ${PROBE} WHERE judgment_id = ANY($1::uuid[])`,
      [goldIds.slice(i, i + 500)],
    );
    for (const x of r) present.add(x['judgment_id'] as string);
  }
  const targets = [...present];
  const queries = semantic.filter((r) => present.has(r.goldAuthorityId));

  // Deterministic distractors: id order, excluding the targets.
  const distractors = (
    await sql.unsafe(
      `SELECT judgment_id FROM ${PROBE} WHERE judgment_id <> ALL($1::uuid[]) ORDER BY judgment_id LIMIT ${DISTRACTORS}`,
      [targets],
    )
  ).map((r) => r['judgment_id'] as string);
  const subset = [...targets, ...distractors];
  process.stdout.write(
    `subset ${subset.length} documents (${targets.length} gold targets + ${distractors.length} distractors), ${queries.length} queries\n`,
  );

  // ARM DOC — the stored vectors, read back, restricted to the subset.
  const docVecs = new Map<string, number[]>();
  for (let i = 0; i < subset.length; i += 500) {
    const rows = await sql.unsafe(
      `SELECT judgment_id, embedding::text AS v FROM ${PROBE} WHERE judgment_id = ANY($1::uuid[])`,
      [subset.slice(i, i + 500)],
    );
    for (const r of rows)
      docVecs.set(r['judgment_id'] as string, JSON.parse(r['v'] as string) as number[]);
  }
  process.stdout.write(`arm DOC: ${docVecs.size} stored vectors read\n`);

  // ARM PASSAGE — the same documents' same head text, cut and embedded.
  const embedder = (await getHarnessEmbedder()).embedder;
  const passageOwner: string[] = [];
  const passageVecs: number[][] = [];
  let embedded = 0;
  let charsEmbedded = 0;
  const t0 = Date.now();
  for (let i = 0; i < subset.length; i += 100) {
    const ids = subset.slice(i, i + 100);
    const rows = await sql<{ id: string; head: string | null }[]>`
      SELECT id, left(full_text, ${HEAD_CHARS}) AS head FROM judgments WHERE id = ANY(${ids}::uuid[])`;
    const texts: string[] = [];
    const owners: string[] = [];
    for (const r of rows) {
      if (r.head === null || r.head.trim().length === 0) continue;
      for (const p of passages(r.head)) {
        texts.push(p);
        owners.push(r.id);
      }
    }
    for (let j = 0; j < texts.length; j += 32) {
      const chunk = texts.slice(j, j + 32);
      const vecs = await embedder.embed(chunk);
      for (const [k, e] of vecs.entries()) {
        passageVecs.push(e.vector as unknown as number[]);
        passageOwner.push(owners[j + k]!);
        charsEmbedded += chunk[k]!.length;
      }
      embedded += chunk.length;
    }
    if ((i / 100) % 5 === 0)
      process.stdout.write(
        `  passages embedded ${embedded} (docs ${i + ids.length}/${subset.length})\n`,
      );
  }
  const gpuSeconds = (Date.now() - t0) / 1000;
  process.stdout.write(
    `arm PASSAGE: ${embedded} passages, ${(charsEmbedded / 1e6).toFixed(1)}M chars, ${gpuSeconds.toFixed(0)}s\n`,
  );

  // Score both arms with the same query vectors.
  const rows: {
    queryId: string;
    launchClass: string;
    docRank: number | null;
    passageRank: number | null;
  }[] = [];
  for (const [n, g] of queries.entries()) {
    const [e] = await embedder.embed([g.query]);
    if (e === undefined) continue;
    const q = e.vector as unknown as number[];

    const docScores: [string, number][] = [];
    for (const [id, v] of docVecs) docScores.push([id, cos(q, v)]);
    docScores.sort((a, b) => b[1] - a[1]);
    const dAt = docScores.findIndex(([id]) => id === g.goldAuthorityId);

    const best = new Map<string, number>();
    for (let i = 0; i < passageVecs.length; i += 1) {
      const s = cos(q, passageVecs[i]!);
      const owner = passageOwner[i]!;
      const cur = best.get(owner);
      if (cur === undefined || s > cur) best.set(owner, s);
    }
    const pScores = [...best.entries()].sort((a, b) => b[1] - a[1]);
    const pAt = pScores.findIndex(([id]) => id === g.goldAuthorityId);

    rows.push({
      queryId: g.queryId,
      launchClass: g.launchClass,
      docRank: dAt === -1 ? null : dAt + 1,
      passageRank: pAt === -1 ? null : pAt + 1,
    });
    if ((n + 1) % 50 === 0) process.stdout.write(`  scored ${n + 1}/${queries.length}\n`);
  }

  const pct = (f: (r: (typeof rows)[number]) => boolean): number =>
    rows.length === 0 ? 0 : Number(((100 * rows.filter(f).length) / rows.length).toFixed(2));
  const summary = {
    kind: 'new1_passage_vs_document',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    design:
      'PAIRED over the SAME document subset. Absolute numbers do NOT transfer to 257k or 8.85M — a ' +
      `${subset.length}-document corpus is far easier than either. The COMPARISON is the result.`,
    subsetDocuments: subset.length,
    goldTargets: targets.length,
    queries: rows.length,
    passageRecipe: { HEAD_CHARS, PASSAGE_CHARS, PASSAGE_STRIDE },
    storageMultiplier: Number((passageVecs.length / Math.max(1, docVecs.size)).toFixed(2)),
    gpu: {
      passagesEmbedded: embedded,
      millionChars: Number((charsEmbedded / 1e6).toFixed(2)),
      seconds: Math.round(gpuSeconds),
    },
    ARM_DOC: {
      successAt1: pct((r) => r.docRank === 1),
      successAt5: pct((r) => r.docRank !== null && r.docRank <= 5),
      successAt20: pct((r) => r.docRank !== null && r.docRank <= TOP_K),
    },
    ARM_PASSAGE: {
      successAt1: pct((r) => r.passageRank === 1),
      successAt5: pct((r) => r.passageRank !== null && r.passageRank <= 5),
      successAt20: pct((r) => r.passageRank !== null && r.passageRank <= TOP_K),
    },
    movedUp: rows.filter((r) => (r.passageRank ?? 1e9) < (r.docRank ?? 1e9)).length,
    movedDown: rows.filter((r) => (r.passageRank ?? 1e9) > (r.docRank ?? 1e9)).length,
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `\n${JSON.stringify({ ARM_DOC: summary.ARM_DOC, ARM_PASSAGE: summary.ARM_PASSAGE, storageMultiplier: summary.storageMultiplier, movedUp: summary.movedUp, movedDown: summary.movedDown }, null, 2)}\n`,
  );
  await sql.end();
  process.exit(0);
}

await main();
