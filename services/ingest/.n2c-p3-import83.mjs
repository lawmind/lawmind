/**
 * NEW2 §8/NEW2-3 — import the completed screen passes into quality_screen_runs.
 *
 * THREE runs, and only ONE of them establishes coverage.
 *
 *   english_density_screen_v1 / all      covers_corpus TRUE   18,698,968 rows
 *   english_density_screen_v1 / staged   covers_corpus FALSE     701,805 rows
 *   text-damage-v2.0          / all*     covers_corpus FALSE   1,626,762 rows
 *
 * The last one is the reason `covers_corpus` is a column. Its checkpoint says
 * scope 'all' by intent and read 1,626,762 of 18.7 million by fact, so its
 * silence about a document means nothing at all. A scope string would have let
 * it claim the corpus; a measured boolean does not.
 *
 * THE PRECONDITION, CHECKED RATHER THAN TRUSTED. The whole import rests on
 * `judgments.created_at < startedAt` reproducing the checkpoint's own count. If
 * that number has drifted -- because the corpus grew, or because the count was
 * never exact -- the watermark does not mean what the row will claim, and the
 * import must not happen. Verified here before a single INSERT.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, statement_timeout: 900000, onnotice: () => {} });
const APPLY = process.argv.includes('--apply');

const load = (p) => {
  const raw = readFileSync(p);
  return { json: JSON.parse(raw.toString('utf8')), sha: createHash('sha256').update(raw).digest('hex'), path: p };
};

const all = load('services/ingest/.checkpoints/text-safety-screen-all.json');
const staged = load('services/ingest/.checkpoints/text-safety-screen-staged.json');
const damage = load('services/ingest/.checkpoints/text-damage-persist.json');

const runs = [
  { method: 'english_density_screen_v1', scope: 'all', covers_corpus: true,
    started_at: all.json.startedAt, finished_at: all.json.updatedAt,
    rows_screened: all.json.screened, convicted: all.json.written,
    src: all, note: 'The completed corpus pass. convicted = rows written to judgments.script_quality (OCR_CANDIDATE 1,654,187 + LEGACY_FONT_SUSPECT 58,615). Its silence is SCREENED_NO_DAMAGE_FOUND, which is NOT clean: this same screen missed 32 of 43 glyph dumps whose signature footer lifts the English rate.' },
  { method: 'english_density_screen_v1', scope: 'staged', covers_corpus: false,
    started_at: staged.json.startedAt, finished_at: staged.json.updatedAt,
    rows_screened: staged.json.screened, convicted: staged.json.written,
    src: staged, note: 'A staged subset, superseded by the all-scope pass three minutes later. Recorded for provenance; establishes no coverage.' },
  { method: 'text-damage-v2.0', scope: 'all', covers_corpus: false,
    started_at: damage.json.startedAt, finished_at: damage.json.updatedAt,
    rows_screened: damage.json.read, convicted: damage.json.written,
    src: damage, note: 'PROOF-GRADE but PARTIAL: read 1,626,762 of 18.7M. covers_corpus is FALSE despite a scope of all, because coverage is a measured fact and not an intention. Its verdicts are a FLOOR on damage; its silence means nothing.' },
];

try {
  console.log('PRECONDITION — does created_at < startedAt reproduce each checkpoint count?\n');
  let blocked = false;
  for (const r of runs) {
    const [c] = await sql`SELECT count(*)::int AS n FROM judgments WHERE created_at < ${r.started_at}::timestamptz`;
    const exact = c.n === r.rows_screened;
    if (r.covers_corpus && !exact) blocked = true;
    console.log(`  ${r.method}/${r.scope}  checkpoint ${r.rows_screened.toLocaleString()}  ` +
                `created_at<started_at ${c.n.toLocaleString()}  ${exact ? 'EXACT' : 'differs by ' + (c.n - r.rows_screened)}` +
                `${r.covers_corpus ? '   <- coverage-bearing, must be EXACT' : ''}`);
    r.watermark_count = c.n;
  }
  if (blocked) {
    console.error('\nREFUSING TO IMPORT — a coverage-bearing run\'s watermark does not reproduce its own count.');
    process.exit(1);
  }
  console.log('\nprecondition holds for every coverage-bearing run.');

  if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to insert.'); }
  else {
    for (const r of runs) {
      await sql`INSERT INTO quality_screen_runs
        (method, scope, covers_corpus, started_at, finished_at, rows_screened, convicted, source_checkpoint, checkpoint_sha256, note)
        VALUES (${r.method}, ${r.scope}, ${r.covers_corpus}, ${r.started_at}::timestamptz, ${r.finished_at}::timestamptz,
                ${r.rows_screened}, ${r.convicted}, ${r.src.path}, ${r.src.sha}, ${r.note})
        ON CONFLICT (method, scope, started_at) DO NOTHING`;
    }
    const rows = await sql`SELECT method, scope, covers_corpus, started_at, rows_screened, convicted FROM quality_screen_runs ORDER BY started_at`;
    console.log('\nimported:'); for (const x of rows) console.log(' ', JSON.stringify(x));

    const s = await sql`
      WITH s AS (SELECT id FROM judgments TABLESAMPLE SYSTEM (0.2) REPEATABLE (5))
      SELECT e.body_text_evidence, count(*)::int AS rows
        FROM s JOIN judgment_body_text_evidence e ON e.id = s.id GROUP BY 1 ORDER BY 2 DESC`;
    console.log('\nstates AFTER import, same sample and seed as before:');
    for (const x of s) console.log('  ', String(x.rows).padStart(7), x.body_text_evidence);

    /* THE INVARIANT THAT MATTERS: the import may not move a single document into
     * or out of a DAMAGE verdict. It only renames "never looked" to "looked". */
    const dmg = s.filter(x => x.body_text_evidence.endsWith('_DAMAGED')).reduce((a, x) => a + x.rows, 0);
    console.log(`\ndamage verdicts in sample: ${dmg} (was 2,675 + 939 = 3,614 before the import)`);
    if (dmg !== 3614) { console.error('REFUSED — the import moved a damage verdict. It must not.'); process.exit(1); }
    console.log('INVARIANT HOLDS: the import moved zero damage verdicts.');

    writeFileSync('docs/ai/new2/body-text-evidence-0083-postimport.json',
      JSON.stringify({ generated_at: new Date().toISOString(), runs: rows, states_after: s }, null, 2));
  }
} finally { await sql.end({ timeout: 10 }); }
