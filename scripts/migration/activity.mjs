#!/usr/bin/env node
/**
 * Who is talking to the database right now, and is anyone blocked.
 *
 * Written for STAGE D of the Railway → local migration, where the question
 * "have all the writers actually stopped?" has to be answered by observation
 * rather than by having sent everyone a message. A lane that says it stopped
 * and a backend that is still holding a transaction are different facts, and
 * only the second one can corrupt a migration.
 *
 * It also answers the citation-resolver blocker question
 * (`docs/ops/UNBLOCK_CITATION_RESOLVER.sql`): the SQL there says to confirm the
 * stuck pid is still the same backend before cancelling anything, because the
 * operating system reuses pids. This prints exactly what that confirmation
 * needs — `backend_start`, `xact_start`, and the head of the query text.
 *
 *   node scripts/migration/activity.mjs                 # railway (DATABASE_URL)
 *   node scripts/migration/activity.mjs --source local
 *   node scripts/migration/activity.mjs --watch 30      # re-poll every 30s
 *
 * WHAT "QUIET" MEANS, so nobody has to judge it by eye:
 * exit code 0 = no active queries and no open write transactions on this
 * database besides this one. Non-zero = something is still running. That makes
 * it usable as a gate in a script, which is the point — `--require-quiet`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers';
import { openDb } from './manifest.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readEnvFile() {
  const out = {};
  const file = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function fmt(sec) {
  if (sec === null || sec === undefined) return '-';
  const s = Number(sec);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

async function snapshot(sql) {
  const rows = await sql`
    SELECT pid, state, coalesce(application_name,'') AS app,
           backend_start, xact_start,
           round(extract(epoch from (now()-query_start)))  AS running_s,
           round(extract(epoch from (now()-xact_start)))   AS xact_s,
           round(extract(epoch from (now()-state_change))) AS idle_s,
           pg_blocking_pids(pid) AS blocked_by,
           wait_event_type, wait_event,
           left(regexp_replace(coalesce(query,''), '\s+', ' ', 'g'), 110) AS q
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
    ORDER BY xact_start NULLS LAST, query_start NULLS LAST`;

  const active = rows.filter((r) => r.state === 'active');
  const inTxn = rows.filter((r) => r.xact_start !== null);
  const blocked = rows.filter((r) => (r.blocked_by ?? []).length > 0);

  return { rows, active, inTxn, blocked };
}

function render(s) {
  console.log(`backends on this database: ${s.rows.length}  ·  active ${s.active.length}  ·  in-transaction ${s.inTxn.length}  ·  blocked ${s.blocked.length}`);
  if (s.rows.length === 0) {
    console.log('  (none)');
    return;
  }
  console.log(
    ['pid'.padStart(7), 'state'.padEnd(19), 'runs'.padStart(7), 'xact'.padStart(7), 'blkby'.padStart(6), 'query'].join(
      '  ',
    ),
  );
  for (const r of s.rows) {
    const blk = (r.blocked_by ?? []).length ? (r.blocked_by ?? []).join(',') : '-';
    console.log(
      [
        String(r.pid).padStart(7),
        String(r.state ?? '?').padEnd(19),
        fmt(r.running_s).padStart(7),
        fmt(r.xact_s).padStart(7),
        blk.padStart(6),
        (r.q || '<no query text>').slice(0, 110),
      ].join('  '),
    );
  }
  // The blockers, spelled out. A blocked pid tells you there is a problem; the
  // blocking pid is the one you can do something about.
  for (const b of s.blocked) {
    console.log(`  BLOCKED: pid ${b.pid} waiting ${fmt(b.running_s)} on pid(s) ${(b.blocked_by ?? []).join(', ')}`);
  }
  const oldest = s.inTxn[0];
  if (oldest) {
    console.log(
      `  oldest open transaction: pid ${oldest.pid}, ${fmt(oldest.xact_s)}, started ${oldest.xact_start?.toISOString?.() ?? oldest.xact_start}`,
    );
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const source = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : 'railway';
  const requireQuiet = argv.includes('--require-quiet');
  const watch = argv.includes('--watch') ? Number(argv[argv.indexOf('--watch') + 1] || 30) : 0;
  const explicit = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : null;

  const env = { ...readEnvFile(), ...process.env };
  const url = explicit ?? (source === 'local' ? env.LOCAL_DATABASE_URL : env.DATABASE_URL);
  if (!url) {
    console.error(`No url for source "${source}". Set ${source === 'local' ? 'LOCAL_DATABASE_URL' : 'DATABASE_URL'}.`);
    process.exit(2);
  }

  const sql = await openDb(url, 2);
  try {
    for (;;) {
      const s = await snapshot(sql);
      console.log(`--- ${new Date().toISOString()} · ${source} ---`);
      render(s);
      const quiet = s.active.length === 0 && s.inTxn.length === 0;
      if (!watch) {
        if (requireQuiet && !quiet) {
          console.log('NOT QUIET — writers are still connected. Do not take the final dump.');
          process.exitCode = 1;
        } else if (requireQuiet) {
          console.log('QUIET — no active queries, no open transactions.');
        }
        return;
      }
      if (requireQuiet && quiet) {
        console.log('QUIET — no active queries, no open transactions.');
        return;
      }
      await new Promise((r) => setTimeout(r, watch * 1000));
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
