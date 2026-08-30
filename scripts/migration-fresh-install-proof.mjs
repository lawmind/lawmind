#!/usr/bin/env node
/**
 * FRESH-INSTALL PROOF — can an empty database reach the schema we actually run on?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT ALREADY COVERED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ci:local` has run `migrate` twice against a scratch database for weeks — once
 * to prove migrations apply to an empty database, once to prove a re-run is a
 * no-op. Both pass. Neither asks the question that matters for a release:
 *
 *     is the schema they produce THE SAME as the schema production runs on?
 *
 * A fresh migrate can be perfectly self-consistent and still land somewhere else
 * entirely, because the live database was not built only by `migrate`. Measured
 * 25 Aug 2026: `drizzle.__drizzle_migrations` holds **58 rows** against **87**
 * journal entries, and the manifest attributes **28** migrations as
 * APPLIED_UNRECORDED — applied by executing SQL directly. Anything applied by
 * hand that was never written down as a migration exists ONLY on this box, and a
 * restore would silently come up without it.
 *
 * That is the release risk in one sentence: **the rehearsal's own acceptance is
 * "restore, then prove exact search equivalence", and a restore that produces a
 * different schema fails that test in a way that looks like a data problem.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. CREATE DATABASE <scratch>
 *   2. run the OFFICIAL migrate path against it — the same entrypoint a fresh
 *      install or a restore would use, not a hand-rolled apply loop
 *   3. fingerprint both schemas from the catalogues: tables, columns and their
 *      types, indexes and their definitions, constraints, enums and their
 *      labels, views, functions, extensions
 *   4. diff, and report every divergence by name
 *   5. DROP DATABASE <scratch>
 *
 * The live database is opened **read-only in intent**: nothing here writes to it,
 * and every write goes to the scratch database whose name this script chose. It
 * refuses to drop any database whose name it did not generate.
 *
 * Usage:
 *   node scripts/migration-fresh-install-proof.mjs
 *   node scripts/migration-fresh-install-proof.mjs --keep      leave the scratch DB
 *   node scripts/migration-fresh-install-proof.mjs --out <path>
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = `lawmind_freshinstall_probe_${process.pid}`;

const argv = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i === -1 || !argv[i + 1] ? fallback : argv[i + 1];
}

function liveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  const m = readFileSync(join(REPO, '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('no DATABASE_URL');
  return m[1].trim();
}

/**
 * The schema, reduced to something two databases can be compared on.
 *
 * Everything ordered, and everything that carries an OID or a size left out. An
 * OID differs between any two databases and would make every comparison fail;
 * a size differs because one holds 18.7 million judgments and the other holds
 * none, which is the intended difference, not a defect.
 */
async function fingerprint(sql) {
  const out = {};

  out.extensions = (await sql`SELECT extname FROM pg_extension ORDER BY extname`).map(
    (r) => r.extname,
  );

  out.columns = (
    await sql`
      SELECT c.table_name, c.column_name, c.data_type, c.udt_name,
             c.is_nullable, c.column_default, c.is_generated, c.generation_expression
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.column_name`
  ).map(
    (r) =>
      `${r.table_name}.${r.column_name} :: ${r.udt_name} ${r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}` +
      `${r.column_default ? ' DEFAULT ' + String(r.column_default).replace(/\s+/g, ' ') : ''}` +
      `${r.is_generated === 'ALWAYS' ? ' GENERATED ' + String(r.generation_expression).replace(/\s+/g, ' ') : ''}`,
  );

  out.tables = (
    await sql`SELECT c.relname, c.relkind FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
        ORDER BY c.relname`
  ).map((r) => `${r.relkind}:${r.relname}`);

  // `indexdef` rather than the name alone: two databases can both have an index
  // called `judgments_court_idx` over different columns, and a name-only
  // comparison would call that equivalent.
  out.indexes = (
    await sql`SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' ORDER BY indexname`
  ).map((r) => `${r.indexname} = ${String(r.indexdef).replace(/\s+/g, ' ')}`);

  out.invalid_indexes = (
    await sql`SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE n.nspname = 'public' AND (i.indisvalid = false OR i.indisready = false)
        ORDER BY c.relname`
  ).map((r) => r.relname);

  out.constraints = (
    await sql`SELECT con.conname, pg_get_constraintdef(con.oid) AS def
        FROM pg_constraint con
        JOIN pg_namespace n ON n.oid = con.connamespace
        WHERE n.nspname = 'public' ORDER BY con.conname`
  ).map((r) => `${r.conname} = ${String(r.def).replace(/\s+/g, ' ')}`);

  out.enums = (
    await sql`SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname`
  ).map((r) => `${r.typname} = ${r.labels}`);

  out.views = (
    await sql`SELECT c.relname, pg_get_viewdef(c.oid) AS def FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('v','m') ORDER BY c.relname`
  ).map((r) => `${r.relname} = ${String(r.def).replace(/\s+/g, ' ').trim()}`);

  out.functions = (
    await sql`SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' ORDER BY p.proname, args`
  ).map((r) => `${r.proname}(${r.args})`);

  return out;
}

/**
 * Lane scratch is not product schema, and conflating the two makes this test
 * unpassable.
 *
 * NEW1 and NEW2 create working tables directly — `new1_doc_vector_stage`,
 * `new1_probe_fp32_250k`, `new2_neutral_dupe_groups` and so on. They are
 * experiment surface, they were never migrations, and they SHOULD be absent from
 * a fresh install. Counting them as divergence buries the two findings that
 * matter under 100 that do not, and a check that always fails is a check nobody
 * runs.
 *
 * They are still reported — separately, under `lane_scratch` — because "absent
 * from a restore" is exactly right for a scratch table and exactly wrong for the
 * corpus, and a release rehearsal needs to know which of the two it is looking at.
 */
const LANE_SCRATCH = /\b(new1|new2|new3)_/i;

/**
 * NAMED lab objects, because the prefix rule above is a convention and a
 * convention is not a declaration.
 *
 * `n1_lab_passage_role` is NEW1's role-classification experiment surface. It
 * carries the `n1_` prefix rather than `new1_`, so `LANE_SCRATCH` never matched
 * it, and its 14 objects — 1 table, 5 columns, 2 indexes, 6 constraints — were
 * the ENTIRE difference in the fresh-install verdict from 26 to 27 Aug 2026
 * (FIFTH bus 1363/1364, blocker D of bus 1386).
 *
 * Widening the prefix to `n[123]_` was the obvious fix and is the wrong one: it
 * is a regex over strings like `some_table.n1_column`, so it would silently
 * exempt any future product column whose name happened to start that way, and
 * an exemption nobody can enumerate is how a real table goes missing from a
 * restore. This list is enumerable. Adding to it is a review.
 *
 * The claim each entry makes is NOT "it is a lab table" — it is **"nothing in
 * the product reads it, so a restore that lacks it is complete."** For
 * `n1_lab_passage_role` on 27 Aug 2026 that was checked rather than asserted:
 * the only references anywhere in the tree are
 * `services/harness/src/n1-role-materialise-cli.mjs` (the writer) and
 * `services/harness/src/n1-evidence-safe-cli.mjs` (the lab reader). Zero in
 * `services/api`, zero in `packages/db`, zero in `apps`. If that ever stops
 * being true the entry must come out, and the object must become a migration.
 */
const DECLARED_LAB_OBJECTS = [
  {
    table: 'n1_lab_passage_role',
    owner: 'NEW1',
    declared: '2026-08-27',
    why: 'role-classification lab surface; readers are services/harness only, zero production readers',
  },
];

/**
 * An object BELONGS to a declared lab table when the identifier it is named
 * after is that table. Anchored at the start of the signature, so
 * `judgments.n1_lab_passage_role_id` — a product column that merely mentions the
 * name — is NOT exempt.
 */
function isDeclaredLabObject(signature) {
  return DECLARED_LAB_OBJECTS.some(({ table }) => {
    const s = signature.startsWith('r:') ? signature.slice(2) : signature;
    return s === table || s.startsWith(`${table}.`) || s.startsWith(`${table}_`);
  });
}

/**
 * THE FACTORY SCHEMA, WHICH IS A THIRD CATEGORY AND NOT SCRATCH.
 *
 * `packages/db/factory/` is committed, journalled and sha-pinned, and it has
 * its own fresh-install proof (`snapshot-identity.test.mjs`, which builds every
 * object below on a disposable database from the committed file alone). It is
 * deliberately NOT in `packages/db/drizzle`, because that journal is applied to
 * the remote serving plane and roadmap v7.1 section 7 excludes dense vectors
 * from it -- a product migration would push a vector(1024) staging table to
 * production that nothing there reads and `vectorExportRefusal()` refuses to
 * export.
 *
 * So these objects are correctly absent from a product fresh install, and this
 * proof must say so rather than reporting DIVERGENT. Without the declaration it
 * read 52 differences on 30 Aug 2026 and looked exactly like a broken product
 * schema.
 *
 * The claim each entry makes is the same one the lab list makes: **nothing in
 * the product reads it, so a restore that lacks it is complete.** Checked on
 * 30 Aug 2026 rather than asserted -- `embedding_snapshot`,
 * `embedding_snapshot_policy`, `factory_schema_journal`,
 * `snapshot_index_predicate` and `new1_doc_vector_stage_identity` appear ZERO
 * times in `services/api/src`, `packages/db/src` and `apps`, apart from one
 * prose comment in a test. If that stops being true the entry comes out and the
 * object becomes a product migration.
 *
 * Enumerated, never a prefix regex, for the reason the lab list already gives:
 * an exemption nobody can enumerate is how a real table goes missing from a
 * restore.
 */
const DECLARED_FACTORY_SCHEMA = [
  { name: 'embedding_snapshot', owner: 'LCC', declared: '2026-08-30', why: 'REPRO_DEBT_1 generation registry; packages/db/factory/0001' },
  { name: 'embedding_snapshot_policy', owner: 'LCC', declared: '2026-08-30', why: 'identity strictness rollout switch; packages/db/factory/0001' },
  { name: 'factory_schema_journal', owner: 'LCC', declared: '2026-08-30', why: 'the factory applier journal, the factory equivalent of drizzle.__drizzle_migrations' },
  { name: 'embedding_snapshot_immutable', owner: 'LCC', declared: '2026-08-30', why: 'registry immutability trigger function' },
  { name: 'new1_doc_vector_stage_bind_snapshot', owner: 'LCC', declared: '2026-08-30', why: 'identity binding trigger function' },
  { name: 'new1_doc_vector_stage_freeze_snapshot', owner: 'LCC', declared: '2026-08-30', why: 'relabel refusal trigger function' },
  { name: 'snapshot_index_predicate', owner: 'LCC', declared: '2026-08-30', why: 'deterministic HNSW population predicate' },
  { name: 'new1_doc_vector_stage_identity', owner: 'LCC', declared: '2026-08-30', why: 'view naming the legacy residual class' },
];

/**
 * Matches a table, its columns, indexes and constraints, and a function by its
 * signature. Anchored at the start, so a product column that merely MENTIONS a
 * factory name is not exempt.
 */
function isDeclaredFactoryObject(signature) {
  const s = signature.startsWith('r:') ? signature.slice(2) : signature;
  return DECLARED_FACTORY_SCHEMA.some(
    ({ name }) => s === name || s.startsWith(`${name}.`) || s.startsWith(`${name}_`) || s.startsWith(`${name}(`),
  );
}

const isNonProduct = (x) =>
  LANE_SCRATCH.test(x) || isDeclaredLabObject(x) || isDeclaredFactoryObject(x);

function diff(liveArr, freshArr) {
  const live = new Set(liveArr);
  const fresh = new Set(freshArr);
  const onlyLive = liveArr.filter((x) => !fresh.has(x));
  const onlyFresh = freshArr.filter((x) => !live.has(x));
  return {
    only_in_live: onlyLive.filter((x) => !isNonProduct(x)),
    only_in_fresh: onlyFresh.filter((x) => !isNonProduct(x)),
    lane_scratch_only_in_live: onlyLive.filter(isNonProduct),
    lane_scratch_only_in_fresh: onlyFresh.filter(isNonProduct),
  };
}

async function main() {
  const url = liveUrl();
  const admin = new URL(url);
  const scratchUrl = (() => {
    const u = new URL(url);
    u.pathname = '/' + SCRATCH;
    return u.toString();
  })();

  const { default: postgres } = await import(
    '../services/ingest/node_modules/postgres/src/index.js'
  );

  const adminConn = postgres(
    (() => {
      const u = new URL(url);
      u.pathname = '/postgres';
      return u.toString();
    })(),
    { max: 1, onnotice: () => {} },
  );

  let created = false;
  let report = null;
  try {
    console.log(`creating scratch database ${SCRATCH} on ${admin.host}`);
    await adminConn.unsafe(`CREATE DATABASE ${SCRATCH}`);
    created = true;

    console.log('running the OFFICIAL migrate path against it...');
    const started = Date.now();
    let migrateOut;
    try {
      migrateOut = execFileSync('pnpm', ['--filter', '@lawmind/db', 'migrate'], {
        cwd: REPO,
        encoding: 'utf8',
        timeout: 15 * 60 * 1000,
        env: { ...process.env, DATABASE_URL: scratchUrl },
        shell: process.platform === 'win32',
      });
    } catch (err) {
      console.error('MIGRATE FAILED on an empty database — a fresh install cannot be built.');
      console.error(String(err.stdout ?? '') + String(err.stderr ?? ''));
      process.exitCode = 1;
      return;
    }
    const migrateMs = Date.now() - started;
    console.log(migrateOut.trim().split('\n').slice(-2).join('\n'));
    console.log(`migrate completed in ${(migrateMs / 1000).toFixed(1)}s`);

    console.log('re-running migrate to prove it is a no-op...');
    const second = Date.now();
    execFileSync('pnpm', ['--filter', '@lawmind/db', 'migrate'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
      env: { ...process.env, DATABASE_URL: scratchUrl },
      shell: process.platform === 'win32',
    });
    const secondMs = Date.now() - second;

    const freshConn = postgres(scratchUrl, { max: 1, onnotice: () => {} });
    const liveConn = postgres(url, { max: 1, onnotice: () => {} });
    let fresh;
    let live;
    let bookkeeping;
    try {
      fresh = await fingerprint(freshConn);
      live = await fingerprint(liveConn);
      bookkeeping = {
        fresh: Number(
          (await freshConn`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0].n,
        ),
        live: Number(
          (await liveConn`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0].n,
        ),
      };
    } finally {
      await freshConn.end({ timeout: 5 });
      await liveConn.end({ timeout: 5 });
    }

    const diffs = {};
    let divergences = 0;
    let laneScratch = 0;
    for (const key of Object.keys(live)) {
      const d = diff(live[key], fresh[key]);
      laneScratch += d.lane_scratch_only_in_live.length + d.lane_scratch_only_in_fresh.length;
      if (
        d.only_in_live.length ||
        d.only_in_fresh.length ||
        d.lane_scratch_only_in_live.length ||
        d.lane_scratch_only_in_fresh.length
      ) {
        diffs[key] = d;
        divergences += d.only_in_live.length + d.only_in_fresh.length;
      }
    }

    report = {
      generated_at: new Date().toISOString(),
      live_database: url.replace(/:[^:@]*@/, ':***@'),
      scratch_database: SCRATCH,
      migrate_seconds: Number((migrateMs / 1000).toFixed(1)),
      migrate_rerun_seconds: Number((secondMs / 1000).toFixed(1)),
      bookkeeping_rows: bookkeeping,
      totals: Object.fromEntries(
        Object.keys(live).map((k) => [k, { live: live[k].length, fresh: fresh[k].length }]),
      ),
      divergences,
      lane_scratch_objects: laneScratch,
      verdict: divergences === 0 ? 'EQUIVALENT' : 'DIVERGENT',
      diffs,
    };

    const out = argOf('out');
    if (out) writeFileSync(resolve(REPO, out), JSON.stringify(report, null, 2) + '\n');

    console.log('');
    console.log('SCHEMA COMPARISON  fresh-install  vs  live');
    console.log('-'.repeat(78));
    for (const [k, v] of Object.entries(report.totals)) {
      const d = diffs[k];
      const mark = d
        ? `  <-- ${d.only_in_live.length} only live, ${d.only_in_fresh.length} only fresh` +
          (d.lane_scratch_only_in_live.length
            ? ` (+${d.lane_scratch_only_in_live.length} lane scratch, expected)`
            : '')
        : '';
      console.log(`  ${k.padEnd(18)} live ${String(v.live).padStart(6)}   fresh ${String(v.fresh).padStart(6)}${mark}`);
    }
    console.log('');
    console.log(
      `  drizzle bookkeeping rows: live ${bookkeeping.live}, fresh ${bookkeeping.fresh}` +
        (bookkeeping.fresh !== bookkeeping.live
          ? '   <-- a fresh install records every migration it ran; the live one does not'
          : ''),
    );
    console.log('');

    for (const [k, d] of Object.entries(diffs)) {
      console.log(`## ${k}`);
      if (d.only_in_live.length) {
        console.log(`   IN LIVE ONLY (${d.only_in_live.length}) — a restore would NOT have these:`);
        for (const x of d.only_in_live.slice(0, 40)) console.log(`     - ${x.slice(0, 150)}`);
        if (d.only_in_live.length > 40) console.log(`     ... ${d.only_in_live.length - 40} more`);
      }
      if (d.only_in_fresh.length) {
        console.log(`   IN FRESH ONLY (${d.only_in_fresh.length}) — the journal builds these and live lacks them:`);
        for (const x of d.only_in_fresh.slice(0, 40)) console.log(`     + ${x.slice(0, 150)}`);
        if (d.only_in_fresh.length > 40) console.log(`     ... ${d.only_in_fresh.length - 40} more`);
      }
      const scratch = d.lane_scratch_only_in_live.length + d.lane_scratch_only_in_fresh.length;
      if (scratch) {
        console.log(
          `   lane scratch, not product schema (${scratch}) — correctly absent from a fresh install`,
        );
      }
      console.log('');
    }

    console.log(
      report.verdict === 'EQUIVALENT'
        ? `VERDICT: EQUIVALENT — an empty database reaches the live PRODUCT schema from the journal
alone. ${laneScratch} lane-scratch object(s) exist only on the live box; they were never
migrations and are correctly absent from a fresh install.`
        : `VERDICT: DIVERGENT — ${divergences} difference(s). A restore built from the journal would NOT match production.`,
    );
    if (report.verdict !== 'EQUIVALENT') process.exitCode = 1;
  } finally {
    if (created && !argv.includes('--keep')) {
      // Refuse to drop anything whose name this process did not generate.
      if (!/^lawmind_freshinstall_probe_\d+$/.test(SCRATCH)) {
        console.error(`REFUSING to drop "${SCRATCH}" — not a name this script generated`);
      } else {
        await adminConn.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${SCRATCH}'`,
        );
        await adminConn.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH}`);
        console.log(`\nscratch database ${SCRATCH} dropped`);
      }
    } else if (created) {
      console.log(`\nscratch database ${SCRATCH} KEPT (--keep)`);
    }
    await adminConn.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
