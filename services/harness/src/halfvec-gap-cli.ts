/**
 * `pnpm halfvec:gaps` — does CX1's halfvec fidelity result survive at real scale?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CX1 MEASURED, AND THE ONE THING IT COULD NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/CX1_HALFVEC_FIDELITY.md` (17 Aug) is sound for what it claims:
 * 5,000 copied vectors, 100,000 pairs, absolute distance error **max
 * 5.448e-5**, and exact nearest-neighbour overlap of 0.9990 at k=5 rising to
 * 1.0000 at k=20 with **zero** first-result disagreement. It says so itself:
 * `evidenceClass: MEASURED_COPIED_VECTORS_NO_HNSW`, and it explicitly leaves the
 * production decision to this lane.
 *
 * The gap is scale, and it is not a quibble. **Neighbour-set overlap is a
 * function of neighbourhood density.** Rounding reorders two neighbours only
 * when the distance BETWEEN them is smaller than the rounding error. In a pool
 * of 5,000 vectors the k-th and (k+1)-th neighbour are far apart, so an error of
 * 5.4e-5 cannot reorder anything and the overlap is 1.0 almost by construction.
 * Production holds **620,300** — 124x denser — and the gaps shrink with density.
 *
 * So CX1's overlap is an **upper bound** on the overlap at production scale, and
 * quoting it as the production number would be the kind of confident wrong
 * answer this programme exists to prevent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MEASURES INSTEAD, AND WHY IT IS THE RIGHT TEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The question "can half precision reorder the results an advocate reads" is
 * decided by ONE distribution: the gap between adjacent neighbour distances in
 * the top-K, measured on the real index at real scale.
 *
 *   gap_i = distance(result i+1) - distance(result i)
 *
 * A pair can swap under halfvec only if `gap_i` is within about twice the
 * per-distance rounding error — each of the two distances can move by up to that
 * error, in opposite directions. CX1 measured the error; this measures the gaps
 * they have to beat. The two together answer the question that neither answers
 * alone, and this half costs one ANN query per probe rather than a rebuild.
 *
 * This is deliberately NOT a halfvec index build. It needs no copy, no second
 * index, and no disk: if the gaps are large the reordering risk is arithmetic,
 * not empirical, and a build would only confirm it expensively. If the gaps are
 * small, THAT is when a real halfvec HNSW comparison is worth its cost — and
 * this tells us which world we are in first.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT SETTLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing about **ANN approximation** — that is C3, a different question, and
 * halfvec changes the graph that HNSW builds as well as the distances it
 * compares. This bounds representation loss at scale. It does not approve
 * production halfvec, and a small measured risk here is a reason to run C3, not
 * a substitute for it.
 */
import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { openDb } from '@lawmind/ingest/db-host';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * The largest absolute distance error CX1 measured over 100,000 pairs
 * (`c1DistanceDistortion.absoluteError.max`). Read from their artefact rather
 * than retyped, so a rerun of theirs cannot silently leave this stale.
 */
const CX1_FIDELITY = JSON.parse(
  readFileSync('docs/ai/cx1-vector-results/halfvec-fidelity.json', 'utf8'),
) as { c1DistanceDistortion: { absoluteError: { max: number; p99: number } } };
const ERR_MAX = CX1_FIDELITY.c1DistanceDistortion.absoluteError.max;
const ERR_P99 = CX1_FIDELITY.c1DistanceDistortion.absoluteError.p99;

/** Two distances can each move by the error, in opposite directions. */
const SWAP_THRESHOLD_MAX = 2 * ERR_MAX;
const SWAP_THRESHOLD_P99 = 2 * ERR_P99;

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}

const K = Number(process.env['HALFVEC_GAP_K'] ?? 50);
const PROBES = Number(process.env['HALFVEC_GAP_PROBES'] ?? 20);
const EF_SEARCH = Number(process.env['HNSW_EF_SEARCH'] ?? 200);

const doc = JSON.parse(
  readFileSync('services/harness/src/fixtures/queries.eval.json', 'utf8'),
) as { queries: { id: string; query: string }[] };

const sql = await openDb(url, 3);

type Row = { id: string; gaps: number[]; distances: number[] };

async function main(): Promise<void> {
  try {
    const chunks = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_chunks WHERE embedding IS NOT NULL`;
    console.log(`index population: ${chunks[0]!.n.toLocaleString()} embedded chunks`);
    console.log(
      `CX1 absolute distance error: p99 ${ERR_P99.toExponential(3)} · max ${ERR_MAX.toExponential(3)}`,
    );
    console.log(
      `a pair can swap under halfvec when its gap is below ~${SWAP_THRESHOLD_MAX.toExponential(3)} (2 x max)\n`,
    );

    const embedder = await getEmbedder();
    const step = Math.max(1, Math.floor(doc.queries.length / PROBES));
    const probes = doc.queries.filter((_, i) => i % step === 0).slice(0, PROBES);

    const rows: Row[] = [];
    for (const q of probes) {
      const [e] = await embedder.embed([q.query]);
      if (!e) continue;
      const vec = toVectorLiteral(e.vector);
      const res = await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL hnsw.ef_search = ${EF_SEARCH}`);
        return tx<{ d: number }[]>`
          SELECT (embedding <=> ${vec}::vector)::float8 AS d
            FROM judgment_chunks
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> ${vec}::vector
           LIMIT ${K}`;
      });
      const distances = res.map((r) => r.d);
      const gaps: number[] = [];
      for (let i = 1; i < distances.length; i++) gaps.push(distances[i]! - distances[i - 1]!);
      rows.push({ id: q.id, gaps, distances });
      process.stdout.write('.');
    }
    console.log('\n');

    const all = rows.flatMap((r) => r.gaps).sort((a, b) => a - b);
    if (all.length === 0) throw new Error('no gaps measured');
    const q = (p: number) => all[Math.min(all.length - 1, Math.floor(all.length * p))]!;
    const atRisk = (t: number) => all.filter((g) => g < t).length;

    console.log(`adjacent-neighbour gaps in the top ${K}, ${rows.length} probes, ${all.length} gaps`);
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log(
      `  min ${all[0]!.toExponential(3)}  p01 ${q(0.01).toExponential(3)}  ` +
        `p05 ${q(0.05).toExponential(3)}  p50 ${q(0.5).toExponential(3)}`,
    );
    console.log('');
    console.log(
      `  gaps below 2 x p99 error (${SWAP_THRESHOLD_P99.toExponential(3)}):  ` +
        `${atRisk(SWAP_THRESHOLD_P99)} of ${all.length}  (${((atRisk(SWAP_THRESHOLD_P99) / all.length) * 100).toFixed(3)}%)`,
    );
    console.log(
      `  gaps below 2 x max error (${SWAP_THRESHOLD_MAX.toExponential(3)}):  ` +
        `${atRisk(SWAP_THRESHOLD_MAX)} of ${all.length}  (${((atRisk(SWAP_THRESHOLD_MAX) / all.length) * 100).toFixed(3)}%)`,
    );

    /**
     * The top five is the only window an advocate reads, so its gaps are
     * reported separately. A swap at rank 47 is invisible; a swap at rank 2 is
     * the product.
     */
    const top5 = rows.flatMap((r) => r.gaps.slice(0, 4)).sort((a, b) => a - b);
    const top5AtRisk = top5.filter((g) => g < SWAP_THRESHOLD_MAX).length;
    console.log('');
    console.log(
      `  WITHIN THE TOP 5 — the only window an advocate reads: ${top5AtRisk} of ${top5.length} ` +
        `gaps at risk (${((top5AtRisk / top5.length) * 100).toFixed(3)}%), min gap ${top5[0]!.toExponential(3)}`,
    );

    const out = {
      kind: 'new1_halfvec_gap_at_scale',
      createdAt: new Date().toISOString(),
      indexPopulation: chunks[0]!.n,
      probes: rows.length,
      k: K,
      efSearch: EF_SEARCH,
      cx1AbsoluteError: { p99: ERR_P99, max: ERR_MAX },
      swapThreshold: { p99: SWAP_THRESHOLD_P99, max: SWAP_THRESHOLD_MAX },
      gaps: {
        n: all.length,
        min: all[0],
        p01: q(0.01),
        p05: q(0.05),
        p50: q(0.5),
        belowP99Threshold: atRisk(SWAP_THRESHOLD_P99),
        belowMaxThreshold: atRisk(SWAP_THRESHOLD_MAX),
      },
      top5Gaps: { n: top5.length, min: top5[0], belowMaxThreshold: top5AtRisk },
      limits: [
        'representation loss only — says nothing about ANN approximation under a halfvec-built HNSW graph (C3)',
        'gaps are measured through the fp32 HNSW index at ef_search=' + EF_SEARCH + ', not by exact scan',
        'CX1 error figures are from 5,000 copied vectors; only the GAPS here are at production scale',
      ],
      perProbe: rows.map((r) => ({ id: r.id, minGap: Math.min(...r.gaps), nearest: r.distances[0] })),
    };
    writeFileSync('docs/ai/new1-post-0055/halfvec-gap-at-scale.json', JSON.stringify(out, null, 2));
    console.log('\nwrote docs/ai/new1-post-0055/halfvec-gap-at-scale.json');
  } finally {
    await sql.end();
  }
}

await main();
