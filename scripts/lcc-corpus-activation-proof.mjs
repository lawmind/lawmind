#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A RESTORED GENERATION IS NOT SERVABLE UNTIL SOMETHING HAS SEARCHED IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `release/activation.test.ts` covers the RULE — every branch of
 * `statisticsVerdict`, `smokeVerdict` and `activationDecision`, from records.
 * This proves the COLLECTORS: that `readStatistics` and `runSearchSmoke` see the
 * real states on a real generation, and that the gate refuses each of them.
 *
 * A rule tested only from hand-written records is a rule that can be perfectly
 * correct about a state nothing ever produces.
 *
 *     build a generation from the MIGRATIONS   (the path every deployment uses)
 *     load rows, do NOT analyse                ->  ACTIVATION MUST REFUSE
 *     ANALYZE                                  ->  statistics ready
 *     search smoke on the real retrieval path  ->  ACTIVATION MUST ACTIVATE
 *     break the search path                    ->  ACTIVATION MUST REFUSE
 *
 * ── WHY THE MIGRATIONS AND NOT A HAND-ROLLED SCHEMA ─────────────────────────
 *
 * Because the thing under test is the search path, and the search path depends on
 * a generated `full_text_tsv` column, a GIN index over it, and half a dozen
 * others. A hand-rolled `CREATE TABLE judgments (...)` would run the smoke
 * against a schema no deployment has, and would pass or fail for reasons that
 * transfer to nothing.
 *
 * ── WHY `DELETE FROM pg_statistic` IS THE HONEST FALSIFIER ──────────────────
 *
 * The "loaded but never analysed" state cannot be reached by asking PostgreSQL
 * politely: autovacuum may analyse the table between the load and the check, and
 * a proof that races the background worker proves nothing. Deleting the
 * catalogue rows produces EXACTLY the state a fresh `COPY` leaves — the planner
 * has no statistics for a table that holds data — deterministically, and it is
 * the state the gate exists to refuse.
 *
 * No network, no paid infrastructure, and the working corpus is never written to:
 * every database this creates is dropped in `finally`.
 *
 *     node scripts/lcc-corpus-activation-proof.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import postgres from 'postgres';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = flag('out') ?? 'docs/ai/lcc-r27';
const GEN = 'lawmind_corpus_activation_proof';

function withDb(name) {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * `process.execPath --import tsx`, not `npx`.
 *
 * `npx` on Windows is `npx.cmd`, which `execFileSync` cannot spawn without a
 * shell, and a shell would introduce a quoting problem on paths. The node
 * already running needs neither. Same reasoning as
 * `lcc-corpus-bluegreen-proof.mjs`.
 */
function runTs(script, argv, env = {}, cwd = 'services/api') {
  return execFileSync(process.execPath, ['--import', 'tsx', script, ...argv], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    cwd: resolve(cwd),
  });
}

const admin = postgres(withDb('postgres'), { max: 1, onnotice: () => {} });
const steps = [];
const record = (step, detail) => {
  steps.push({ step, at: new Date().toISOString(), ...detail });
  console.log(`  ${step}: ${JSON.stringify(detail)}`);
};

let failures = 0;
const expect = (name, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got ${JSON.stringify(actual)} wanted ${JSON.stringify(wanted)}`}`);
  return ok;
};

let gen;
try {
  console.log(`creating a disposable generation: ${GEN}`);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${GEN} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${GEN} TEMPLATE template0`);

  console.log('building its schema through the MIGRATIONS, the path every deployment uses');
  runTs('src/migrate.ts', [], { DATABASE_URL: withDb(GEN) }, 'packages/db');
  record('schema', { via: 'packages/db migrations' });

  gen = postgres(withDb(GEN), { max: 2, onnotice: () => {} });

  /**
   * A small, REAL corpus. Real enough that the search path has something to plan
   * over and something to find: `full_text_tsv` is a generated column, so the
   * lexical arm works on these rows exactly as it does on nine million.
   */
  const inserted = [];
  for (let i = 0; i < 40; i++) {
    const [row] = await gen`
      INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                             judgment_date, full_text, language, source_url, overruled_status)
      VALUES (${`SYNTHETIC — Activation Proof ${i}`}, ${`PRF 2026 INSC ${i}`}, '{}',
              'Proof Court', '2026-01-01',
              ${`anticipatory bail in a dowry harassment case, paragraph ${i}, with corroboration of the dying declaration`},
              'en', ${`test://activation/${i}/${randomUUID()}`}, 'none')
      RETURNING id`;
    inserted.push(row.id);
  }
  /**
   * The admission table, seeded so the sparse arm's bound is actually exercised.
   *
   * `df` is DERIVED — `document_count / sampled_documents` — and is not a column;
   * writing the two counts is the only spelling that can be right. `bail` at
   * 36/40 is 0.9, far over `SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY`, so the
   * filtered-lexical probe hits the real refusal path rather than sailing past a
   * table that happened to be empty.
   */
  await gen`INSERT INTO lexeme_document_frequency (lexeme, document_count, sampled_documents)
            VALUES ('bail', 36, 40), ('dowry', 2, 40), ('kesavananda', 1, 40)
            ON CONFLICT DO NOTHING`.catch((err) => {
    /* The table's columns are owned by the ingest lane and have changed shape
     * before. If this spelling stops fitting, say so rather than leaving the
     * admission path silently untested. */
    record('lexeme_seed_skipped', { why: String(err?.message ?? err) });
  });
  const [lex] = await gen`SELECT count(*)::text AS n FROM lexeme_document_frequency`;
  record('rows_loaded', { judgments: inserted.length, lexemes: Number(lex.n) });

  /* ── 1. LOADED, NOT ANALYSED. THE STATE THE GATE EXISTS FOR ─────────────── */
  //
  // The migrations run `ANALYZE` implicitly on nothing, but autovacuum may have
  // reached these rows already. Deleting the catalogue rows makes the state
  // deterministic instead of a race with a background worker.
  await gen.unsafe(`DELETE FROM pg_statistic WHERE starelid IN (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('judgments','judgment_chunks','judgment_citations',
                           'lexeme_document_frequency','statutes','statute_sections'))`);

  const probeScript = resolve('scripts/.activation-probe.mts');
  writeFileSync(
    probeScript,
    `import postgres from 'postgres';
import {
  activationDecision, readStatistics, runSearchSmoke, smokeVerdict, statisticsVerdict,
} from '../services/api/src/release/activation.ts';
const sql = postgres(process.argv[2]!, { max: 2, onnotice: () => {} });
const stats = await readStatistics(sql);
const statistics = statisticsVerdict(stats);
const probes = process.argv[3] === 'stats-only' ? [] : await runSearchSmoke(sql);
const smoke = smokeVerdict(probes);
console.log(JSON.stringify({
  stats, statistics, probes, smoke,
  decision: activationDecision({ restoreVerified: true, statistics, smoke }),
}));
await sql.end();
`,
    'utf8',
  );
  const probe = (mode) =>
    JSON.parse(
      runTs(probeScript, [withDb(GEN), mode], {}, '.')
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .pop(),
    );

  const before = probe('stats-only');
  record('before_analyze', {
    unanalyzed: before.statistics.unanalyzed,
    verdict: before.decision.verdict,
  });
  expect(
    'a loaded-but-unanalysed generation is REFUSED',
    before.decision.verdict,
    'REFUSE',
  );
  expect(
    'and judgments is named as the reason',
    before.statistics.unanalyzed.includes('judgments'),
    true,
  );

  /* ── 2. ANALYZE, THEN THE SMOKE ─────────────────────────────────────────── */
  await gen.unsafe('ANALYZE');
  const after = probe('full');
  record('after_analyze', {
    unanalyzed: after.statistics.unanalyzed,
    empty: after.statistics.empty,
    probes: after.probes.map((p) => ({ name: p.name, ms: p.ms, n: p.results, outcome: p.outcome })),
    verdict: after.decision.verdict,
  });
  expect('ANALYZE clears the statistics finding', after.statistics.unanalyzed, []);
  expect('the search smoke threw on nothing', after.smoke.failed, []);
  expect('an analysed, searchable generation ACTIVATES', after.decision.verdict, 'ACTIVATE');

  /* ── 3. A GENERATION THAT CANNOT SERVE, WITH PERFECT STATISTICS ─────────── */
  //
  // The failure class the statistics check alone cannot see: every row present,
  // every checksum right, every table analysed, and search does not work.
  await gen.unsafe(`ALTER TABLE lexeme_document_frequency RENAME TO lexeme_document_frequency_hidden`);
  const broken = probe('full');
  record('broken_search_path', {
    absent: broken.statistics.absent,
    failed: broken.smoke.failed,
    verdict: broken.decision.verdict,
  });
  expect('a generation whose search path is broken is REFUSED', broken.decision.verdict, 'REFUSE');
  await gen.unsafe(`ALTER TABLE lexeme_document_frequency_hidden RENAME TO lexeme_document_frequency`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'corpus-activation-proof.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-corpus-activation-proof',
        gate: 'RESTORE -> integrity -> STATISTICS -> SEARCH SMOKE -> ACTIVATE',
        requiresStatistics: true,
        requiresSearchSmoke: true,
        steps,
        beforeAnalyze: { statistics: before.statistics, decision: before.decision },
        afterAnalyze: {
          statistics: after.statistics,
          probes: after.probes,
          decision: after.decision,
        },
        brokenSearchPath: { smoke: broken.smoke, decision: broken.decision },
        failures,
        verdict: failures === 0 ? 'ACTIVATION_GATE_PROVED' : 'ACTIVATION_GATE_NOT_PROVED',
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n${failures === 0 ? 'ACTIVATION_GATE_PROVED' : `ACTIVATION_GATE_NOT_PROVED — ${failures} assertion(s)`}`);
  if (failures > 0) process.exitCode = 1;
} finally {
  await gen?.end().catch(() => {});
  await admin.unsafe(`DROP DATABASE IF EXISTS ${GEN} WITH (FORCE)`).catch(() => {});
  await admin.end();
  try {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(resolve('scripts/.activation-probe.mts'));
  } catch {
    /* nothing to clean */
  }
}
