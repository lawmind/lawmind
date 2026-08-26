#!/usr/bin/env node
/**
 * NEW1 — R8.3 §8.5 / §9 / §12 N1-4 & N1-5. The evidence-safe retrieval experiment.
 *
 * ONE bounded experiment on the existing 418,116-passage tranche. It does not
 * build a representation, does not rerank, does not add a model, and does not
 * touch `chunk.ts`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE QUESTION
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Not "is semantic search good". §5.2 and §0 Correction 5 ask something narrower
 * and answerable:
 *
 *   > what share of served evidence is actually GENERATION-EVIDENCE-ELIGIBLE
 *   > court-authored text, under a validated policy — and what does enforcing
 *   > that cost in finding the right judgment at all?
 *
 * Those are two different successes and this harness never merges them:
 *
 *   judgment success@5           the right judgment is in the top 5
 *   generation-evidence s@5      the right judgment is in the top 5 AND the
 *                                passage served as its evidence is eligible
 *
 * A system can score well on the first and zero on the second. That gap is the
 * release-relevant number and a single "s@5" hides it completely.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE ARMS — §9's required comparison, in full
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * pgvector's documentation is explicit that with an approximate index the filter
 * is applied AFTER the ANN scan, so a selective filter returns too few rows.
 * §9 therefore FORBIDS concluding "the role filter hurts representation" from a
 * naive `WHERE role != ...`. The naive case is still measured — as the trap,
 * labelled — beside the two configurations that are not the trap:
 *
 *   exact_unfiltered      index scans off. Brute force. The ranking ground truth,
 *                         and a drift control against the R8.1 `exact` arm.
 *   ann_unfiltered        ef_search=200, no filter. The R8.1 baseline.
 *   exact_filtered        index scans off, filter in SQL. THE FILTERED REFERENCE:
 *                         what a perfect filtered retriever would return.
 *   ann_postfilter        ann_unfiltered's rows filtered in application memory.
 *                         The naive case §9 warns about. Measured to show the size
 *                         of the trap, never to draw a conclusion from.
 *   ann_iter_strict       filter in SQL + hnsw.iterative_scan = strict_order
 *   ann_iter_relaxed      filter in SQL + hnsw.iterative_scan = relaxed_order
 *   ann_partial_index     OPTIONAL, --partial-index. Lab-only partial HNSW built
 *                         over the eligible rows. Requires a column on the
 *                         indexed relation, so it is the one arm that alters
 *                         `new1_tranche_passages`, and it says so.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE TWO SCORING MODES — §8.5
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *   ARM_A  strict exclusion. Prohibited passages never enter the candidate path.
 *          The document is ranked by an eligible passage and the evidence IS that
 *          passage.
 *
 *   ARM_B  locator -> court-evidence re-anchor. A non-court passage may LOCATE a
 *          judgment — the ranking is the unfiltered ranking — but the evidence
 *          returned is re-anchored to an eligible court-authored passage in that
 *          same judgment. The reporter/party text never leaves as evidence.
 *          A document with no eligible passage is counted as EVIDENCELESS rather
 *          than quietly served with whatever was there.
 *
 *   BASE   what ships today: unfiltered ranking, evidence is whatever passage
 *          ranked the document, whatever its role.
 *
 * §8.5 is explicit that the experiment itself makes NO rights conclusion, and
 * neither does this file. ARM_B's deployability turns on an unresolved
 * content-use question — `docs/FOUNDER_QUEUE.md` "May we reproduce the OFFICIAL
 * SCR headnotes from e-SCR?" is OPEN, and OD-13 is OPEN. What the experiment can
 * say is what each option COSTS. What it may not say is which one is permitted.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TWO POLICIES, BECAUSE ONE WOULD BE A DECISION
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Evidence eligibility is applied at SCORING time, so both readings cost nothing
 * extra to report and the freeze decision sees the bracket rather than a number
 * this lane picked:
 *
 *   STRICT         COURT_REASONING + HOLDING_OPERATIVE + FACTS + PROCEDURAL_HISTORY
 *   WITH_UNKNOWN   the above plus OTHER_UNKNOWN, which is ~60% of the pool and is
 *                  NOT court-authored — it is text the cascade recognised nothing in
 *
 * The retrieval FILTER is a separate parameter and defaults to Arm A's actual
 * wording in §8.5 — remove high-confidence reporter/editorial (and the two damage
 * classes, which cannot be evidence because their span is not provable).
 *
 * Read-only against the corpus. Writes one artifact and one checkpoint.
 *
 * Usage:
 *   node services/harness/src/n1-evidence-safe-cli.mjs --smoke 6
 *   node services/harness/src/n1-evidence-safe-cli.mjs --run
 *   node services/harness/src/n1-evidence-safe-cli.mjs --explain
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import {
  CLASSIFIER_VERSION,
  DAMAGE_ROLES,
  GENERATION_EVIDENCE_STRICT,
  GENERATION_EVIDENCE_WITH_UNKNOWN,
  REPORTER_EXCLUDED_ONLY,
  ROLES,
  assertClassifierParity,
} from './n1-role-policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const P = (p) => join(ROOT, p);

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const TRANCHE = P('docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json');
const V31 = P('docs/ai/new1-tier-a/V31_MANIFEST.json');
const SPLIT = P('docs/ai/new1-tier-a/V31_ABSTENTION_SPLIT.json');
const OUT = P('docs/ai/new1-r83/EVIDENCE_SAFE_METRICS_R8_3.json');
const CKPT = P('docs/ai/new1-r83/evidence-safe.checkpoint.jsonl');
const ROLE_TABLE = 'n1_lab_passage_role';

const GPU = process.env.GPU_ENDPOINT ?? 'http://127.0.0.1:8799';
const EF_PROD = Number(val('--ef', 200));
const DEPTH = Number(val('--depth', 2000));
/** Production's route bound. §12 N1-6: over this is a refusal family, never truncated. */
const ROUTE_CHAR_LIMIT = Number(val('--route-limit', 500));
const KS = [1, 5, 20, 100, 500];
const SMOKE = has('--smoke') ? Number(val('--smoke', 6)) : null;
const REPORT_MS = Number(val('--report-ms', 15 * 60 * 1000));
const RETRIEVAL_FILTER = REPORTER_EXCLUDED_ONLY;

/**
 * ARM_B IS BUILT AND MUST NOT RUN — FIFTH ruling, bus 1355.
 *
 * I argued that locator-only is strictly narrower than what ships today, so
 * running it could not make anything more permissive. FIFTH's answer is that
 * §8.5 does not ask whether ARM_B is narrower than today's defect; it asks
 * whether existing policy permits internal/index use — and:
 *
 *   - CLAUDE.md §6 says use raw court text and NEVER a law report's edition;
 *   - the official e-SCR headnote question is OPEN for counsel in FOUNDER_QUEUE;
 *   - OD-13 is OPEN and forbids a lane resolving the reporter layer alone.
 *
 * **Using excluded reporter/editorial text as a retrieval locator is still
 * functional use of that text, even when it never leaves as evidence. Calling it
 * an experiment does not supply the missing permission.** That is right and my
 * framing was wrong: "narrower than the current bug" is not the test.
 *
 * The ruling is enforced here mechanically rather than by anyone remembering it.
 * `--arm-b` does not run it; it prints the ruling and exits. Reversing this needs
 * the content-use decision, not a flag.
 */
const ARM_B_STATE = 'NOT_RUN_CONTENT_USE_UNRESOLVED';
const ARM_B_RULING =
  'ARM_B (locator -> court-evidence re-anchor) is BUILT and NOT RUN per FIFTH bus 1355. ' +
  'Using excluded reporter/editorial text as a retrieval locator is functional use of that text. ' +
  'Existing policy does not permit it: CLAUDE.md §6 (raw court text, never a reporter edition), ' +
  'FOUNDER_QUEUE e-SCR headnote question OPEN, OD-13 OPEN. This is not a finding that ARM_B is ' +
  'unlawful — it is the required refusal to infer a permission. Resolve the content-use decision, ' +
  'not this flag.';

/**
 * FIFTH bus 1355: the 295 query texts ARE consumable — they are committed,
 * published artifacts, they were used in R8.1, and they are not a hidden
 * holdout. The condition is that every artifact says what they are, so that a
 * development score can never be read later as Gold V3 evidence. Gold V3 does
 * not exist and this ruling opened no part of it.
 */
const TASK_SET_LABEL = 'PUBLIC_DEVELOPMENT_REUSED';

const url =
  process.env.DATABASE_URL ??
  readFileSync(P('.env'), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const log = (s) => console.log(`${new Date().toISOString()}  ${s}`);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pct = (n, d) => (d === 0 ? null : Number((n / d).toFixed(4)));

const sql = postgres(url, { max: 1, idle_timeout: 120, connect_timeout: 30 });

// ── task set, query text recovered and hash-verified (same rule as R8.1) ─────
//
// The manifest stores `querySha256`, not the query. Re-hashing the recovered
// text proves the set being scored is the set that was frozen — a filename
// cannot prove that, and a benchmark scored against a drifted set looks normal.
function loadQueryTexts() {
  const texts = new Map();
  const posed = JSON.parse(readFileSync(P('docs/ai/new2/ADVOCATE100.json'), 'utf8'));
  for (const t of posed.tasks) texts.set(t.task_id, t.query);
  for (const f of [
    'docs/ai/new3-uncited-authority-gold-v2.json',
    'docs/ai/new3-noncitation-gold.json',
    'docs/ai/new3-semantic-expansion-gold-v2.json',
  ]) {
    if (!existsSync(P(f))) continue;
    const j = JSON.parse(readFileSync(P(f), 'utf8'));
    for (const r of j.cases ?? []) {
      const id = r.query_id ?? r.id;
      if (id && r.query) texts.set(id, r.query);
    }
  }
  return texts;
}

async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const part = texts.slice(i, i + 32);
    const res = await fetch(`${GPU}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: part }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`embed sidecar ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (body.vectors.length !== part.length)
      throw new Error(`sidecar returned ${body.vectors.length} vectors for ${part.length} texts`);
    for (const v of body.vectors) out.push(`[${v.join(',')}]`);
  }
  return out;
}

/**
 * How busy the box was WHILE this query ran. A 1.4s query once got timed at over
 * twelve minutes on this machine because something else was on the box, and the
 * timing was recorded without the context that explained it. LOCAL_QUIET is a
 * claim about the machine, so it has to be measured, not asserted.
 */
async function concurrency() {
  const [{ n }] = await sql`
    SELECT count(*)::text AS n FROM pg_stat_activity
     WHERE state = 'active' AND pid <> pg_backend_pid() AND backend_type = 'client backend'`;
  return Number(n);
}

// ── the arms ────────────────────────────────────────────────────────────────
//
// Every arm SETs its own GUCs with SET LOCAL inside a transaction and then
// ASSERTS them back. `ef_search must be set, not inherited`: an unset ef_search
// silently runs at pgvector's default of 40, which loses roughly two thirds of
// the exact top-100 — and the query succeeds, so nothing looks wrong.
async function runArm(arm, vec) {
  const t0 = Date.now();
  const busyBefore = await concurrency();
  const rows = await sql.begin(async (tx) => {
    if (arm.exact) {
      await tx.unsafe('SET LOCAL enable_indexscan = off');
      await tx.unsafe('SET LOCAL enable_bitmapscan = off');
    } else {
      await tx.unsafe(`SET LOCAL hnsw.ef_search = ${EF_PROD}`);
      await tx.unsafe(`SET LOCAL hnsw.iterative_scan = ${arm.iterative ?? 'off'}`);
      const [{ ef }] = await tx.unsafe(`SELECT current_setting('hnsw.ef_search') AS ef`);
      if (Number(ef) !== EF_PROD)
        throw new Error(`ef_search is ${ef}, expected ${EF_PROD} — the arm is not the arm it claims to be`);
      const [{ it }] = await tx.unsafe(`SELECT current_setting('hnsw.iterative_scan') AS it`);
      if (it !== (arm.iterative ?? 'off'))
        throw new Error(`iterative_scan is ${it}, expected ${arm.iterative ?? 'off'}`);
    }
    if (arm.filtered) {
      return tx.unsafe(
        `SELECT p.judgment_id::text AS id, p.chunk_index, p.char_offset, p.body_length, r.role,
                1 - (p.embedding <=> $1::vector) AS sim
           FROM new1_tranche_passages p
           JOIN ${ROLE_TABLE} r
             ON r.judgment_id = p.judgment_id AND r.chunk_index = p.chunk_index
          WHERE r.role = ANY($2::text[])
          ORDER BY p.embedding <=> $1::vector
          LIMIT ${DEPTH}`,
        [vec, RETRIEVAL_FILTER],
      );
    }
    // THE UNFILTERED ARMS DO NOT JOIN.
    //
    // Joining the label table here would have been convenient — the role is
    // wanted for the composition tally either way — and it would have quietly
    // broken the experiment. A join changes the plan pgvector runs, so the
    // "baseline" would no longer be the query R8.1 measured or the one
    // production ships, and every filtered-vs-unfiltered delta would be
    // contaminated by the shape of the comparison rather than the filter.
    // Roles for the unfiltered arms are looked up afterwards, keyed, off the
    // ranking path.
    return tx.unsafe(
      `SELECT p.judgment_id::text AS id, p.chunk_index, p.char_offset, p.body_length,
              1 - (p.embedding <=> $1::vector) AS sim
         FROM new1_tranche_passages p
        ORDER BY p.embedding <=> $1::vector
        LIMIT ${DEPTH}`,
      [vec],
    );
  });
  return { rows, ms: Date.now() - t0, busyBefore, busyAfter: await concurrency() };
}

/** Roles for named passages, off the ranking path so it cannot alter a plan. */
async function rolesFor(pairs) {
  if (pairs.length === 0) return new Map();
  const rows = await sql.unsafe(
    `SELECT judgment_id::text AS id, chunk_index, role
       FROM ${ROLE_TABLE}
      WHERE (judgment_id, chunk_index) IN (
        SELECT * FROM unnest($1::uuid[], $2::int[]))`,
    [pairs.map((p) => p.id), pairs.map((p) => p.chunkIndex)],
  );
  return new Map(rows.map((r) => [`${r.id}:${r.chunk_index}`, r.role]));
}

/** passage -> document by MAX similarity. Summing rewards long documents for length. */
function aggregate(rows) {
  const best = new Map();
  for (const r of rows) {
    const prev = best.get(r.id);
    if (!prev || Number(r.sim) > prev.sim)
      best.set(r.id, { sim: Number(r.sim), role: r.role, chunkIndex: r.chunk_index, charOffset: r.char_offset });
  }
  return [...best.entries()].sort((a, b) => b[1].sim - a[1].sim);
}

/**
 * ARM_B. The document ranking is the LOCATOR ranking — any role may locate. The
 * evidence is re-anchored to the best ELIGIBLE passage inside that same judgment,
 * which may be a completely different passage from the one that ranked it, and
 * may not exist at all. A document with none is EVIDENCELESS: under a fail-closed
 * rule it cannot be served with evidence, and pretending otherwise is exactly the
 * substitution §8.3 forbids.
 */
async function reanchor(docIds, vec, eligible) {
  if (docIds.length === 0) return new Map();
  const rows = await sql.unsafe(
    `SELECT DISTINCT ON (p.judgment_id)
            p.judgment_id::text AS id, p.chunk_index, p.char_offset, r.role,
            1 - (p.embedding <=> $1::vector) AS sim
       FROM new1_tranche_passages p
       JOIN ${ROLE_TABLE} r
         ON r.judgment_id = p.judgment_id AND r.chunk_index = p.chunk_index
      WHERE p.judgment_id = ANY($2::uuid[]) AND r.role = ANY($3::text[])
      ORDER BY p.judgment_id, p.embedding <=> $1::vector`,
    [vec, docIds, eligible],
  );
  return new Map(rows.map((r) => [r.id, { sim: Number(r.sim), role: r.role, chunkIndex: r.chunk_index }]));
}

function tally(into, role) {
  into[role] = (into[role] ?? 0) + 1;
}

async function main() {
  const parity = assertClassifierParity(ROOT);
  log(`classifier parity OK  ${parity}  (${CLASSIFIER_VERSION})`);

  // The filtered arms JOIN the label table. If it does not cover the tranche,
  // an inner join silently DROPS unlabelled passages from every arm including
  // the unfiltered ones, and the baseline stops being the baseline.
  const [{ ok }] = await sql`SELECT to_regclass(${ROLE_TABLE}) IS NOT NULL AS ok`;
  if (!ok) throw new Error(`${ROLE_TABLE} does not exist — run n1-role-materialise-cli.mjs --run first`);
  const [{ p: pn }] = await sql`SELECT count(*)::text AS p FROM new1_tranche_passages`;
  const [{ r: rn }] = await sql.unsafe(`SELECT count(*)::text AS r FROM ${ROLE_TABLE}`);
  if (Number(pn) !== Number(rn) && !SMOKE)
    throw new Error(
      `label coverage ${Number(rn).toLocaleString()} != tranche ${Number(pn).toLocaleString()}. ` +
        `An inner join would drop the difference from EVERY arm and the baseline would not be the baseline.`,
    );
  const passageCount = Number(pn);
  if (Number(pn) !== Number(rn) && SMOKE)
    log(
      `SMOKE: label coverage ${Number(rn).toLocaleString()} of ${Number(pn).toLocaleString()} — ` +
        `EVERY NUMBER FROM THIS RUN IS VOID. The inner join drops unlabelled passages from all arms ` +
        `including the baseline. This proves the code paths, nothing else.`,
    );
  const [{ v }] = await sql.unsafe(
    `SELECT count(DISTINCT classifier_version)::text AS v FROM ${ROLE_TABLE}`,
  );
  if (Number(v) !== 1) throw new Error(`${ROLE_TABLE} holds ${v} classifier versions — labels are not comparable`);

  const indexed = new Set(
    (await sql`SELECT DISTINCT judgment_id::text AS id FROM new1_tranche_passages`).map((r) => r.id),
  );
  log(`index ${passageCount.toLocaleString()} passages / ${indexed.size.toLocaleString()} documents, fully labelled`);

  const tranche = JSON.parse(readFileSync(TRANCHE, 'utf8'));
  const v31 = JSON.parse(readFileSync(V31, 'utf8'));
  const split = JSON.parse(readFileSync(SPLIT, 'utf8'));
  const splitOf = new Map((split.tasks ?? []).map((t) => [t.taskId, t.split]));
  const naturalGold = new Set(tranche.gold.naturalIds);

  const texts = loadQueryTexts();
  const tasks = [];
  for (const t of v31.tasks) {
    const q = texts.get(t.taskId);
    if (!q) throw new Error(`no query text for ${t.taskId} — refusing to score a set I cannot reconstruct`);
    if (sha(q) !== t.querySha256)
      throw new Error(`query text for ${t.taskId} does not match the frozen hash — the task set has drifted`);
    tasks.push({
      ...t,
      query: q,
      split: splitOf.get(t.taskId) ?? 'UNASSIGNED',
      // §12 N1-6. Not excluded, not truncated — separated, and reported apart.
      routeReachable: q.length <= ROUTE_CHAR_LIMIT,
    });
  }
  if (SMOKE) tasks.length = Math.min(tasks.length, SMOKE);
  log(`tasks ${tasks.length}, every query text hash-verified`);
  log(`route-reachable ${tasks.filter((t) => t.routeReachable).length}, over-limit ${tasks.filter((t) => !t.routeReachable).length}`);

  const ARMS = [
    { name: 'exact_unfiltered', exact: true, filtered: false },
    { name: 'ann_unfiltered', exact: false, filtered: false, iterative: 'off' },
    { name: 'exact_filtered', exact: true, filtered: true },
    { name: 'ann_iter_strict', exact: false, filtered: true, iterative: 'strict_order' },
    { name: 'ann_iter_relaxed', exact: false, filtered: true, iterative: 'relaxed_order' },
    { name: 'ann_naive_postfilter', exact: false, filtered: true, iterative: 'off' },
  ];

  log('embedding queries…');
  const vectors = await embedAll(tasks.map((t) => t.query));

  // Checkpoint keyed to the index it was scored against, exactly as the R8.1
  // eval is: a row scored against a different index size is a different
  // experiment, and averaging the two produces an artifact that looks normal.
  const done = new Set();
  let stale = 0;
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split(/[\r\n]+/)) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.indexPassages !== passageCount || r.classifierVersion !== CLASSIFIER_VERSION) {
          stale += 1;
          continue;
        }
        done.add(r.taskId);
      } catch {
        /* torn last line after a kill */
      }
    }
    log(`checkpoint: ${done.size} usable` + (stale ? `, ${stale} DISCARDED (different index or classifier)` : ''));
  }

  mkdirSync(dirname(CKPT), { recursive: true });
  let lastReport = Date.now();
  let sinceReport = 0;

  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    if (done.has(t.taskId)) continue;
    const vec = vectors[i];
    const row = {
      taskId: t.taskId,
      indexPassages: passageCount,
      classifierVersion: CLASSIFIER_VERSION,
      queryClass: t.queryClass,
      provenance: t.provenance,
      split: t.split,
      queryChars: t.query.length,
      routeReachable: t.routeReachable,
      arms: {},
    };

    for (const arm of ARMS) {
      const { rows, ms, busyBefore, busyAfter } = await runArm(arm, vec);
      const ordered = aggregate(rows);
      const ranked = ordered.map(([id]) => id);
      const top = ordered.slice(0, 10);
      if (!arm.filtered) {
        // Unfiltered arms carry no role from the ranking query by design; fill
        // it in for the served depth only.
        const looked = await rolesFor(top.map(([id, v]) => ({ id, chunkIndex: v.chunkIndex })));
        for (const [id, v] of top) v.role = looked.get(`${id}:${v.chunkIndex}`) ?? null;
      }

      row.arms[arm.name] = {
        efSearch: arm.exact ? null : EF_PROD,
        iterativeScan: arm.exact ? null : (arm.iterative ?? 'off'),
        filtered: arm.filtered,
        latencyMs: ms,
        concurrentQueries: Math.max(busyBefore, busyAfter),
        passagesReturned: rows.length,
        documentsAfterAggregation: ranked.length,
        topSim: ordered.length ? ordered[0][1].sim : null,
        topDocuments: ranked.slice(0, 500),
        // The evidence actually served at the depth a human reads, with its role.
        // This is the §5.2 question, per task rather than pooled.
        servedTop10: top.map(([id, v]) => ({ id, role: v.role, sim: Number(v.sim.toFixed(6)), chunkIndex: v.chunkIndex })),
      };
    }

    // ARM_B's re-anchor queries are NOT issued. FIFTH bus 1355 — see ARM_B_RULING.
    row.armB = ARM_B_STATE;

    appendFileSync(CKPT, JSON.stringify(row) + '\n');
    sinceReport += 1;
    if (Date.now() - lastReport >= REPORT_MS) {
      const durable = readFileSync(CKPT, 'utf8').split('\n').filter((l) => l.trim()).length;
      log(
        `PROGRESS scored=${i + 1}/${tasks.length} durable-checkpoint-lines=${durable} ` +
          `delta=${sinceReport} in ${((Date.now() - lastReport) / 60000).toFixed(1)}m` +
          (sinceReport === 0 ? '  <- ZERO DELTA: STALLED, not RUNNING' : ''),
      );
      lastReport = Date.now();
      sinceReport = 0;
    } else if ((i + 1) % 25 === 0) log(`  scored ${i + 1}/${tasks.length}`);
  }

  // ── scoring, re-read from the checkpoint so resume == uninterrupted ────────
  const all = readFileSync(CKPT, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((r) => r.indexPassages === passageCount && r.classifierVersion === CLASSIFIER_VERSION);
  const byId = new Map(all.map((r) => [r.taskId, r]));

  const scoreArm = (task, armRow, mode, eligible) => {
    const ranked = armRow.topDocuments;
    const targets = task.targets;
    const anyIndexed = targets.some((x) => indexed.has(x));
    const anyNatural = targets.some((x) => naturalGold.has(x) && indexed.has(x));
    let bestRank = Infinity;
    let hitId = null;
    for (const x of targets) {
      const p = ranked.indexOf(x);
      if (p >= 0 && p + 1 < bestRank) {
        bestRank = p + 1;
        hitId = x;
      }
    }
    const out = { bestRank: Number.isFinite(bestRank) ? bestRank : null, anyIndexed, anyNatural };
    for (const k of KS) out[`hit@${k}`] = Number.isFinite(bestRank) && bestRank <= k;

    // Generation-evidence success: the judgment is in the top 5 AND the passage
    // served as its evidence is eligible under `eligible`. Two different
    // questions, never merged into one number.
    let evidenceRole = null;
    let evidenceless = false;
    if (out['hit@5'] && hitId) {
      if (mode === 'ARM_B') {
        const key = `reanchor_${eligible === GENERATION_EVIDENCE_STRICT ? 'STRICT' : 'WITH_UNKNOWN'}`;
        const anchor = (armRow[key] ?? []).find((a) => a.id === hitId);
        evidenceless = !anchor || anchor.evidenceless === true;
        evidenceRole = anchor && !anchor.evidenceless ? anchor.role : null;
      } else {
        const served = (armRow.servedTop10 ?? []).find((s) => s.id === hitId);
        evidenceRole = served ? served.role : null;
      }
    }
    out.evidenceRole = evidenceRole;
    out.evidenceless = evidenceless;
    out['evidence@5'] = Boolean(out['hit@5'] && evidenceRole && eligible.includes(evidenceRole));
    return out;
  };

  const summarise = (subset, armName, mode, eligible) => {
    const rows = [];
    for (const t of tasks) {
      if (!subset(t)) continue;
      const r = byId.get(t.taskId);
      if (!r || !r.arms[armName]) continue;
      rows.push(scoreArm(t, r.arms[armName], mode, eligible));
    }
    const cond = rows.filter((r) => r.anyIndexed);
    const o = { tasks: rows.length, targetsInIndex: cond.length };
    for (const k of KS) {
      o[`cond_s@${k}`] = pct(cond.filter((r) => r[`hit@${k}`]).length, cond.length);
      o[`e2e_s@${k}`] = pct(rows.filter((r) => r[`hit@${k}`] && r.anyNatural).length, rows.length);
    }
    o['cond_evidence_s@5'] = pct(cond.filter((r) => r['evidence@5']).length, cond.length);
    // The gap IS the finding. A system that finds the judgment and cannot show
    // the court's own words for it has not done the job the surface implies.
    o.evidenceGapAt5 = o['cond_s@5'] === null || o['cond_evidence_s@5'] === null
      ? null
      : Number((o['cond_s@5'] - o['cond_evidence_s@5']).toFixed(4));
    o.evidencelessHitsAt5 = pct(cond.filter((r) => r['hit@5'] && r.evidenceless).length, cond.filter((r) => r['hit@5']).length);
    return o;
  };

  // Role composition of what each arm actually SERVES at depth 5 and 10.
  const composition = (armName, depth) => {
    const counts = Object.create(null);
    let n = 0;
    for (const r of all) {
      const served = r.arms[armName]?.servedTop10 ?? [];
      for (const s of served.slice(0, depth)) {
        tally(counts, s.role ?? 'NULL_LABEL');
        n += 1;
      }
    }
    const out = { passages: n, roles: {} };
    for (const role of [...ROLES, 'NULL_LABEL']) if (counts[role]) out.roles[role] = { n: counts[role], share: pct(counts[role], n) };
    out.reporterLeakage = pct(counts.REPORTER_EDITORIAL ?? 0, n);
    out.damageLeakage = pct(DAMAGE_ROLES.reduce((a, r) => a + (counts[r] ?? 0), 0), n);
    out.courtReasoning = pct(counts.COURT_REASONING ?? 0, n);
    out.holdingOperative = pct(counts.HOLDING_OPERATIVE ?? 0, n);
    out.partySubmission = pct(counts.PARTY_SUBMISSION ?? 0, n);
    out.unknown = pct(counts.OTHER_UNKNOWN ?? 0, n);
    return out;
  };

  const annVsExact = (annArm, exactArm) => {
    let recall = 0;
    let n = 0;
    for (const r of all) {
      const a = r.arms[annArm]?.topDocuments?.slice(0, 100);
      const e = r.arms[exactArm]?.topDocuments?.slice(0, 100);
      if (!a || !e || e.length === 0) continue;
      const set = new Set(a);
      recall += e.filter((x) => set.has(x)).length / e.length;
      n += 1;
    }
    return { recallAt100VsExact: n ? Number((recall / n).toFixed(4)) : null, tasksCompared: n };
  };

  const latency = (armName) => {
    const ms = all.map((r) => r.arms[armName]?.latencyMs).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    const busy = all.map((r) => r.arms[armName]?.concurrentQueries ?? 0);
    if (ms.length === 0) return null;
    return {
      p50: ms[Math.floor(ms.length * 0.5)],
      p95: ms[Math.floor(ms.length * 0.95)],
      maxConcurrentObserved: Math.max(...busy),
      // LOCAL_QUIET is a claim about the machine and it is measured, not asserted.
      localQuiet: Math.max(...busy) === 0,
    };
  };

  const ROUTE = (t) => t.routeReachable;
  const OVER = (t) => !t.routeReachable;
  const ALL = () => true;

  const report = { pooled: {}, routeReachable: {}, overRouteLimit: {}, composition: {}, annVsExact: {}, latency: {} };
  for (const arm of ARMS) {
    const mode = arm.filtered ? 'ARM_A' : 'BASE';
    for (const [pname, eligible] of [
      ['STRICT', GENERATION_EVIDENCE_STRICT],
      ['WITH_UNKNOWN', GENERATION_EVIDENCE_WITH_UNKNOWN],
    ]) {
      report.pooled[`${arm.name}/${mode}/${pname}`] = summarise(ALL, arm.name, mode, eligible);
      report.routeReachable[`${arm.name}/${mode}/${pname}`] = summarise(ROUTE, arm.name, mode, eligible);
      report.overRouteLimit[`${arm.name}/${mode}/${pname}`] = summarise(OVER, arm.name, mode, eligible);
    }
    report.composition[arm.name] = { at5: composition(arm.name, 5), at10: composition(arm.name, 10) };
    report.latency[arm.name] = latency(arm.name);
  }
  // No ARM_B rows. Not scored, not estimated, not inferred from ARM_A.
  report.annVsExact.ann_unfiltered = annVsExact('ann_unfiltered', 'exact_unfiltered');
  report.annVsExact.ann_iter_strict = annVsExact('ann_iter_strict', 'exact_filtered');
  report.annVsExact.ann_iter_relaxed = annVsExact('ann_iter_relaxed', 'exact_filtered');
  report.annVsExact.ann_naive_postfilter = annVsExact('ann_naive_postfilter', 'exact_filtered');

  const [{ idx }] = await sql`SELECT pg_relation_size('new1_tranche_passages_hnsw')::text AS idx`;
  const [{ rel }] = await sql`SELECT pg_total_relation_size('new1_tranche_passages')::text AS rel`;
  const [{ lab }] = await sql.unsafe(`SELECT pg_total_relation_size('${ROLE_TABLE}')::text AS lab`);

  const artifact = {
    artifact: 'NEW1_EVIDENCE_SAFE_METRICS',
    lane: 'NEW1',
    protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §8.5 §9 §12 N1-5',
    generatedAt: new Date().toISOString(),
    smoke: SMOKE !== null,
    index: { passages: passageCount, documents: indexed.size, efSearch: EF_PROD, depth: DEPTH },
    taskSet: {
      tasks: tasks.length,
      label: TASK_SET_LABEL,
      ruling: 'FIFTH bus 1355',
      note:
        'The 295 query texts are reconstructed from four COMMITTED, PUBLISHED artifacts and were ' +
        'used in R8.1. They are NOT a hidden holdout. Genuine Gold V3 DOES NOT EXIST, and no score ' +
        'in this artifact may be promoted to Gold V3 evidence or described as hidden. This is ' +
        'development and current-regression evidence.',
      sources: [
        'docs/ai/new2/ADVOCATE100.json',
        'docs/ai/new3-uncited-authority-gold-v2.json',
        'docs/ai/new3-noncitation-gold.json',
        'docs/ai/new3-semantic-expansion-gold-v2.json',
      ],
    },
    armB: { state: ARM_B_STATE, ruling: ARM_B_RULING },
    classifier: { version: CLASSIFIER_VERSION, parity, source: 'scripts/n2-role-census-widened.mts' },
    policies: {
      retrievalFilter: RETRIEVAL_FILTER,
      generationEvidence: { STRICT: GENERATION_EVIDENCE_STRICT, WITH_UNKNOWN: GENERATION_EVIDENCE_WITH_UNKNOWN },
      note:
        'These are NAMED PARAMETERS, not a frozen policy. §8.2 forbids inferring one permission from ' +
        'another and §12 N1-5 gates the freeze on NEW2/FIFTH. Nothing here concludes that any class ' +
        'may be stored, indexed, displayed or trained on.',
    },
    routeLimit: { chars: ROUTE_CHAR_LIMIT, note: 'over-limit tasks are a separate refusal family, never truncated and never pooled into a quality claim' },
    cost: { hnswIndexBytes: Number(idx), trancheRelationBytes: Number(rel), labelTableBytes: Number(lab) },
    partialIndexArm: {
      state: 'DESIGNED_NOT_RUN',
      reason:
        'A partial HNSW index needs its predicate on the indexed relation, so the role has to become a ' +
        'COLUMN of new1_tranche_passages. Setting it is an UPDATE of all 418,116 rows, and an UPDATE ' +
        're-inserts every row into every index on the table — including the 5.4 GiB HNSW index that the ' +
        'other five arms are measured against. The arm would bloat its own control. §9 marks it optional; ' +
        'it stays optional. Its only marginal value over ann_iter_* is latency, and ann_iter_* is the ' +
        'deployable shape either way.',
    },
    ...report,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 2));
  log('');
  log(`wrote ${OUT}`);

  // Console summary of the one comparison the freeze turns on.
  log('');
  log('JUDGMENT vs GENERATION-EVIDENCE, route-reachable, STRICT policy:');
  for (const key of Object.keys(report.routeReachable)) {
    if (!key.endsWith('/STRICT')) continue;
    const r = report.routeReachable[key];
    log(
      `  ${key.replace('/STRICT', '').padEnd(38)} s@5=${String(r['cond_s@5']).padEnd(6)} ` +
        `evidence@5=${String(r['cond_evidence_s@5']).padEnd(6)} gap=${r.evidenceGapAt5}`,
    );
  }
}

/**
 * Plan proof for the filtered arms. `an inlined EXPLAIN is not evidence`: a bind
 * parameter once changed a plan from cost 18.72 to 9,255,009 on this codebase, so
 * the EXPLAIN runs through the same parameterised path the arm uses, not through
 * a literal spliced into the string.
 */
async function explain() {
  const vec = `[${Array.from({ length: 1024 }, () => 0.01).join(',')}]`;
  for (const it of ['off', 'strict_order', 'relaxed_order']) {
    const plan = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL hnsw.ef_search = ${EF_PROD}`);
      await tx.unsafe(`SET LOCAL hnsw.iterative_scan = ${it}`);
      return tx.unsafe(
        `EXPLAIN (ANALYZE, BUFFERS, COSTS)
         SELECT p.judgment_id, 1 - (p.embedding <=> $1::vector) AS sim
           FROM new1_tranche_passages p
           JOIN ${ROLE_TABLE} r ON r.judgment_id = p.judgment_id AND r.chunk_index = p.chunk_index
          WHERE r.role = ANY($2::text[])
          ORDER BY p.embedding <=> $1::vector
          LIMIT ${DEPTH}`,
        [vec, RETRIEVAL_FILTER],
      );
    });
    log(`── iterative_scan = ${it} ──`);
    for (const line of plan) console.log('   ' + line['QUERY PLAN']);
  }
}

try {
  if (has('--arm-b')) {
    console.error(ARM_B_RULING);
    process.exitCode = 2;
  } else if (has('--explain')) await explain();
  else await main();
} catch (e) {
  console.error(`FAILED  ${e.message}`);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  process.exitCode = 1;
} finally {
  await sql.end();
}
