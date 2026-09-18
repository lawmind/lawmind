/**
 * `pnpm rrf:attribution` — WHICH documents displace gold when fusion loses it.
 *
 * `rrf-displacement-cli.ts` answers *how much* damage fusion does and *when*
 * (conditioned on whether sparse found gold). Its header states a limit:
 *
 *   > `arms-checkpoint.jsonl` carries per-arm gold RANKS, not the returned
 *   > document ids.
 *
 * **That is stale.** `ScoredQuery.retrieved` carries `judgmentId` for the top
 * five of every arm and has since 9 Aug 2026, when it was added to give the
 * generation metrics the evidence the gate actually scored. So the displacing
 * documents ARE on disk, in the checkpoint that already exists, and this
 * identifies them without a database, an embedder, or a rerun.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MECHANISM UNDER TEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RRF scores a document `sum over arms of 1/(k + rank)`. A document BOTH arms
 * return therefore collects two terms and is worth roughly twice a dense-only
 * document at the same rank. The hypothesis from bus 0664 is that when sparse
 * is near-arbitrary, the documents it happens to agree with dense on are
 * arbitrary too — and they outscore a gold judgment that only dense found.
 *
 * If that is the mechanism, the documents occupying hybrid's top five in place
 * of gold should be **disproportionately documents sparse also returned**. If
 * instead they are documents neither arm has in its top five, they arrived from
 * deeper in one arm's candidate list and the mechanism is rank-weight
 * imbalance, not agreement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWENTY RANKS PER ARM, WHICH IS WHAT MAKES THIS DECIDABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `retrieved` stops at five, and a five-row snapshot cannot see the mechanism:
 * with `k = 60`, a document at dense rank 8 AND sparse rank 25 scores
 * `1/68 + 1/85 = 0.0265` against a dense-only gold at rank 3 scoring
 * `1/63 = 0.0159`. A mediocre document both arms found beats a good one only
 * dense found, and neither of those ranks is inside a top five.
 *
 * `ScoredQuery.rankedIds` (added 18 Aug, ids only, ~740 bytes a row against the
 * passages that make the checkpoint 387 MB) carries every returned rank. This
 * prefers it and falls back to the five in `retrieved` for older checkpoints —
 * printing which it used, because the two answer different questions and a
 * reader must not have to guess.
 *
 * What still is NOT visible: ranks beyond 20. `annDepth` is 200, so a displacer
 * can arrive from deeper than either list records, and "in neither arm's list"
 * remains a statement about the top 20 rather than about the arm.
 *
 * Offline. Reads a checkpoint file. No database, no embeddings, no gold labels
 * beyond the ranks the checkpoint already recorded.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

type Arm = 'sparse' | 'dense' | 'hybrid';

type Line = {
  readonly pass: string;
  readonly mode: Arm;
  readonly row: {
    readonly id: string;
    readonly group: string;
    readonly goldRanks?: readonly number[];
    readonly retrieved?: readonly { readonly judgmentId: string }[];
    readonly rankedIds?: readonly string[];
  };
};

type PerQuery = {
  id: string;
  group: string;
  ranks: Partial<Record<Arm, number | null>>;
  top5: Partial<Record<Arm, string[]>>;
  /** Every returned id in rank order, when the checkpoint carries them. */
  ranked: Partial<Record<Arm, string[]>>;
};

const CHECKPOINT = process.env['ARMS_CHECKPOINT'] ?? 'arms-checkpoint.jsonl';
const PASS = (process.env['ARMS_PASS'] ?? 'CONTROLLED').toUpperCase();
const OUT = process.env['ATTRIBUTION_JSON'] ?? null;

/** Both are required: displacement is a statement about one arm relative to another. */
const ARMS_NEEDED: Arm[] = ['dense', 'hybrid'];

async function load(): Promise<PerQuery[]> {
  const byQuery = new Map<string, PerQuery>();
  const rl = createInterface({
    input: createReadStream(CHECKPOINT, 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const l = JSON.parse(line) as Line;
    if (l.pass.toUpperCase() !== PASS) continue;
    const e = byQuery.get(l.row.id) ?? {
      id: l.row.id,
      group: l.row.group,
      ranks: {},
      top5: {},
      ranked: {},
    };
    const gold = l.row.goldRanks ?? [];
    e.ranks[l.mode] = gold.length > 0 ? Math.min(...gold) : null;
    e.top5[l.mode] = (l.row.retrieved ?? []).map((r) => r.judgmentId);
    if (l.row.rankedIds) e.ranked[l.mode] = [...l.row.rankedIds];
    byQuery.set(l.row.id, e);
  }
  return [...byQuery.values()];
}

function main(qs: PerQuery[]): number {
  console.log(`checkpoint ${CHECKPOINT} · pass ${PASS} · ${qs.length} queries`);

  /**
   * ABSENT IS NOT A FAILURE. `ranks[arm]` is `null` when the arm ran and did not
   * find gold, and MISSING when the arm was never scored in this checkpoint —
   * `ARMS_MODES=dense` writes exactly that. Collapsing the two counted every
   * unmeasured hybrid row as hybrid losing, which this tool reported as 62
   * damaged queries on a dense-only checkpoint before the distinction was made.
   */
  const scored = (r: Partial<Record<Arm, number | null>>, arm: Arm) => arm in r;
  const missingArms = ARMS_NEEDED.filter((a) => !qs.some((q) => scored(q.ranks, a)));
  if (missingArms.length > 0) {
    console.log('');
    console.log(`NOT MEASURED: this checkpoint has no ${missingArms.join(' or ')} rows.`);
    console.log('Displacement is undefined without both arms; nothing below would be a zero.');
    return 0;
  }

  /**
   * The population fusion actually damaged: dense put gold in the top five and
   * hybrid ran and did not. Everything else is either fusion working or both
   * arms failing, and pooling them is what makes an aggregate uninformative.
   */
  const damaged = qs.filter((q) => {
    const d = q.ranks.dense;
    return typeof d === 'number' && d > 0 && scored(q.ranks, 'hybrid') && q.ranks.hybrid === null;
  });

  console.log('');
  console.log(`dense had gold in top-5 and hybrid lost it: ${damaged.length} queries`);

  let displacersTotal = 0;
  let inSparseTop5 = 0;
  let heldByDenseToo = 0;
  let inNeitherTop5 = 0;
  const perQuery: Record<string, unknown>[] = [];
  /** How often one document does the displacing across DIFFERENT queries. */
  const repeatOffender = new Map<string, number>();

  for (const q of damaged) {
    const hyb = q.top5.hybrid ?? [];
    const den = new Set(q.top5.dense ?? []);
    const spa = new Set(q.top5.sparse ?? []);
    if (hyb.length === 0) continue;

    const displacers = hyb.filter((id) => !den.has(id));
    const fromSparse = displacers.filter((id) => spa.has(id));
    const neither = displacers.filter((id) => !spa.has(id));

    displacersTotal += displacers.length;
    inSparseTop5 += fromSparse.length;
    heldByDenseToo += hyb.length - displacers.length;
    inNeitherTop5 += neither.length;
    for (const id of displacers) repeatOffender.set(id, (repeatOffender.get(id) ?? 0) + 1);

    perQuery.push({
      id: q.id,
      group: q.group,
      denseGoldRank: q.ranks.dense,
      sparseGoldRank: q.ranks.sparse ?? null,
      hybridTop5: hyb,
      displacers,
      displacersAlsoInSparseTop5: fromSparse,
      displacersInNeitherTop5: neither,
    });
  }

  const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);

  console.log('');
  console.log("WHERE HYBRID'S TOP-5 SLOTS CAME FROM, on those queries");
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log(`  slots held by a doc dense also had in top-5    ${heldByDenseToo}`);
  console.log(`  slots held by a DISPLACER (not in dense top-5) ${displacersTotal}`);
  console.log(
    `    of which sparse ALSO had in its top-5         ${inSparseTop5}  (${pct(inSparseTop5, displacersTotal)} of displacers)`,
  );
  console.log(
    `    of which in NEITHER arm's top-5               ${inNeitherTop5}  (${pct(inNeitherTop5, displacersTotal)} of displacers)`,
  );

  let baseHybridSlots = 0;
  let baseSparseAgreed = 0;
  for (const q of qs) {
    const hyb = q.top5.hybrid ?? [];
    const spa = new Set(q.top5.sparse ?? []);
    baseHybridSlots += hyb.length;
    baseSparseAgreed += hyb.filter((id) => spa.has(id)).length;
  }
  console.log('');
  console.log(
    `  BASE RATE across all ${qs.length} queries: sparse top-5 agrees with ` +
      `${baseSparseAgreed}/${baseHybridSlots} hybrid top-5 slots (${pct(baseSparseAgreed, baseHybridSlots)})`,
  );

  /**
   * THE DECIDING TEST, and it needs the full rank lists rather than the fives.
   *
   * For every displacer, where did each ARM rank it? A displacer both arms
   * returned collects two RRF terms; one only dense returned collects one. If
   * displacers are overwhelmingly two-term documents while gold is a one-term
   * document, the mechanism is agreement, and it is agreement operating from
   * ranks a top-five snapshot cannot see.
   */
  const deep = qs.some((q) => (q.ranked.dense?.length ?? 0) > 5);
  let twoArm = 0;
  let oneArm = 0;
  let unseen = 0;
  let goldTwoArm = 0;
  let goldOneArm = 0;
  const sparseRanksOfDisplacers: number[] = [];
  if (deep) {
    for (const q of damaged) {
      const hyb = q.top5.hybrid ?? [];
      const den = q.ranked.dense ?? [];
      const spa = q.ranked.sparse ?? [];
      const denSet = new Set(den);
      const spaSet = new Set(spa);
      const denTop5 = new Set(q.top5.dense ?? []);
      for (const id of hyb) {
        if (denTop5.has(id)) continue;
        const inD = denSet.has(id);
        const inS = spaSet.has(id);
        if (inD && inS) {
          twoArm++;
          sparseRanksOfDisplacers.push(spa.indexOf(id) + 1);
        } else if (inD || inS) oneArm++;
        else unseen++;
      }
      /**
       * And the gold it displaced: how many arms found IT? This is the other
       * half of the same claim and it is the half that names the fix.
       */
      const goldId = den[(q.ranks.dense ?? 1) - 1];
      if (goldId !== undefined) {
        if (spaSet.has(goldId)) goldTwoArm++;
        else goldOneArm++;
      }
    }
    const dTot = twoArm + oneArm + unseen;
    console.log('');
    console.log('HOW MANY ARMS FOUND EACH DISPLACER — full 20-rank lists');
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log(`  BOTH arms (two RRF terms)      ${twoArm}  (${pct(twoArm, dTot)})`);
    console.log(`  ONE arm  (one RRF term)        ${oneArm}  (${pct(oneArm, dTot)})`);
    console.log(
      `  neither arm's top 20           ${unseen}  (${pct(unseen, dTot)})  — arrived from deeper than 20`,
    );
    if (sparseRanksOfDisplacers.length > 0) {
      const srt = [...sparseRanksOfDisplacers].sort((a, b) => a - b);
      console.log(
        `  where sparse had the two-term displacers: median rank ${srt[Math.floor(srt.length / 2)]}` +
          `, min ${srt[0]}, max ${srt[srt.length - 1]}`,
      );
    }
    console.log('');
    console.log('AND THE GOLD THEY DISPLACED — how many arms found IT');
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log(
      `  gold found by BOTH arms        ${goldTwoArm}  (${pct(goldTwoArm, goldTwoArm + goldOneArm)})`,
    );
    console.log(
      `  gold found by DENSE ONLY       ${goldOneArm}  (${pct(goldOneArm, goldTwoArm + goldOneArm)})`,
    );
    console.log('');
    console.log('  If gold is overwhelmingly one-term while displacers are two-term, the');
    console.log('  mechanism is RRF rewarding ARM COUNT, and arm count is noise while one');
    console.log('  arm is near-arbitrary. The fix is then weighting or dropping that arm,');
    console.log('  not tuning the vector index.');
  } else {
    console.log('');
    console.log('rankedIds absent from this checkpoint — only the top FIVE per arm is');
    console.log('visible, which cannot see the mechanism. Re-run to populate them.');
  }

  const repeats = [...repeatOffender.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);
  console.log('');
  if (repeats.length === 0) {
    console.log('no document displaced gold on more than one query — displacement is not');
    console.log('one over-retrieved authority, it is query-specific noise');
  } else {
    console.log(`documents that displaced gold on MORE THAN ONE query: ${repeats.length}`);
    for (const [id, n] of repeats.slice(0, 10)) console.log(`  ${n}x  ${id}`);
  }

  if (OUT) {
    writeFileSync(
      OUT,
      JSON.stringify(
        {
          checkpoint: CHECKPOINT,
          pass: PASS,
          queries: qs.length,
          damagedQueries: damaged.length,
          slots: { heldByDenseToo, displacers: displacersTotal },
          displacers: { alsoInSparseTop5: inSparseTop5, inNeitherTop5 },
          baseRate: { sparseAgreedSlots: baseSparseAgreed, hybridSlots: baseHybridSlots },
          deepRanksAvailable: deep,
          displacerArmCount: { bothArms: twoArm, oneArm, neitherTop20: unseen },
          displacedGoldArmCount: { bothArms: goldTwoArm, denseOnly: goldOneArm },
          repeatOffenders: repeats.map(([id, n]) => ({ judgmentId: id, queries: n })),
          perQuery,
        },
        null,
        2,
      ),
    );
    console.log(`\nwrote ${OUT}`);
  }
  return 0;
}

process.exit(main(await load()));
