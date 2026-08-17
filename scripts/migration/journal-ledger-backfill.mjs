#!/usr/bin/env node
/**
 * Reconcile `drizzle.__drizzle_migrations` with migrations that were applied by
 * hand — WITHOUT re-running any of their DDL.
 *
 * LCC, 17 Aug 2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE THIS EXISTS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Local Gold is a `pg_restore` of Railway, and `drizzle.__drizzle_migrations`
 * came back from that restore **with zero rows** — Railway's schema was itself
 * built by hand, so there was never a ledger to copy. The table exists and is
 * empty, which is indistinguishable, to the migrator, from a brand-new database.
 *
 * That is not a cosmetic problem. Running `migrate` against Gold in that state
 * would replay all 54 migrations from `0000`, and `0036`/`0037` create enum
 * types with a bare `CREATE TYPE` — no `IF NOT EXISTS` exists for it in
 * PostgreSQL. The run would abort partway, having taken locks on a 65 GB table
 * to do it. So the ledger has to be told the truth before the migrator is ever
 * pointed at this database.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE MIGRATOR ACTUALLY CHECKS — and why `--through` is a high-water mark
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Read from `drizzle-orm/pg-core/dialect.js`, not assumed. The migrator selects
 * exactly ONE row — `order by created_at desc limit 1` — and applies every
 * journal entry whose `when` is greater than it. There is no per-migration
 * lookup and the `hash` column is never compared.
 *
 * Two consequences that shape this script:
 *
 *   1. A single row with the right `created_at` is enough to make the migrator
 *      skip everything below it. Every row below is therefore RECORD-KEEPING —
 *      written anyway, because a ledger that only a machine can read is how the
 *      last one drifted unnoticed for a week.
 *   2. **A gap below the high-water mark can never be filled.** If `0033` is
 *      unapplied and the mark is set at `0051`, `0033` is stranded permanently
 *      and silently. So this script REFUSES to run unless every migration it is
 *      about to mark is one the caller has verified — see `--verified-through`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SCRIPT ASSERTS SOMETHING IT CANNOT PROVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Writing a ledger row means "this migration is already applied". Nothing here
 * can confirm that — only a schema diff can, which is
 * `journal-replay-check.mjs`'s job. The two are meant to be run together:
 * replay-check tells you what Gold is missing, this marks what Gold has, and
 * the honest sequence is replay-check FIRST.
 *
 * The `--verified-through` flag is that handshake made explicit. It must name
 * the same tag as `--through`, and it exists so that marking 54 migrations
 * applied cannot be done by a flag someone copied without reading this.
 *
 *   node scripts/migration/journal-ledger-backfill.mjs --verify
 *   node scripts/migration/journal-ledger-backfill.mjs --through 0051_enrichment_legal_object_tasks --verified-through 0051_enrichment_legal_object_tasks
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRIZZLE_DIR = join(ROOT, 'packages', 'db', 'drizzle');

const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const verifyOnly = argv.includes('--verify');
const through = arg('--through');
const verifiedThrough = arg('--verified-through');

function goldUrl() {
  const env = fs.readFileSync(join(ROOT, '.env'), 'utf8');
  const url = (/^LOCAL_DATABASE_URL=(.+)$/m.exec(env) ?? [])[1]?.trim();
  if (!url) throw new Error('LOCAL_DATABASE_URL is not set in .env');
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`refusing a non-loopback target: ${host}`);
  }
  return url;
}

/**
 * Byte-for-byte what `drizzle-orm/migrator.js` does: sha256 over the RAW file
 * contents, no normalisation, no statement splitting. Reimplemented rather than
 * imported because the export is internal — so it is pinned here by a test in
 * `packages/db/src/migrate.test.ts` instead of by hope.
 */
function hashOf(tag) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(join(DRIZZLE_DIR, `${tag}.sql`)))
    .digest('hex');
}

const journal = JSON.parse(fs.readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'));

async function main() {
  const sql = postgres(goldUrl(), { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle');
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);

    const existing = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
    const haveHash = new Set(existing.map((r) => r.hash));
    const highWater = existing.reduce((m, r) => Math.max(m, Number(r.created_at)), -1);

    if (verifyOnly) {
      console.log(`ledger rows: ${existing.length}`);
      console.log(`high-water created_at: ${highWater === -1 ? '(none)' : highWater}`);
      console.log(
        '\ntag                                     when            in ledger  would apply',
      );
      for (const e of journal.entries) {
        const marked = haveHash.has(hashOf(e.tag));
        const wouldApply = e.when > highWater;
        console.log(
          `${e.tag.padEnd(39)} ${String(e.when).padEnd(15)} ${marked ? 'yes      ' : 'NO       '}  ${wouldApply ? 'YES' : 'no'}`,
        );
      }
      return;
    }

    if (!through) throw new Error('pass --through <tag> (or --verify)');
    if (verifiedThrough !== through) {
      throw new Error(
        `--verified-through must repeat --through exactly.\n` +
          `Writing a ledger row asserts the migration is ALREADY APPLIED, and a gap left\n` +
          `below the high-water mark is stranded permanently and silently. Confirm with\n` +
          `scripts/migration/journal-replay-check.mjs first, then repeat the tag.`,
      );
    }
    const cut = journal.entries.findIndex((e) => e.tag === through);
    if (cut === -1) throw new Error(`no journal entry named ${through}`);

    const inserted = [];
    for (const e of journal.entries.slice(0, cut + 1)) {
      const hash = hashOf(e.tag);
      if (haveHash.has(hash)) continue;
      await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${e.when})`;
      inserted.push(e.tag);
    }

    console.log(
      `ledger: ${inserted.length} row(s) written, high-water now ${journal.entries[cut].when} (${through})`,
    );
    const remaining = journal.entries.slice(cut + 1);
    console.log(
      remaining.length === 0
        ? 'migrate would now apply: nothing'
        : `migrate would now apply: ${remaining.map((e) => e.tag).join(', ')}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
