/**
 * `pnpm --filter @lawmind/harness long:passage` — the long-input research track
 * (NEW1 addendum A). What is the MAXIMUM SAFE INPUT SIZE the current stack
 * supports, and what should a long fact pattern do?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS RESEARCH AND NOT A LIMIT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `searchRequest` caps `query` at 500 characters. That cap exists because the
 * lexical arm cannot safely execute an arbitrarily long query — `sparseAny`'s own
 * comment records a 900-character passage matching one judgment in 38,341, and a
 * 40-lexeme OR taking 781 seconds. It is a SAFETY BOUND on today's retrieval
 * path, and the binding correction is explicit that it must not become the
 * product's vision: an advocate with a paragraph of facts is exactly the user
 * this product is for.
 *
 * So the question is not "raise the cap" but "what does the stack actually do as
 * input grows, and which bounded design survives it".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. **The embedder's own behaviour first.** Before any retrieval arm: is a
 *    5,000-character input actually READ, or silently truncated? Answered by
 *    embedding a long text and its own prefix and comparing the vectors. A
 *    cosine of 1.0 between a 5,000-char input and its first 1,000 characters
 *    means the other 4,000 were discarded, and every downstream number about
 *    long input would be measuring a 1,000-character query wearing a costume.
 *    This is the single fact that decides MAXIMUM SAFE INPUT SIZE, and it is
 *    cheap.
 *
 * 2. **Dilution.** A fixed, known-good 500-character query, then the SAME query
 *    with irrelevant text from an unrelated judgment appended at each size. If
 *    the target's rank collapses as noise is added, long fact patterns need
 *    extraction rather than a bigger embedding; if it holds, they do not.
 *
 * 3. **Arms**, at each size, all on the same inputs:
 *      DIRECT      embed the whole input, dense search
 *      CONDENSED   deterministic extractive condensation — keep the sentences
 *                  carrying the rarest lexemes, by MEASURED document frequency,
 *                  up to 500 characters — then embed that
 *      LEXICAL     the bounded rarest-3 AND from P4, which is the only lexical
 *                  shape measured safe at any length
 *      CONTROL     the first 500 characters, which is what the product does now
 *
 * **The whole passage never goes to corpus-wide `sparseAny`.** That is the one
 * thing the correction forbids outright and it is not run here even as an arm.
 */
import { writeFileSync } from 'node:fs';

import { toVectorLiteral } from '@lawmind/embed';
// GPU sidecar, not the in-process CPU embedder. See harness-embedder.ts: the CPU
// default is right for production and was silently starving the Tier-A walk here.
import { getHarnessEmbedder } from './harness-embedder.ts';
import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const PROBE = process.env['PROBE_TABLE'] ?? 'new1_probe_half_250k';
const EF_SEARCH = 200;
const TOP_K = 20;
const SIZES = [500, 1000, 2500, 5000];
const SAMPLE = Number(process.env['LONG_SAMPLE'] ?? 25);
const OUT = new URL('../../../docs/ai/new1-tier-a/long-passage.json', import.meta.url);

const cos = (a: number[], b: number[]): number => {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d += (a[i] as number) * (b[i] as number);
  return d;
};

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = buildLaunchGold();
  const sql = postgres(url, { max: 2, ssl: sslFor(url), onnotice: () => {}, connection: { statement_timeout: 60_000 } });
  const embedder = (await getHarnessEmbedder()).embedder;

  // ── 1. Does the embedder read a long input at all? ────────────────────────
  const [longDoc] = await sql<{ t: string }[]>`
    SELECT left(full_text, 20000) AS t FROM judgments
     WHERE length(full_text) > 20000 ORDER BY id LIMIT 1`;
  const base = longDoc!.t;
  const truncationProbe: { chars: number; cosineToPrefix1000: number; cosineToFullText: number }[] = [];
  const [p1000] = await embedder.embed([base.slice(0, 1000)]);
  const [pFull] = await embedder.embed([base.slice(0, 20000)]);
  for (const n of [500, 1000, 2500, 5000, 10000, 20000]) {
    const [e] = await embedder.embed([base.slice(0, n)]);
    truncationProbe.push({
      chars: n,
      cosineToPrefix1000: Number(cos(e!.vector as unknown as number[], p1000!.vector as unknown as number[]).toFixed(4)),
      cosineToFullText: Number(cos(e!.vector as unknown as number[], pFull!.vector as unknown as number[]).toFixed(4)),
    });
  }
  process.stdout.write(`truncation probe: ${JSON.stringify(truncationProbe)}\n`);

  // ── the sample: gold whose target is in the probe, and short enough to grow ─
  const semantic = gold.rows.filter((r) => r.launchClass === 'nl_doctrine' || r.launchClass === 'fact_passage');
  const ids = [...new Set(semantic.map((r) => r.goldAuthorityId))];
  const present = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const r = await sql.unsafe(`SELECT judgment_id FROM ${PROBE} WHERE judgment_id = ANY($1::uuid[])`, [ids.slice(i, i + 500)]);
    for (const x of r) present.add(x['judgment_id'] as string);
  }
  const sample = semantic.filter((r) => present.has(r.goldAuthorityId)).slice(0, SAMPLE);

  // Noise comes from ONE unrelated judgment, the same for every row, so the
  // dilution measured is the dilution of length and not of a particular text.
  const [noiseRow] = await sql<{ t: string }[]>`
    SELECT left(full_text, 20000) AS t FROM judgments
     WHERE length(full_text) > 20000 ORDER BY id DESC LIMIT 1`;
  const noise = noiseRow!.t;

  async function annRank(text: string, goldId: string): Promise<{ rank: number | null; ms: number }> {
    const t = Date.now();
    const [e] = await embedder.embed([text]);
    if (e === undefined) return { rank: null, ms: Date.now() - t };
    const vec = toVectorLiteral(e.vector);
    const hits = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL hnsw.ef_search = ${EF_SEARCH}`);
      return tx.unsafe(`SELECT judgment_id FROM ${PROBE} ORDER BY embedding <=> $1::halfvec LIMIT ${TOP_K}`, [vec]);
    });
    const at = hits.findIndex((h) => h['judgment_id'] === goldId);
    return { rank: at === -1 ? null : at + 1, ms: Date.now() - t };
  }

  /** Deterministic extractive condensation: keep the rarest-lexeme sentences, cap 500 chars. */
  async function condense(text: string): Promise<string> {
    const sentences = text.split(/(?<=[.;])\s+/).filter((s) => s.trim().length > 20);
    if (sentences.length <= 1) return text.slice(0, 500);
    const scored: { s: string; df: number }[] = [];
    for (const s of sentences) {
      const [r] = await sql<{ df: string | null }[]>`
        SELECT min(coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0))::text AS df
          FROM unnest(to_tsvector('english', ${s})) AS l
          LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme`;
      scored.push({ s, df: r?.df === null || r?.df === undefined ? 1 : Number(r.df) });
    }
    scored.sort((a, b) => a.df - b.df);
    let out = '';
    for (const x of scored) {
      if (out.length + x.s.length > 500) break;
      out += (out.length > 0 ? ' ' : '') + x.s;
    }
    return out.length > 0 ? out : text.slice(0, 500);
  }

  const rows: {
    queryId: string;
    size: number;
    directRank: number | null;
    directMs: number;
    condensedRank: number | null;
    controlRank: number | null;
  }[] = [];

  for (const [i, g] of sample.entries()) {
    for (const size of SIZES) {
      // The query, then irrelevant text to the target size. The signal is
      // constant and only the noise grows, which is what dilution means.
      const input = (g.query + ' ' + noise).slice(0, size);
      const direct = await annRank(input, g.goldAuthorityId);
      const cond = await annRank(await condense(input), g.goldAuthorityId);
      const control = await annRank(input.slice(0, 500), g.goldAuthorityId);
      rows.push({
        queryId: g.queryId,
        size,
        directRank: direct.rank,
        directMs: direct.ms,
        condensedRank: cond.rank,
        controlRank: control.rank,
      });
    }
    process.stdout.write(`  ${i + 1}/${sample.length}\n`);
  }

  const bySize = SIZES.map((size) => {
    const rs = rows.filter((r) => r.size === size);
    const pct = (f: (r: (typeof rs)[number]) => boolean): number =>
      rs.length === 0 ? 0 : Number(((100 * rs.filter(f).length) / rs.length).toFixed(2));
    return {
      size,
      n: rs.length,
      DIRECT: { at5: pct((r) => r.directRank !== null && r.directRank <= 5), at20: pct((r) => r.directRank !== null) },
      CONDENSED: { at5: pct((r) => r.condensedRank !== null && r.condensedRank <= 5), at20: pct((r) => r.condensedRank !== null) },
      CONTROL_500: { at5: pct((r) => r.controlRank !== null && r.controlRank <= 5), at20: pct((r) => r.controlRank !== null) },
      embedMsP50: [...rs.map((r) => r.directMs)].sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? null,
    };
  });

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        kind: 'new1_long_passage',
        measuredAt: new Date().toISOString(),
        frozenHash: gold.frozenHash,
        design:
          'the query is held constant and irrelevant text is appended to reach each size, so what is measured is dilution by length. ' +
          'Own-text-span gold, so absolute numbers are an upper bound; the comparison across sizes and arms is the result.',
        truncationProbe,
        sizes: SIZES,
        sample: sample.length,
        bySize,
        rows,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`\n${JSON.stringify(bySize, null, 2)}\n`);
  await sql.end();
  process.exit(0);
}

await main();
