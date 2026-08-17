#!/usr/bin/env node
/**
 * R2 lifecycle rules — PREFIX-SCOPED, never bucket-wide.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE IS CAREFUL OUT OF PROPORTION TO ITS SIZE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lawmind-corpus` holds two things with completely different retention needs:
 * the corpus objects the product serves, and — after the Railway shutdown — the
 * **only off-machine copy of the entire data moat**, under `backups/postgres/`.
 *
 * A lifecycle rule is a standing instruction to delete data. An unscoped one on
 * this bucket would eventually delete the database backups, silently, on a
 * timer, with no operator present. The founder directive says it outright:
 * *"Do NOT apply an unscoped lifecycle rule to the entire bucket."*
 *
 * So every rule here carries a `conditions.prefix`, and this script REFUSES to
 * submit a rule without one. That refusal is the point of the file; the API call
 * is incidental.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS AND IS NOT GIVEN AN EXPIRY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   backups/postgres/current/   NO RULE. Never expires. This is the moat.
 *   backups/postgres/archive/   180 days. Bounded history, not unlimited.
 *   temporary/                  7 days. Scratch by definition.
 *
 *   datasets/ providers/ sources/   NO RULE, deliberately. Training and
 *   evaluation sets must be reproducible months later, and provider snapshots
 *   are evidence of what a source said on a date. Neither is scratch, and an
 *   expiry on either would destroy something unrecreatable.
 *
 * **`current/` has no rule at all rather than a long one.** A 3650-day expiry
 * would look prudent and would still be a scheduled deletion of the only backup.
 * The correct number of lifecycle rules on the current verified backup is zero,
 * and rotation is handled by `backup-r2.mjs --keep N`, where a human chose N and
 * a failure is visible immediately rather than in ten years.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CREDENTIALS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lifecycle is bucket CONFIGURATION, not object access, so it needs the ADMIN
 * token — `R2_ADMIN_API_TOKEN` — not the S3 key pair. The object pair cannot do
 * this and should not be able to: `packages/storage/src/r2.ts` §"OBJECT-SCOPED
 * CREDENTIALS ONLY" is the standing rule, and a service that cannot change a
 * retention policy cannot be made to.
 *
 *   node scripts/migration/r2-lifecycle.mjs --show
 *   node scripts/migration/r2-lifecycle.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readEnvFile() {
  const out = {};
  const f = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const DAY = 86400;

/**
 * The rules. Schema confirmed against Cloudflare's API reference rather than
 * recalled — `conditions.prefix` and
 * `deleteObjectsTransition.condition.{type,maxAge}`, maxAge in SECONDS.
 */
const RULES = [
  {
    id: 'lawmind-temporary-7d',
    enabled: true,
    conditions: { prefix: 'temporary/' },
    deleteObjectsTransition: { condition: { type: 'Age', maxAge: 7 * DAY } },
  },
  {
    id: 'lawmind-backup-archive-180d',
    enabled: true,
    conditions: { prefix: 'backups/postgres/archive/' },
    deleteObjectsTransition: { condition: { type: 'Age', maxAge: 180 * DAY } },
  },
];

/** Prefixes that must NEVER appear in a rule, whatever anyone edits later. */
const PROTECTED = ['backups/postgres/current/', 'datasets/', 'providers/', 'sources/'];

function validate(rules) {
  const problems = [];
  for (const r of rules) {
    const prefix = r.conditions?.prefix;
    if (!prefix) {
      problems.push(`rule "${r.id}" has NO conditions.prefix — that is a bucket-wide deletion rule`);
      continue;
    }
    for (const p of PROTECTED) {
      // A rule on "backups/postgres/" would match "backups/postgres/current/..."
      // by prefix, so containment has to be checked in BOTH directions.
      if (p.startsWith(prefix) || prefix.startsWith(p)) {
        problems.push(`rule "${r.id}" prefix "${prefix}" would reach protected data "${p}"`);
      }
    }
  }
  return problems;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const env = { ...readEnvFile(), ...process.env };

  const accountId = env.R2_ACCOUNT_ID;
  const bucket = env.R2_BACKUP_BUCKET ?? env.R2_BUCKET;
  const token = env.R2_ADMIN_API_TOKEN;

  console.log('R2 lifecycle plan');
  console.log(`  account ${accountId ?? '(missing R2_ACCOUNT_ID)'}`);
  console.log(`  bucket  ${bucket ?? '(missing R2_BACKUP_BUCKET)'}`);
  console.log('');
  for (const r of RULES) {
    const days = r.deleteObjectsTransition.condition.maxAge / DAY;
    console.log(`  ${r.id.padEnd(34)} prefix=${r.conditions.prefix.padEnd(28)} delete after ${days}d`);
  }
  console.log('');
  console.log('  NOT given any rule, deliberately:');
  for (const p of PROTECTED) console.log(`    ${p}`);
  console.log('    backups/postgres/current/ is the only off-machine copy of the corpus.');
  console.log('    Rotation there is backup-r2.mjs --keep N, chosen by a human, visible when it fails.');
  console.log('');

  const problems = validate(RULES);
  if (problems.length) {
    console.error('REFUSED — these rules could delete protected data:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log('validation: every rule is prefix-scoped and none reaches protected data');

  if (!apply) {
    console.log('');
    console.log('Dry run. Pass --apply to submit.');
    return;
  }

  if (!accountId || !bucket || !token) {
    console.error('');
    console.error('NOT APPLIED — missing credentials.');
    console.error(`  R2_ACCOUNT_ID       ${accountId ? 'set' : 'MISSING'}`);
    console.error(`  R2_BACKUP_BUCKET    ${bucket ? 'set' : 'MISSING'}`);
    console.error(`  R2_ADMIN_API_TOKEN  ${token ? 'set' : 'MISSING'}`);
    console.error('');
    console.error('  Lifecycle is bucket CONFIGURATION, so it needs the ADMIN API token');
    console.error('  (the "Law" account token), not the S3 access-key pair. The object pair');
    console.error('  cannot set this and must not be able to — see packages/storage/src/r2.ts.');
    process.exit(3);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ rules: RULES }),
  });
  const body = await res.text();
  console.log(`PUT lifecycle -> ${res.status}`);
  console.log(body.slice(0, 800));
  if (!res.ok) process.exit(1);

  // Read it back. A 200 says the request was accepted, not that the stored
  // policy is the one intended -- the same distinction the whole migration is
  // built around.
  const check = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  console.log('');
  console.log('read-back of the stored policy:');
  console.log((await check.text()).slice(0, 1200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
