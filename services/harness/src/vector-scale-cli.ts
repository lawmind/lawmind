/**
 * `pnpm vector:scale` — how many VECTORS an embedding pilot actually costs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/CX1_EMBEDDING_ELIGIBILITY_CENSUS.md` is the population and storage
 * model, and its scenario table is the number the scale decision would be taken
 * from. Every row of it uses **`Vectors/doc = 1`**.
 *
 * The production index does not work that way and never has. Measured 18 Aug
 * 2026 against all 620,300 embedded chunks:
 *
 *     documents with vectors     40,161
 *     vectors                   620,300
 *     vectors per document      mean 15.45 · p50 11 · p90 29 · p99 90 · max 1276
 *
 * A one-vector-per-document corpus is a different retrieval system, not a
 * cheaper version of this one — and `NEW1_POST_0055_BASELINE.md` §2 is the
 * reason to care: gold's CHUNK rank is what decides whether an authority is
 * found, with a median exact rank of 540. Averaging a 21,053-character judgment
 * into one 1024-dimensional vector discards exactly the signal that measurement
 * says is load-bearing. CX1's table therefore prices a design nobody has
 * proposed, and it prices it low.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT JUST MULTIPLY BY 15.45
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Because that number is Supreme Court. The split, measured the same day:
 *
 *     Supreme Court of India   38,341 docs   616,197 vectors   16.07 / doc
 *     the embedded High Court   1,820 docs     4,103 vectors    2.25 / doc
 *
 * A 7x spread, and CX1's tiers are High-Court-dominated. Multiplying their
 * populations by the Supreme Court figure would replace an under-estimate with
 * an over-estimate and would be no better founded.
 *
 * So this derives the multiplier from the CHUNKER instead, which is the thing
 * that actually determines it. Measured over the same 620,300 chunks:
 *
 *     char_length   mean 2,195 · p50 2,291 · p90 2,385 · MAX 2,400
 *
 * A ~2,400-character window with a ~2,195-character effective mean. Vectors per
 * document is then `max(1, round(meanChars / 2195))` applied to CX1's own
 * per-class mean character counts — which is checkable: it predicts
 * 35,270 characters for a mean Supreme Court judgment from the observed 16.07
 * chunks, which is the right order for that court.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS INHERITS AND CANNOT FIX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The class populations and mean character counts are CX1's, from a
 * **200-document, 20-cell purposive sample chosen for spread, not as a random
 * corpus estimator**. Their own report says to use the direction and order of
 * magnitude rather than the last digit, and every number below inherits that
 * exactly. What this changes is the multiplier, which was not a sampling
 * question at all — it was 1 where the index says it is not 1.
 *
 * Bytes per vector are CX1's measured TOAST-inclusive table-plus-HNSW figures at
 * ~600k scale, and they are linear extrapolations, not build forecasts.
 */
import { writeFileSync } from 'node:fs';

/** Measured over all 620,300 embedded chunks, 18 Aug 2026. */
const CHUNK_MEAN_CHARS = 2195;

/** CX1 measured, `CX1_VECTOR_CAPACITY_BENCHMARK`, ~600k scale. */
const BYTES_PER_VECTOR = { fp32: 13778.58, halfvec: 5571.26 };
const GIB = 1024 ** 3;

/** CX1's class table, `CX1_EMBEDDING_ELIGIBILITY_CENSUS.md`. Populations and mean chars are theirs. */
const CLASSES = [
  { name: 'decided', docs: 1306391, meanChars: 21053, tier: 'A' },
  { name: 'decided_brief', docs: 399175, meanChars: 981, tier: 'A' },
  { name: 'bail_order', docs: 907216, meanChars: 6047, tier: 'D' },
  { name: 'procedural_disposal', docs: 1233813, meanChars: 1421, tier: 'D' },
  { name: 'unclassified', docs: 3229688, meanChars: 8204, tier: 'E' },
  { name: 'reference_stub', docs: 181443, meanChars: 436, tier: 'E' },
] as const;

/** A document always costs at least one vector, however short it is. */
const vectorsPerDoc = (meanChars: number) => Math.max(1, Math.round(meanChars / CHUNK_MEAN_CHARS));

const rows = CLASSES.map((c) => {
  const v = vectorsPerDoc(c.meanChars);
  return { ...c, vectorsPerDoc: v, vectors: c.docs * v };
});

console.log(`chunker window: mean ${CHUNK_MEAN_CHARS} chars (measured, max 2,400)\n`);
console.log('class                 tier      docs   chars/doc  vec/doc        vectors');
console.log('───────────────────────────────────────────────────────────────────────────');
for (const r of rows) {
  console.log(
    `${r.name.padEnd(20)} ${r.tier}  ${r.docs.toLocaleString().padStart(9)}  ` +
      `${r.meanChars.toLocaleString().padStart(9)}  ${String(r.vectorsPerDoc).padStart(7)}  ${r.vectors.toLocaleString().padStart(13)}`,
  );
}

const tiers = ['A', 'D', 'E'] as const;
const byTier = tiers.map((t) => {
  const rs = rows.filter((r) => r.tier === t);
  return {
    tier: t,
    docs: rs.reduce((a, r) => a + r.docs, 0),
    vectors: rs.reduce((a, r) => a + r.vectors, 0),
  };
});

console.log('\ntier      docs   CX1 vectors   MEASURED vectors    fp32 GiB   halfvec GiB   ratio');
console.log('──────────────────────────────────────────────────────────────────────────────────');
for (const t of byTier) {
  console.log(
    `${t.tier}  ${t.docs.toLocaleString().padStart(10)}  ${t.docs.toLocaleString().padStart(12)}  ` +
      `${t.vectors.toLocaleString().padStart(16)}  ${((t.vectors * BYTES_PER_VECTOR.fp32) / GIB).toFixed(0).padStart(10)}  ` +
      `${((t.vectors * BYTES_PER_VECTOR.halfvec) / GIB).toFixed(0).padStart(12)}   ${(t.vectors / t.docs).toFixed(1)}x`,
  );
}

const cumulative = [
  { name: 'TIER_A only', tiers: ['A'] },
  { name: 'TIER_A + TIER_D', tiers: ['A', 'D'] },
  { name: 'everything classified', tiers: ['A', 'D', 'E'] },
] as const;

console.log('\nscenario                 vectors    fp32 GiB   halfvec GiB');
console.log('────────────────────────────────────────────────────────────');
const scenarios = cumulative.map((c) => {
  const v = byTier.filter((t) => (c.tiers as readonly string[]).includes(t.tier)).reduce((a, t) => a + t.vectors, 0);
  console.log(
    `${c.name.padEnd(22)} ${v.toLocaleString().padStart(11)}  ${((v * BYTES_PER_VECTOR.fp32) / GIB).toFixed(0).padStart(10)}  ${((v * BYTES_PER_VECTOR.halfvec) / GIB).toFixed(0).padStart(12)}`,
  );
  return {
    scenario: c.name,
    vectors: v,
    fp32GiB: Number(((v * BYTES_PER_VECTOR.fp32) / GIB).toFixed(1)),
    halfvecGiB: Number(((v * BYTES_PER_VECTOR.halfvec) / GIB).toFixed(1)),
  };
});

console.log(
  '\nAgainst the 620,300 vectors that exist today, TIER_A alone is ' +
    `${(byTier[0]!.vectors / 620300).toFixed(0)}x the current index.`,
);
console.log(
  'INHERITED LIMIT: class populations and mean chars are CX1\'s 200-document\n' +
    'purposive sample. Order of magnitude, not the last digit. What is measured\n' +
    'here is the MULTIPLIER, which was 1 and is not 1.',
);

writeFileSync(
  'docs/ai/new1-post-0055/vector-scale.json',
  JSON.stringify(
    {
      kind: 'new1_vector_scale_restated',
      createdAt: new Date().toISOString(),
      chunkerMeanChars: CHUNK_MEAN_CHARS,
      bytesPerVector: BYTES_PER_VECTOR,
      measuredToday: {
        documentsWithVectors: 40161,
        vectors: 620300,
        vectorsPerDocument: { mean: 15.45, p50: 11, p90: 29, p99: 90, max: 1276 },
        byCourt: { supremeCourt: { docs: 38341, vectors: 616197 }, highCourt: { docs: 1820, vectors: 4103 } },
      },
      classes: rows,
      tiers: byTier,
      scenarios,
      inheritedLimit:
        "class populations and mean chars are CX1's 200-document, 20-cell purposive sample — order of magnitude only",
    },
    null,
    2,
  ),
);
console.log('\nwrote docs/ai/new1-post-0055/vector-scale.json');
