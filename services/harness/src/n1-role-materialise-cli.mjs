#!/usr/bin/env node
/**
 * NEW1 — R8.3 §9 / §12 N1-4. Materialise the §8 role label for every passage in
 * the frozen 418,116-passage tranche, so that a role predicate can live inside
 * the SQL pgvector plans.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §9 requires four comparisons, and three of them need the filter in the
 * database:
 *
 *   1. exact filtered reference        WHERE role = ANY(...) with no index scan
 *   2. current ANN baseline            no filter
 *   3. filtered ANN, iterative scan    WHERE role = ANY(...) inside the plan
 *   4. optional lab-only partial index WHERE on the indexed table itself
 *
 * The role does not exist in the database. It is produced by a regex classifier
 * that NEW2 runs in script memory against the top-k it just fetched. That is
 * enough to CENSUS what retrieval returned; it cannot FILTER what retrieval
 * considers, because by the time the classifier sees a passage the ANN scan has
 * already finished.
 *
 * So the label has to be materialised first, and this is the job that does it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A LAB TABLE AND NOT A COLUMN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `new1_tranche_passages` is the artifact whose content hash is recorded in
 * `PASSAGE_100K_METRICS.json` and which FIFTH may re-hash. A side table leaves
 * it byte-identical. §9 arm 4 needs a real column on the indexed relation to
 * build a partial index, so THAT arm — and only that arm — adds one, behind its
 * own flag, and says so in the artifact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE TRAPS THIS JOB IS BUILT AGAINST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **A watermark cannot see rows below it.** The walk is keyset over the PK
 *   `(judgment_id, chunk_index)`, and `judgment_id` is a random uuid. That is
 *   only safe because the tranche is FROZEN this round, so the job asserts the
 *   source count at start AND at end and fails if it moved. A keyset walk over a
 *   growing table with random keys silently exits clean having missed the middle.
 * - **Completion is not a success signal.** The durable metric is
 *   `count(*) FROM n1_lab_passage_role`, checked at every window. A job that
 *   "completes" with the counter flat did nothing.
 * - **A stale checkpoint indexes into a plan that changed.** Resume reads the
 *   frontier FROM THE OUTPUT TABLE, never from a saved cursor file, so there is
 *   no cursor that can disagree with reality.
 *
 * Read-only against the corpus. Writes exactly one lab table.
 *
 * Usage:
 *   node services/harness/src/n1-role-materialise-cli.mjs --create
 *   node services/harness/src/n1-role-materialise-cli.mjs --sample 2000
 *   node services/harness/src/n1-role-materialise-cli.mjs --run
 *   node services/harness/src/n1-role-materialise-cli.mjs --status
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import {
  CLASSIFIER_VERSION,
  ROLES,
  assertClassifierParity,
  classify,
  spanOkFor,
} from './n1-role-policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const P = (p) => join(ROOT, p);

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BATCH = Number(val('--batch', 2000));
/**
 * Stop after N newly written rows. For the smoke only: a bounded prefix lets the
 * experiment harness be proved end to end before the box is free. Resume reads
 * the frontier from the output table, so a prefix is not wasted work — the real
 * run continues from where it stopped.
 */
const MAX = has('--max') ? Number(val('--max', 0)) : Infinity;
/** §3.3: durable progress at least every 15 minutes. */
const REPORT_MS = Number(val('--report-ms', 15 * 60 * 1000));
const TABLE = 'n1_lab_passage_role';
const SOURCE = 'new1_tranche_passages';

const url =
  process.env.DATABASE_URL ??
  readFileSync(P('.env'), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const log = (s) => console.log(`${new Date().toISOString()}  ${s}`);

const sql = postgres(url, { max: 1, idle_timeout: 60, connect_timeout: 30 });

async function sourceCount() {
  const [{ n }] = await sql`SELECT count(*)::text AS n FROM new1_tranche_passages`;
  return Number(n);
}

async function durableCount() {
  const reg = await sql`SELECT to_regclass(${TABLE}) IS NOT NULL AS ok`;
  if (!reg[0].ok) return null;
  const [{ n }] = await sql.unsafe(`SELECT count(*)::text AS n FROM ${TABLE}`);
  return Number(n);
}

async function create() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      judgment_id        uuid    NOT NULL,
      chunk_index        integer NOT NULL,
      role               text    NOT NULL,
      span_ok            boolean NOT NULL,
      classifier_version text    NOT NULL,
      PRIMARY KEY (judgment_id, chunk_index)
    )`);
  // The filtered arms select on role, and the exact-filtered reference reads the
  // whole eligible set. Both want this.
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS ${TABLE}_role ON ${TABLE} (role)`);
  log(`${TABLE} ready`);
}

/**
 * A no-write validation pass. Proves the slice/span/classify path works and
 * reports the role distribution on a bounded modulus sample, without touching
 * the box for a full walk. `LIMIT` is deliberately NOT used to draw the sample —
 * NEW2 lost two numbers to `LIMIT`-after-`WHERE`, which returns the first N rows
 * the planner reaches in physical order, and this table is clustered by
 * judgment_id.
 */
async function sample(n) {
  const parity = assertClassifierParity(ROOT);
  log(`classifier parity OK  ${parity}`);
  const total = await sourceCount();
  const modulus = Math.max(1, Math.floor(total / n));
  log(`sampling every ${modulus}th passage of ${total.toLocaleString()} by hash — no LIMIT`);
  const rows = await sql.unsafe(
    `SELECT p.judgment_id::text AS id, p.chunk_index, p.body_length,
            substr(j.full_text, p.char_offset + 1, p.body_length) AS slice
       FROM ${SOURCE} p
       JOIN judgments j ON j.id = p.judgment_id
      WHERE ('x' || substr(md5(p.judgment_id::text || ':' || p.chunk_index), 1, 8))::bit(32)::bigint % ${modulus} = 0`,
  );
  const counts = Object.create(null);
  for (const r of rows) {
    const ok = spanOkFor(r.slice, r.body_length);
    const role = classify(r.slice ?? '', ok);
    counts[role] = (counts[role] ?? 0) + 1;
  }
  log(`classified ${rows.length.toLocaleString()} sampled passages`);
  for (const role of ROLES) {
    const c = counts[role] ?? 0;
    if (c === 0) continue;
    log(`  ${role.padEnd(24)} ${String(c).padStart(6)}  ${((c / rows.length) * 100).toFixed(2)}%`);
  }
  return { sampled: rows.length, counts };
}

async function run() {
  const parity = assertClassifierParity(ROOT);
  log(`classifier parity OK  ${parity}`);
  await create();

  const before = await sourceCount();
  log(`source ${SOURCE} holds ${before.toLocaleString()} passages`);

  // Resume frontier read FROM THE OUTPUT, never from a cursor file.
  const [frontier] = await sql.unsafe(
    `SELECT judgment_id::text AS id, chunk_index FROM ${TABLE}
      ORDER BY judgment_id DESC, chunk_index DESC LIMIT 1`,
  );
  let lastId = frontier?.id ?? null;
  let lastChunk = frontier?.chunk_index ?? null;
  let written = (await durableCount()) ?? 0;
  const startedWith = written;
  log(
    frontier
      ? `resuming after (${lastId}, ${lastChunk}); ${written.toLocaleString()} rows already durable`
      : 'starting from the beginning; output table is empty',
  );

  let lastReport = Date.now();
  let lastReported = written;
  const t0 = Date.now();

  for (;;) {
    const page = lastId === null
      ? await sql.unsafe(
          `SELECT p.judgment_id::text AS id, p.chunk_index, p.body_length,
                  substr(j.full_text, p.char_offset + 1, p.body_length) AS slice
             FROM ${SOURCE} p JOIN judgments j ON j.id = p.judgment_id
            ORDER BY p.judgment_id, p.chunk_index LIMIT ${BATCH}`,
        )
      : await sql.unsafe(
          `SELECT p.judgment_id::text AS id, p.chunk_index, p.body_length,
                  substr(j.full_text, p.char_offset + 1, p.body_length) AS slice
             FROM ${SOURCE} p JOIN judgments j ON j.id = p.judgment_id
            WHERE (p.judgment_id, p.chunk_index) > ($1::uuid, $2::int)
            ORDER BY p.judgment_id, p.chunk_index LIMIT ${BATCH}`,
          [lastId, lastChunk],
        );
    if (page.length === 0) break;

    const values = page.map((r) => {
      const ok = spanOkFor(r.slice, r.body_length);
      return {
        judgment_id: r.id,
        chunk_index: r.chunk_index,
        role: classify(r.slice ?? '', ok),
        span_ok: ok,
        classifier_version: CLASSIFIER_VERSION,
      };
    });
    // postgres.js's bulk-insert helper rather than five parallel `unnest`
    // arrays: passing a boolean[] through `unsafe` params gets inferred as a
    // scalar boolean and the `::bool[]` cast fails. The helper types each column
    // from the table itself.
    await sql`
      INSERT INTO n1_lab_passage_role ${sql(values, 'judgment_id', 'chunk_index', 'role', 'span_ok', 'classifier_version')}
      ON CONFLICT (judgment_id, chunk_index) DO NOTHING`;
    written += page.length;
    lastId = page[page.length - 1].id;
    lastChunk = page[page.length - 1].chunk_index;

    if (Date.now() - lastReport >= REPORT_MS) {
      // The durable metric, re-read from the table. Not the loop counter — a
      // loop counter advances whether or not anything landed.
      const durable = await durableCount();
      const delta = durable - lastReported;
      log(
        `PROGRESS durable=${durable.toLocaleString()}/${before.toLocaleString()} ` +
          `delta=${delta.toLocaleString()} in ${((Date.now() - lastReport) / 60000).toFixed(1)}m ` +
          `frontier=(${lastId},${lastChunk})` +
          (delta === 0 ? '  <- ZERO DELTA: investigate as STALLED, not RUNNING' : ''),
      );
      lastReport = Date.now();
      lastReported = durable;
    }
    if (written - startedWith >= MAX) {
      log(`--max ${MAX} reached at frontier (${lastId},${lastChunk}); stopping. This is a PREFIX, not a complete label set.`);
      const durable = await durableCount();
      log(`durable ${durable.toLocaleString()} of ${before.toLocaleString()} — resume continues from the output table`);
      return;
    }
  }

  const after = await sourceCount();
  const durable = await durableCount();
  log('');
  log('MATERIALISE COMPLETE');
  log(`  source before / after   ${before.toLocaleString()} / ${after.toLocaleString()}`);
  log(`  durable rows            ${durable.toLocaleString()}  (was ${startedWith.toLocaleString()})`);
  log(`  elapsed                 ${((Date.now() - t0) / 60000).toFixed(1)}m`);

  // The keyset walk is only valid over a frozen source. If it moved, the walk
  // may have skipped rows that sorted below a frontier it had already passed.
  if (after !== before) {
    throw new Error(
      `source moved during the walk: ${before} -> ${after}. A keyset walk over random uuids ` +
        `cannot see a row inserted below the frontier. This result is NOT usable; re-run against a frozen tranche.`,
    );
  }
  if (durable !== after) {
    throw new Error(
      `durable ${durable} != source ${after}. The label set does not cover the tranche, so any ` +
        `filtered arm scored against it would silently drop passages that have no row here.`,
    );
  }
  const dist = await sql.unsafe(
    `SELECT role, count(*)::text AS n FROM ${TABLE} GROUP BY role ORDER BY count(*) DESC`,
  );
  log('');
  log('ROLE DISTRIBUTION over the whole tranche (this is the POOL, measured not sampled):');
  for (const r of dist) {
    log(`  ${r.role.padEnd(24)} ${Number(r.n).toLocaleString().padStart(9)}  ${((Number(r.n) / durable) * 100).toFixed(2)}%`);
  }
}

async function status() {
  const src = await sourceCount();
  const dur = await durableCount();
  log(`source ${src.toLocaleString()}   durable ${dur === null ? 'TABLE ABSENT' : dur.toLocaleString()}`);
  if (dur !== null && dur > 0) {
    const dist = await sql.unsafe(
      `SELECT role, count(*)::text AS n FROM ${TABLE} GROUP BY role ORDER BY count(*) DESC`,
    );
    for (const r of dist) log(`  ${r.role.padEnd(24)} ${Number(r.n).toLocaleString().padStart(9)}`);
  }
}

try {
  if (has('--create')) await create();
  else if (has('--sample')) await sample(Number(val('--sample', 2000)));
  else if (has('--run')) await run();
  else if (has('--status')) await status();
  else {
    console.log('usage: n1-role-materialise-cli.mjs <--create|--sample N|--run|--status> [--batch N] [--report-ms N]');
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`FAILED  ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
