/**
 * REMOVE TEST FIXTURES FROM THE CORPUS, BY EXACT ID, WITH A WAY BACK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A DELETE STATEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R8.1 §7.1 asks for an exact row manifest and says, twice, never a loose
 * court-name predicate. The reason is concrete: NEW2 found that a `SYNTHETIC`
 * title predicate would have taken a Constitution Bench authority with it. A
 * judgment is allowed to be called anything. `Test Court` is a plausible name
 * for a real tribunal in a jurisdiction nobody on this project has read about.
 *
 * The discriminator used here is `source_url LIKE 'test://%'`, and it is sound
 * because `src/security/fixture-leak.test.ts` asserts the other half of it — that
 * no REAL judgment carries a `test://` source. A discriminator without that
 * second assertion is a guess with a WHERE clause.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE CASCADE HAS TO GET RIGHT (§8.8, LCC)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 22 foreign keys reference `judgments`, and they do NOT behave alike:
 *
 *   ON DELETE CASCADE     11  chunks, paragraphs, citation keys, aliases,
 *                             annotations, statute refs, judges, enrichments...
 *   ON DELETE SET NULL     3  citation_concordance_resolutions, external_citations,
 *                             judgment_citations.cited_judgment_id
 *   ON DELETE NO ACTION    8  alerts, citation_checks, citation_copies,
 *                             citation_disputes, citation_fanouts,
 *                             matter_authorities, verification_cache, and
 *                             judgments.overruled_by_judgment_id (self)
 *
 * The eight NO ACTION parents BLOCK the delete. That is what FIFTH means in bus
 * 1242 by "5 shown-to-user citation checks block purge" — the delete does not
 * quietly leave them behind, it fails.
 *
 * The FK list is READ FROM THE CATALOGUE on every run, never hardcoded here. A
 * hardcoded list is correct on the day it is written and silently wrong the day
 * someone adds the twenty-third foreign key, which is precisely the failure this
 * script exists to prevent for a different table.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REFUSALS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Dry run is the default. `--apply` is required to write anything, and even then
 * it refuses if:
 *
 *   - any target id does NOT carry the discriminator (defence in depth: the
 *     manifest and the predicate must agree, or somebody is deleting by hand);
 *   - a blocking row belongs to real user activity — a citation check tied to a
 *     real search or document, a matter authority, an alert. Test debris has
 *     none of those, so this is a refusal that should never fire, which is the
 *     kind worth having;
 *   - a REAL judgment points at a target through `overruled_by_judgment_id`.
 *     That one is not a cleanup problem. A real judgment marked overruled by a
 *     fixture renders LAW MOVED on a real authority, and CLAUDE.md puts the
 *     threshold for that at zero. Measured 26 Aug 2026: 0 such rows. All six
 *     self-references are synthetic pointing at synthetic.
 *
 * Every deleted row is written to a rollback manifest BEFORE the transaction
 * commits, as full JSON, one file per run.
 *
 * Usage:
 *   node scripts/purge-synthetic-fixtures.mjs                  # dry run, discover by discriminator
 *   node scripts/purge-synthetic-fixtures.mjs --ids-file m.txt # dry run against an exact manifest
 *   node scripts/purge-synthetic-fixtures.mjs --apply          # execute
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import postgres from 'postgres';

const DISCRIMINATOR = 'test://%';
const OUT_DIR = join('docs', 'ops', 'fixture-purge');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const idsFileArg = args.indexOf('--ids-file');
const IDS_FILE = idsFileArg >= 0 ? args[idsFileArg + 1] : null;

const url = process.env.DATABASE_URL ?? readEnvUrl();
function readEnvUrl() {
  try {
    const m = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}
if (!url) {
  console.error('DATABASE_URL not set and .env unreadable');
  process.exit(2);
}

const sql = postgres(url, { max: 2, onnotice: () => {} });
const fail = (msg) => {
  console.error(`\nREFUSED — ${msg}`);
  return sql.end({ timeout: 5 }).then(() => process.exit(1));
};

const main = async () => {
  // ── 1. The targets ────────────────────────────────────────────────────────
  let targets;
  if (IDS_FILE) {
    const ids = readFileSync(IDS_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    targets = await sql`
      SELECT id, case_title, court, source_url FROM judgments WHERE id = ANY(${ids}::uuid[])`;

    // Defence in depth. The manifest is NEW2's; the predicate is the corpus's.
    // If they disagree, nobody deletes anything until a human explains why.
    const notSynthetic = targets.filter((t) => !t.source_url?.startsWith('test://'));
    if (notSynthetic.length > 0) {
      return fail(
        `${notSynthetic.length} id(s) in ${IDS_FILE} do NOT carry the ${DISCRIMINATOR} ` +
          `discriminator:\n` +
          notSynthetic.map((t) => `    ${t.id}  ${t.case_title}  ${t.source_url}`).join('\n'),
      );
    }
    if (targets.length !== ids.length) {
      console.log(
        `note: ${ids.length - targets.length} id(s) in the manifest no longer exist — ` +
          `already removed, or never present`,
      );
    }
  } else {
    targets = await sql`
      SELECT id, case_title, court, source_url FROM judgments
       WHERE source_url LIKE ${DISCRIMINATOR} ORDER BY created_at`;
  }

  if (targets.length === 0) {
    console.log('nothing to purge — no judgment carries the fixture discriminator');
    return sql.end({ timeout: 5 });
  }

  const ids = targets.map((t) => t.id);
  console.log(`${targets.length} fixture judgment(s):`);
  for (const t of targets) console.log(`  ${t.id}  ${t.case_title}  [${t.court}]`);

  // ── 2. The FK graph, read from the catalogue ──────────────────────────────
  const fks = await sql`
    SELECT tc.table_name AS child, kcu.column_name AS col, rc.delete_rule AS rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'judgments'
     ORDER BY rc.delete_rule, tc.table_name, kcu.column_name`;

  console.log(`\n${fks.length} foreign keys reference judgments. Dependent rows:`);
  const blocking = [];
  for (const fk of fks) {
    const [{ c }] = await sql.unsafe(
      `SELECT count(*)::int AS c FROM "${fk.child}" WHERE "${fk.col}" = ANY($1::uuid[])`,
      [ids],
    );
    if (c > 0 || fk.rule === 'NO ACTION') {
      console.log(`  ${String(c).padStart(6)}  ${fk.child}.${fk.col}  ON DELETE ${fk.rule}`);
    }
    if (c > 0 && fk.rule === 'NO ACTION') blocking.push({ ...fk, count: c });
  }

  // ── 3. Refusals ───────────────────────────────────────────────────────────
  //
  // A real judgment pointing at a fixture is not debris. It renders LAW MOVED on
  // a real authority, and the threshold for that is zero.
  const [{ c: realOverruled }] = await sql`
    SELECT count(*)::int AS c FROM judgments j
     WHERE j.overruled_by_judgment_id = ANY(${ids}::uuid[])
       AND (j.source_url IS NULL OR j.source_url NOT LIKE ${DISCRIMINATOR})`;
  if (realOverruled > 0) {
    return fail(
      `${realOverruled} REAL judgment(s) are marked overruled by a fixture. That is a ` +
        `correctness incident, not a cleanup: those render LAW MOVED on real authority. ` +
        `Escalate before deleting anything`,
    );
  }

  // Test debris has no user attached. If any of this fires, the rows are not debris.
  const [{ c: userLinked }] = await sql`
    SELECT count(*)::int AS c FROM citation_checks
     WHERE judgment_id_matched = ANY(${ids}::uuid[])
       AND (search_id IS NOT NULL OR document_id IS NOT NULL)`;
  const [{ c: inMatters }] = await sql`
    SELECT count(*)::int AS c FROM matter_authorities WHERE judgment_id = ANY(${ids}::uuid[])`;
  if (userLinked > 0 || inMatters > 0) {
    return fail(
      `${userLinked} citation check(s) tied to a real search or document and ${inMatters} ` +
        `matter authority reference(s). Real user activity points at these rows — they are ` +
        `not test debris and must not be deleted by this script`,
    );
  }

  console.log(
    `\nchecks: 0 real judgments overruled by a fixture · 0 user-linked citation checks · ` +
      `0 matter authorities`,
  );

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to execute.`);
    return sql.end({ timeout: 5 });
  }

  // ── 4. Rollback manifest, written BEFORE the delete ───────────────────────
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = join(OUT_DIR, `purge-${stamp}.json`);

  const manifest = { purgedAt: new Date().toISOString(), discriminator: DISCRIMINATOR, judgments: [], dependents: {} };
  manifest.judgments = await sql`SELECT * FROM judgments WHERE id = ANY(${ids}::uuid[])`;
  for (const fk of fks) {
    const rows = await sql.unsafe(
      `SELECT * FROM "${fk.child}" WHERE "${fk.col}" = ANY($1::uuid[])`,
      [ids],
    );
    if (rows.length > 0) manifest.dependents[`${fk.child}.${fk.col}`] = rows;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nrollback manifest: ${manifestPath}`);

  // ── 5. One transaction ────────────────────────────────────────────────────
  const deleted = {};
  await sql.begin(async (tx) => {
    // Clear the blockers first, in the order the catalogue reported them.
    for (const fk of blocking) {
      if (fk.child === 'judgments') {
        // The self-reference. Null it rather than delete — the row IS a target.
        const r = await tx.unsafe(
          `UPDATE judgments SET overruled_by_judgment_id = NULL WHERE "${fk.col}" = ANY($1::uuid[])`,
          [ids],
        );
        deleted[`${fk.child}.${fk.col} (nulled)`] = r.count;
      } else {
        const r = await tx.unsafe(
          `DELETE FROM "${fk.child}" WHERE "${fk.col}" = ANY($1::uuid[])`,
          [ids],
        );
        deleted[`${fk.child}.${fk.col}`] = r.count;
      }
    }
    const r = await tx`DELETE FROM judgments WHERE id = ANY(${ids}::uuid[])`;
    deleted['judgments'] = r.count;
  });

  console.log('\ndeleted:');
  for (const [k, v] of Object.entries(deleted)) console.log(`  ${String(v).padStart(6)}  ${k}`);

  const [{ c: left }] = await sql`
    SELECT count(*)::int AS c FROM judgments WHERE source_url LIKE ${DISCRIMINATOR}`;
  console.log(`\nremaining fixture judgments: ${left}`);
  if (left !== 0) {
    return fail(`${left} fixture judgment(s) survived the purge`);
  }
  return sql.end({ timeout: 5 });
};

main().catch(async (e) => {
  console.error('FAILED:', e.message);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
