#!/usr/bin/env node
/**
 * NEW1 — 100k PASSAGE TRANCHE SELECTOR. §7 NEW1-2.
 *
 * Design and justification: docs/ai/new1-tier-a/TRANCHE_100K_DESIGN.md
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE RULES THIS FILE EXISTS TO ENFORCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. GOLD-BLIND SAMPLING. The stratified draw never looks at gold membership.
 *    Gold that lands in the tranche naturally is marked `natural`; gold that has
 *    to be added afterwards is marked `forced`. END-TO-END success counts a
 *    `forced` target as a MISS. Force all 213 gold in unmarked and the benchmark
 *    measures ranking inside a set rigged to contain the answer — which is not
 *    the product's question.
 *
 * 2. ONE DEFINITION OF ELIGIBILITY. The frame is the deployed view
 *    `judgment_embedding_eligibility`, and its hash is recorded in the output.
 *    `services/embed/src/eligibility.ts` warns that a fallback would be a SECOND
 *    definition of eligibility; this file does not become that. The recorded hash
 *    is how a later reader knows whether the contract moved underneath the
 *    tranche.
 *
 * 3. UNDERFILL IS REPORTED, NEVER SILENTLY REBALANCED. There is no pre-1990
 *    Meghalaya High Court judgment to find. When a stratum cell cannot be filled
 *    the shortfall is recorded per cell and the tranche is smaller — because a
 *    quota quietly moved to whichever cell had rows is how an aggregate check
 *    passes while two of three scopes are dead.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE ERA MIX IS NOT PROPORTIONAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured (TABLESAMPLE 0.1 over judgments): the corpus is 96.5% post-2010 and
 * 0.08% pre-1990. A proportional 100k sample holds ~48 pre-1990 documents, which
 * cannot support any statement about older authority — the settled-proposition
 * material advocates cite most. So era targets are deliberately skewed toward
 * older, BOTH proportions are written into the manifest, and no corpus-wide rate
 * may be quoted from a tranche built this way.
 *
 * USAGE
 *   DATABASE_URL=... node services/harness/src/tranche-select-cli.mjs --plan
 *   DATABASE_URL=... node services/harness/src/tranche-select-cli.mjs
 */
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const url =
  process.env.DATABASE_URL ??
  readFileSync(new URL('.env', ROOT), 'utf8')
    .match(/^DATABASE_URL=(.*)$/m)[1]
    .trim();

const PLAN_ONLY = process.argv.includes('--plan');
const TARGET = Number(process.env.TRANCHE_SIZE ?? 100_000);
const OUT = new URL('docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json', ROOT);
const MANIFEST = new URL('docs/ai/new1-tier-a/V31_MANIFEST.json', ROOT);
const SEED = process.env.TRANCHE_SEED ?? 'lawmind-new1-tranche-100k-2026-08-25';

/**
 * ERA BUCKETS — deliberately NOT the corpus proportions. See the header.
 * `corpusShare` is the measured reality, kept beside the target so the skew is
 * visible in the artifact rather than buried in this file.
 */
const ERAS = [
  { name: 'PRE_1990', from: '1900-01-01', to: '1990-01-01', target: 0.05, corpusShare: 0.0008 },
  { name: 'ERA_1990S', from: '1990-01-01', to: '2000-01-01', target: 0.1, corpusShare: 0.0018 },
  { name: 'ERA_2000S', from: '2000-01-01', to: '2010-01-01', target: 0.2, corpusShare: 0.056 },
  { name: 'ERA_2010S', from: '2010-01-01', to: '2020-01-01', target: 0.35, corpusShare: 0.417 },
  { name: 'ERA_2020S', from: '2020-01-01', to: '2100-01-01', target: 0.3, corpusShare: 0.548 },
];

/**
 * COURT GROUPS. The Supreme Court is oversampled relative to its share of the
 * staged corpus (9,829 rows, under 0.5%) because it is the most-cited court in
 * the country and a tranche that mirrors raw volume would barely contain it.
 * Named High Courts are the largest staged populations; everything else is
 * pooled so that small courts are represented without each getting a quota it
 * cannot fill.
 */
const COURTS = [
  { name: 'Supreme Court of India', share: 0.1 },
  { name: 'Madras High Court', share: 0.08 },
  { name: 'Allahabad High Court', share: 0.08 },
  { name: 'Patna High Court', share: 0.06 },
  { name: 'High Court of Kerala', share: 0.06 },
  { name: 'Bombay High Court', share: 0.06 },
  { name: 'High Court  for State of Telangana', share: 0.05 },
  { name: 'High Court Of Rajasthan', share: 0.05 },
  { name: 'High Court of Karnataka', share: 0.05 },
  { name: 'High Court of Punjab and Haryana', share: 0.05 },
  { name: 'High Court of Delhi', share: 0.05 },
  { name: 'Calcutta High Court', share: 0.05 },
  { name: 'High Court of Gujarat', share: 0.04 },
  { name: 'High Court of Madhya Pradesh', share: 0.04 },
  { name: '__OTHER__', share: 0.18 },
];

const sql = postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 30 });

try {
  // ── the eligibility contract, by hash ──────────────────────────────────────
  const [{ def }] = await sql`SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def`;
  const viewHash = createHash('sha256').update(def).digest('hex');
  console.log(`eligibility view hash: ${viewHash.slice(0, 16)}`);

  const v31 = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const goldIds = [...new Set(v31.tasks.flatMap((t) => t.targets))].sort();
  console.log(`V3.1 gold targets: ${goldIds.length}`);

  const named = COURTS.filter((c) => c.name !== '__OTHER__').map((c) => c.name);
  const cells = [];

  for (const court of COURTS) {
    for (const era of ERAS) {
      const quota = Math.round(TARGET * court.share * era.target);
      if (quota === 0) continue;
      cells.push({ court: court.name, era: era.name, from: era.from, to: era.to, quota });
    }
  }
  console.log(`strata cells: ${cells.length}  ·  target ${TARGET.toLocaleString()}`);

  /**
   * ONE PASS, NOT SEVENTY-FIVE.
   *
   * The first version issued one query per stratum cell. Measured against the
   * live box, a single cell took 88 seconds — `judgment_embedding_eligibility`
   * is a computed view over ~15.9M rows, so every cell paid for its own
   * evaluation, and 75 of them is roughly two hours of scanning while my own
   * embedding walk reads the same disk. I killed it rather than finish it.
   *
   * This does the whole draw in one statement: partition by (court group, era),
   * number the rows inside each partition, and keep those under the cell's
   * quota. The view is evaluated once. The quota table is passed in as a VALUES
   * join so the allocation still lives in JavaScript where it can be read,
   * rather than being encoded into SQL by hand.
   *
   * `ORDER BY id` inside the partition is a deterministic, effectively-random
   * pick because ids are uuids — and the chosen ids are frozen into the artifact
   * regardless, so the draw only has to be repeatable long enough to write it.
   */
  const picked = [];
  const cellReport = [];

  const quotaRows = cells.map((c) => [c.court, c.era, c.from, c.to, c.quota]);
  console.log('drawing the whole tranche in ONE pass over the eligibility view…');

  const rows = await sql`
    WITH quota(court_key, era, era_from, era_to, quota) AS (
      SELECT * FROM ${sql(quotaRows)}
    ),
    labelled AS (
      SELECT e.id::text AS id, e.court, e.judgment_date, e.text_length, e.script_quality,
             e.axis_c_role, e.value_band, e.semantic_tier, e.is_cited_authority,
             q.court_key AS stratum_court, q.era AS stratum_era, q.quota,
             row_number() OVER (PARTITION BY q.court_key, q.era ORDER BY e.id) AS rn
      FROM judgment_embedding_eligibility e
      JOIN quota q
        ON e.judgment_date >= q.era_from::date
       AND e.judgment_date <  q.era_to::date
       AND ( (q.court_key <> '__OTHER__' AND e.court = q.court_key)
          OR (q.court_key =  '__OTHER__' AND NOT (e.court = ANY(${named}))) )
    )
    SELECT id, court, judgment_date, text_length, script_quality, axis_c_role,
           value_band, semantic_tier, is_cited_authority, stratum_court, stratum_era
    FROM labelled WHERE rn <= quota`;

  for (const r of rows) {
    picked.push({ ...r, stratumCourt: r.stratum_court, stratumEra: r.stratum_era });
  }

  // Per-cell fill, computed from what actually came back.
  const filledBy = new Map();
  for (const r of rows) {
    const k = `${r.stratum_court}#${r.stratum_era}`;
    filledBy.set(k, (filledBy.get(k) ?? 0) + 1);
  }
  for (const c of cells) {
    const filled = filledBy.get(`${c.court}#${c.era}`) ?? 0;
    const shortfall = c.quota - filled;
    cellReport.push({
      court: c.court,
      era: c.era,
      quota: c.quota,
      filled,
      shortfall,
      // Reported, NEVER redistributed. A quota quietly moved to whichever cell
      // had rows is how an aggregate check passes with dead scopes underneath.
      note: shortfall > 0 ? 'UNDERFILLED — not redistributed, by design' : null,
    });
  }

  const underfilled = cellReport.filter((c) => c.shortfall > 0);
  console.log(`cells underfilled: ${underfilled.length}/${cellReport.length}`);
  console.log(`tranche drawn: ${picked.length.toLocaleString()} (target ${TARGET.toLocaleString()})`);

  if (PLAN_ONLY) {
    console.log('\n--- PLAN ONLY, nothing written ---');
    for (const c of cellReport.filter((x) => x.shortfall > 0).slice(0, 25)) {
      console.log(`  UNDERFILL ${c.court} / ${c.era}: ${c.filled}/${c.quota}`);
    }
    await sql.end({ timeout: 10 });
    process.exit(0);
  }

  // ── gold: natural vs forced. THE line that keeps the metric honest. ────────
  const trancheIds = new Set(picked.map((p) => p.id));
  const naturalGold = goldIds.filter((g) => trancheIds.has(g));
  const forcedGold = goldIds.filter((g) => !trancheIds.has(g));
  console.log(`gold natural: ${naturalGold.length}/${goldIds.length}  ·  forced: ${forcedGold.length}`);

  // ── how much of the tranche production dense search cannot reach today ─────
  const ids = picked.map((p) => p.id);
  const stagedRows = await sql`
    SELECT judgment_id::text AS id FROM new1_doc_vector_stage
    WHERE judgment_id::text = ANY(${ids})`;
  const stagedSet = new Set(stagedRows.map((r) => r.id));
  const unstaged = ids.filter((i) => !stagedSet.has(i));
  console.log(
    `already in production stage: ${stagedSet.size.toLocaleString()}  ·  NOT reachable today: ${unstaged.length.toLocaleString()} (${((100 * unstaged.length) / Math.max(1, ids.length)).toFixed(1)}%)`,
  );

  const body = {
    kind: 'new1_tranche_100k_manifest',
    builtAt: new Date().toISOString(),
    seed: SEED,
    targetSize: TARGET,
    actualSize: picked.length,
    eligibilityViewSha256: viewHash,
    eligibilityNote:
      'Frame is the DEPLOYED view judgment_embedding_eligibility. Hash recorded so a later reader can tell whether the contract moved underneath this tranche. This file is not a second definition of eligibility.',
    goldBlind: true,
    gold: {
      total: goldIds.length,
      natural: naturalGold.length,
      forced: forcedGold.length,
      naturalIds: naturalGold,
      forcedIds: forcedGold,
      rule: 'END-TO-END success counts a FORCED target as a MISS. CONDITIONAL ranking may include it. Reporting one without the other is not permitted.',
    },
    reachability: {
      alreadyInProductionStage: stagedSet.size,
      notReachableToday: unstaged.length,
      notReachableSharePct: Number(((100 * unstaged.length) / Math.max(1, ids.length)).toFixed(2)),
      note: 'Drawn from judgments-side eligibility, never from new1_doc_vector_stage — sampling the stage would guarantee everything is already reachable and delete a mandated stratum.',
    },
    eraSkew: ERAS.map((e) => ({ era: e.name, targetShare: e.target, corpusShare: e.corpusShare })),
    eraSkewNote:
      'Deliberately non-proportional. The corpus is 96.5% post-2010; a proportional 100k sample holds ~48 pre-1990 documents. No corpus-wide rate may be quoted from this tranche.',
    strata: cellReport,
    underfilledCells: underfilled.length,
    underfillNote: 'Shortfalls are reported and NEVER redistributed. A smaller tranche is honest; a rebalanced one hides a dead cell.',
    documents: picked.map((p) => ({
      id: p.id,
      court: p.court,
      date: p.judgment_date,
      textLength: p.text_length,
      scriptQuality: p.script_quality,
      axisCRole: p.axis_c_role,
      valueBand: p.value_band,
      semanticTier: p.semantic_tier,
      isCitedAuthority: p.is_cited_authority,
      stratumCourt: p.stratumCourt,
      stratumEra: p.stratumEra,
      inProductionStage: stagedSet.has(p.id),
      isGold: trancheIds.has(p.id) && goldIds.includes(p.id),
    })),
  };

  const { builtAt: _b, ...invariant } = body;
  const contentSha256 = createHash('sha256').update(JSON.stringify(invariant)).digest('hex');
  writeFileSync(OUT, JSON.stringify({ ...body, contentSha256 }, null, 2));

  console.log('');
  console.log('TRANCHE MANIFEST WRITTEN');
  console.log(`  file            ${OUT.pathname}`);
  console.log(`  contentSha256   ${contentSha256}`);
  console.log(`  documents       ${picked.length.toLocaleString()}`);
  console.log(`  gold            ${naturalGold.length} natural / ${forcedGold.length} forced`);
  console.log(`  unreachable now ${unstaged.length.toLocaleString()}`);
  console.log(`  underfilled     ${underfilled.length} cells`);
} finally {
  await sql.end({ timeout: 10 });
}
