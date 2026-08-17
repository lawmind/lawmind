/**
 * `pnpm rrf:displacement` — why does hybrid lose to dense?
 *
 * **The question.** CX1's controlled 283-query checkpoint measured
 * dense `success@5` **21.6%**, hybrid **18.4%**, sparse **10.2%**. Hybrid is
 * RRF over sparse and dense, so fusion is DESTROYING quality it was handed.
 * That has to be explained before anyone tunes HNSW, because if fusion is the
 * defect then every vector-side experiment is measuring the wrong subsystem.
 *
 * **The sharp test is conditional, not aggregate.** An overall "hybrid is
 * worse" number is compatible with several of the founder's candidate
 * mechanisms at once. Conditioning on *whether the sparse arm found gold at
 * all* separates them:
 *
 *   - if hybrid degrades **specifically** where sparse missed gold, the
 *     mechanism is RRF rewarding agreement between arms while one arm's
 *     agreement carries no information;
 *   - if hybrid degrades evenly regardless, displacement is NOT the mechanism
 *     and the cause is elsewhere — rank-weight imbalance, candidate truncation,
 *     or canonical/duplicate effects.
 *
 * **Why RRF does this.** A document returned by BOTH arms scores
 * `1/(k+r_dense) + 1/(k+r_sparse)`; a document returned by ONE arm scores a
 * single term. So any doc both arms happen to return is worth roughly twice a
 * dense-only doc at the same rank. When sparse retrieval is good, gold appears
 * in both arms and is safe. When sparse is bad — and at `recall@20` **17.0%**
 * it usually is — gold is dense-only and is systematically outscored by
 * whatever the two arms coincidentally agree on. Sparse here is
 * Postgres `ts_rank`, which has **no IDF and is not BM25**, so its agreement is
 * especially uninformative.
 *
 * **Limit, stated rather than papered over.** `arms-checkpoint.jsonl` carries
 * per-arm gold RANKS, not the returned document ids. So this measures the
 * displacement's MAGNITUDE and its conditional signature. It does not identify
 * WHICH documents did the displacing; that needs a checkpoint carrying returned
 * ids, and is the natural follow-up.
 *
 * Offline. Reads a checkpoint file. Touches no database, no embeddings, and no
 * gold labels.
 */
import { readFileSync } from 'node:fs';

type Row = {
  readonly mode: 'sparse' | 'dense' | 'hybrid';
  readonly row: {
    readonly id: string;
    readonly group: string;
    readonly goldRanks?: readonly number[];
  };
};

type PerQuery = {
  id: string;
  group: string;
  sparse?: number | null;
  dense?: number | null;
  hybrid?: number | null;
};

const CHECKPOINT = process.env['ARMS_CHECKPOINT'] ?? 'arms-checkpoint.jsonl';

function load(): PerQuery[] {
  const byQuery = new Map<string, PerQuery>();
  for (const line of readFileSync(CHECKPOINT, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const r = JSON.parse(line) as Row;
    const e = byQuery.get(r.row.id) ?? { id: r.row.id, group: r.row.group };
    const ranks = r.row.goldRanks ?? [];
    // Best gold rank. `null` means gold never surfaced in this arm's window.
    e[r.mode] = ranks.length > 0 ? Math.min(...ranks) : null;
    byQuery.set(r.row.id, e);
  }
  return [...byQuery.values()];
}

function main(): number {
  const qs = load();
  console.log(`checkpoint ${CHECKPOINT} · ${qs.length} queries`);
  console.log('');

  const cmp = { better: 0, same: 0, worse: 0, lost: 0, gained: 0, bothMiss: 0 };
  for (const q of qs) {
    const d = q.dense ?? null;
    const h = q.hybrid ?? null;
    if (d === null && h === null) cmp.bothMiss++;
    else if (d !== null && h === null) cmp.lost++;
    else if (d === null && h !== null) cmp.gained++;
    else if (h! < d!) cmp.better++;
    else if (h === d) cmp.same++;
    else cmp.worse++;
  }
  console.log('hybrid vs dense, gold rank');
  console.log('─'.repeat(72));
  console.log(`  hybrid BETTER                        ${String(cmp.better).padStart(4)}`);
  console.log(`  identical                            ${String(cmp.same).padStart(4)}`);
  console.log(`  hybrid WORSE                         ${String(cmp.worse).padStart(4)}`);
  console.log(`  dense found it, hybrid LOST it       ${String(cmp.lost).padStart(4)}`);
  console.log(`  hybrid found it, dense missed        ${String(cmp.gained).padStart(4)}`);
  console.log(`  both missed                          ${String(cmp.bothMiss).padStart(4)}`);

  /**
   * THE DISCRIMINATING STRATIFICATION. Restricted to queries dense could
   * actually answer — asking whether fusion "damaged" a query dense never
   * solved is meaningless.
   */
  const strata = {
    sparseFound: { n: 0, better: 0, same: 0, worse: 0, lost: 0 },
    sparseMissed: { n: 0, better: 0, same: 0, worse: 0, lost: 0 },
  };
  for (const q of qs) {
    if ((q.dense ?? null) === null) continue;
    const st = (q.sparse ?? null) === null ? strata.sparseMissed : strata.sparseFound;
    st.n++;
    if ((q.hybrid ?? null) === null) st.lost++;
    else if (q.hybrid! < q.dense!) st.better++;
    else if (q.hybrid === q.dense) st.same++;
    else st.worse++;
  }
  console.log('');
  console.log('CONDITIONED on whether sparse found gold (queries where dense DID find it)');
  console.log('─'.repeat(72));
  let damagedRates: number[] = [];
  for (const [name, st] of Object.entries(strata)) {
    const damaged = st.worse + st.lost;
    const rate = st.n === 0 ? Number.NaN : (100 * damaged) / st.n;
    damagedRates.push(rate);
    console.log(
      `  ${name.padEnd(13)} n=${String(st.n).padStart(4)}  better ${String(st.better).padStart(3)} · ` +
        `same ${String(st.same).padStart(3)} · worse ${String(st.worse).padStart(3)} · ` +
        `lost ${String(st.lost).padStart(3)}   DAMAGED ${Number.isNaN(rate) ? 'n/a' : `${rate.toFixed(1)}%`}`,
    );
  }
  const [foundRate, missedRate] = damagedRates;
  console.log('');
  console.log(
    Number.isNaN(foundRate!) || Number.isNaN(missedRate!)
      ? '  (a stratum is empty — no verdict)'
      : missedRate! > foundRate! * 2
        ? `  VERDICT: RRF DISPLACEMENT. Damage is ${(missedRate! / Math.max(foundRate!, 0.01)).toFixed(1)}x higher when\n` +
          '  sparse misses gold. Fusion, not the vector index, is the defect to fix first.'
        : '  VERDICT: NOT displacement — damage does not concentrate where sparse failed.\n' +
          '  Look at rank-weight imbalance, candidate truncation, or canonical effects.',
  );

  const deltas = qs
    .filter((q) => q.dense != null && q.hybrid != null && q.hybrid > q.dense)
    .map((q) => q.hybrid! - q.dense!)
    .sort((a, b) => a - b);
  if (deltas.length > 0) {
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log('');
    console.log(
      `rank movement where hybrid hurt but kept gold: n=${deltas.length} · ` +
        `median +${deltas[Math.floor(deltas.length / 2)]} · mean +${mean.toFixed(1)} · max +${deltas.at(-1)}`,
    );
  }

  console.log('');
  console.log('by group');
  console.log('─'.repeat(72));
  const groups = new Map<string, { n: number; damaged: number }>();
  for (const q of qs) {
    if ((q.dense ?? null) === null) continue;
    const g = groups.get(q.group) ?? { n: 0, damaged: 0 };
    g.n++;
    if ((q.hybrid ?? null) === null || q.hybrid! > q.dense!) g.damaged++;
    groups.set(q.group, g);
  }
  for (const [g, v] of [...groups].sort()) {
    console.log(
      `  ${g.padEnd(12)} n=${String(v.n).padStart(4)}  damaged ${String(v.damaged).padStart(3)} (${((100 * v.damaged) / v.n).toFixed(1)}%)`,
    );
  }

  /** `success@5` is the headline metric, so measure the damage there directly. */
  const in5 = (r: number | null | undefined) => r != null && r <= 5;
  const denseIn5 = qs.filter((q) => in5(q.dense)).length;
  const knocked = qs.filter((q) => in5(q.dense) && !in5(q.hybrid)).length;
  console.log('');
  console.log(
    `top-5: dense had gold in top-5 on ${denseIn5} queries; fusion knocked it OUT on ` +
      `${knocked} (${denseIn5 === 0 ? 'n/a' : `${((100 * knocked) / denseIn5).toFixed(1)}%`})`,
  );
  return 0;
}

process.exitCode = main();
