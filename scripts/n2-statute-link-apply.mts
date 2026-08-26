/**
 * NEW2 — R8.1 §7.2 apply the deterministic statute link.
 *
 * Separate file from the plan on purpose: a plan must not be able to become a
 * backfill by a flag typo. This script reads `statute-link-set.json` and writes
 * nothing that is not in it.
 *
 * Properties §7.2 asks for, and how each is actually obtained:
 *
 *   deterministic  the set comes from the plan file, not from a live re-derivation.
 *                  Re-running the plan and re-running this apply are different acts.
 *   exactly-one    every entry in the set is a single statute_id. The plan refuses
 *                  everything else with a named reason; refusals never reach here.
 *   idempotent     `statute_id IS DISTINCT FROM $target` — a second run updates 0 rows.
 *   resumable      a checkpoint file records completed pairs by index; a killed run
 *                  resumes at the next pair, not at the start.
 *   truth sample   `--sample N` prints N random (judgment, act as printed, act linked)
 *                  triples before and after, so the link can be read by a human.
 *   no model       nothing here calls one.
 *
 * Default mode is DRY RUN. `--apply` is required to write, and is refused while
 * another lane holds HEAVY_BOX unless `--i-hold-heavy-box` is also passed.
 *
 * Usage:
 *   tsx scripts/n2-statute-link-apply.mts                       # dry run, whole set
 *   tsx scripts/n2-statute-link-apply.mts --limit 25            # bounded dry run
 *   tsx scripts/n2-statute-link-apply.mts --sample 12           # truth sample only
 *   tsx scripts/n2-statute-link-apply.mts --apply --i-hold-heavy-box
 *
 * ## MANDATORY POST-APPLY STEP, added R8.3
 *
 *   tsx scripts/n2-statute-link-precision.mts --apply
 *
 * The plan refuses whole `REFUSE_PAIR_UNIDENTIFIED` pairs, so an apply can no
 * longer recreate FIFTH's Companies-Act-1956-to-2013 defect. But this script
 * links a whole pair at once, so it DOES restore the ~800 individual
 * `REFUSE_SECTION_ABSENT` refs that live inside otherwise-identified pairs.
 * Run the precision pass afterwards or those come back silently.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SET_FILE = 'docs/ai/new2-r8/statute-link-set.json';
const CKPT = 'services/ingest/.checkpoints/n2-statute-link.json';

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

type Link = { act_key: string; act_named: string; refs: number; statute_id: string; outcome: string };

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const num = (f: string, d: number) => {
  const i = argv.indexOf(f);
  return i >= 0 ? Number(argv[i + 1]) : d;
};

const APPLY = has('--apply');
const LIMIT = num('--limit', Infinity);
const SAMPLE = num('--sample', 0);

if (APPLY && !has('--i-hold-heavy-box')) {
  console.error('refused: --apply writes ~320k rows. That is HEAVY_BOX work.');
  console.error('         Pass --i-hold-heavy-box only when the lease is actually yours.');
  process.exit(2);
}

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 30, connect_timeout: 20 });

async function truthSample(n: number, label: string) {
  const rows = await sql<{ case_title: string; act_named: string; section_number: string; short_title: string | null }[]>`
    select j.case_title, r.act_named, r.section_number, s.short_title
    from judgment_statute_refs r
    join judgments j on j.id = r.judgment_id
    left join statutes s on s.id = r.statute_id
    where r.act_key = any(${links.slice(0, 40).map((l) => l.act_key)}::text[])
    limit ${n}
  `;
  console.log(`\n--- truth sample ${label} (${rows.length}) ---`);
  for (const r of rows) {
    console.log(`  s.${r.section_number} ${r.act_named}`);
    console.log(`     -> ${r.short_title ?? 'NOT LINKED'}`);
    console.log(`     in: ${(r.case_title ?? '').slice(0, 76)}`);
  }
}

const links: Link[] = JSON.parse(readFileSync(join(ROOT, SET_FILE), 'utf8'));

async function main() {
  console.log(`link set          ${links.length} pairs, ${links.reduce((a, l) => a + l.refs, 0).toLocaleString()} refs`);
  console.log(`mode              ${APPLY ? 'APPLY — WRITES' : 'DRY RUN — counts only'}`);

  // Every entry must name exactly one statute. Belt and braces: the plan
  // guarantees it, and this refuses to trust the file if it ever stops being true.
  const bad = links.filter((l) => !l.statute_id || !l.outcome.startsWith('LINK_'));
  if (bad.length) {
    console.error(`refused: ${bad.length} entries are not single-target LINK_ rows`);
    process.exit(2);
  }

  if (SAMPLE > 0) await truthSample(SAMPLE, 'BEFORE');

  let done = 0;
  if (existsSync(join(ROOT, CKPT))) {
    done = JSON.parse(readFileSync(join(ROOT, CKPT), 'utf8')).completed_pairs ?? 0;
    console.log(`checkpoint        resuming at pair ${done}`);
  }

  let updated = 0;
  let already = 0;
  const started = Date.now();
  let lastReport = started;

  for (let i = done; i < Math.min(links.length, done + LIMIT); i += 1) {
    const l = links[i];

    if (!APPLY) {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from judgment_statute_refs
        where act_key = ${l.act_key} and act_named = ${l.act_named}
          and statute_id is distinct from ${l.statute_id}::uuid
      `;
      updated += n;
      already += l.refs - n;
    } else {
      const res = await sql`
        update judgment_statute_refs
           set statute_id = ${l.statute_id}::uuid
         where act_key = ${l.act_key} and act_named = ${l.act_named}
           and statute_id is distinct from ${l.statute_id}::uuid
      `;
      updated += res.count;
      already += l.refs - res.count;
      mkdirSync(dirname(join(ROOT, CKPT)), { recursive: true });
      writeFileSync(
        join(ROOT, CKPT),
        JSON.stringify({ completed_pairs: i + 1, rows_updated: updated, at: new Date().toISOString() }, null, 2),
      );
    }

    // §3: durable output at least every 15 minutes. This reports every 60s,
    // and the metric is rows written, never pairs visited.
    if (Date.now() - lastReport > 60_000) {
      console.log(`  ${new Date().toISOString()}  pair ${i + 1}/${links.length}  rows ${APPLY ? 'written' : 'pending'} ${updated.toLocaleString()}`);
      lastReport = Date.now();
    }
  }

  console.log('');
  console.log(`rows ${APPLY ? 'UPDATED' : 'that WOULD change'}   ${updated.toLocaleString()}`);
  console.log(`rows already correct        ${already.toLocaleString()}`);
  console.log(`elapsed                     ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (SAMPLE > 0 && APPLY) await truthSample(SAMPLE, 'AFTER');
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
