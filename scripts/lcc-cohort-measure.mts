/**
 * LCC R15 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * Question: holding ONE bearer of a neutral citation, is there deterministic
 * evidence already in the corpus that the citation covers a connected-matter
 * cohort whose other members have not landed?
 *
 * Instrument: NEW2's temporal holdout (bus 1622, `docs/ai/new2-r14`). Keys
 * single-claim at T0 that now name more than one distinct case are exactly the
 * false uniques a bulk apply at T0 would have written. It reads no resolver
 * output, so it cannot be tuned against.
 *
 *   pnpm exec tsx scripts/lcc-cohort-measure.mts <stage> [t0]
 *     keys     recompute the holdout key set into lcc_r15_falseunique
 *     score    score the SHIPPED gate against positives and controls
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  declaredCohort,
  cohortBlocksUnique,
  CAUSE_TITLE_CHARS,
} from '../services/api/src/citations/cohort.ts';

const STAGE = process.argv[2] ?? 'score';
const T0 = process.argv[3] ?? '2026-08-18';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

async function stageKeys() {
  const rows = await sql<{ citation_key: string; n_title: number; n_court: number }[]>`
    WITH t0 AS (
      SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${T0}::timestamptz
       GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
    ), gone AS (
      SELECT k.citation_key FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
       GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) >= 2
    ), cls AS (
      SELECT g.citation_key,
             count(DISTINCT upper(regexp_replace(coalesce(jj.case_title,''),'[^A-Za-z0-9]','','g'))) AS n_title,
             count(DISTINCT jj.court) AS n_court
        FROM gone g
        JOIN judgment_citation_keys kk ON kk.citation_key = g.citation_key
        JOIN judgments jj ON jj.id = kk.judgment_id
       GROUP BY g.citation_key
    )
    SELECT citation_key, n_title::int AS n_title, n_court::int AS n_court FROM cls WHERE n_title > 1`;
  await sql`DROP TABLE IF EXISTS lcc_r15_falseunique`;
  await sql`CREATE TABLE lcc_r15_falseunique (citation_key text primary key, n_title int, n_court int)`;
  for (let i = 0; i < rows.length; i += 200) {
    await sql`INSERT INTO lcc_r15_falseunique ${sql(rows.slice(i, i + 200), 'citation_key', 'n_title', 'n_court')}`;
  }
  console.log('T0', T0, 'MATERIAL_FALSE_UNIQUE_KEYS', rows.length);
}

type Row = {
  citation_key: string;
  id: string;
  court: string;
  judgment_date: string;
  case_title: string;
  case_number: string | null;
  head: string;
  same_court: boolean;
  same_date: boolean;
};

/** The T0 claimant — the bearer whose key row existed before T0 — plus the
 *  SHAPE of the cohort as it stands today, so recoverable and unrecoverable
 *  positives are never pooled into one percentage. */
const positives = () => sql<Row[]>`
  WITH shape AS (
    SELECT f.citation_key,
           count(DISTINCT j.court) = 1 AS same_court,
           count(DISTINCT j.judgment_date) = 1 AS same_date
      FROM lcc_r15_falseunique f
      JOIN judgment_citation_keys k ON k.citation_key = f.citation_key
      JOIN judgments j ON j.id = k.judgment_id
     GROUP BY f.citation_key
  )
  SELECT DISTINCT ON (s.citation_key)
         s.citation_key, s.same_court, s.same_date,
         j.id, j.court, j.judgment_date::text AS judgment_date, j.case_title, j.case_number,
         left(j.full_text, 2400) AS head
    FROM shape s
    JOIN judgment_citation_keys k ON k.citation_key = s.citation_key AND k.created_at < ${T0}::timestamptz
    JOIN judgments j ON j.id = k.judgment_id
   ORDER BY s.citation_key, k.created_at`;

/** Keys single-claim at T0 and STILL single-claim now. The gate firing here is
 *  a refusal the holdout says was not needed — the recall cost, exactly. */
const controls = (n: number) => sql<{ citation_key: string; head: string }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), still AS (
    SELECT k.citation_key, min(k.judgment_id::text) AS jid
      FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) = 1
  )
  SELECT s.citation_key, left(j.full_text, 2400) AS head
    FROM still s JOIN judgments j ON j.id = s.jid::uuid
   WHERE mod(abs(hashtext(s.citation_key)), 397) = 11
   LIMIT ${n}`;

/**
 * The variants, scored side by side on one instrument. `connector@1200` is what
 * `cohort.ts` ships; every other row is the counterfactual that justifies it.
 */
const WINDOWS = [400, 800, 1200, 2400] as const;
const VARIANTS: Record<string, (head: string) => boolean> = {};
for (const w of WINDOWS) {
  VARIANTS[`connector@${w}`] = (h) => cohortBlocksUnique(declaredCohort(h, w), 1);
  VARIANTS[`bare@${w}`] = (h) => declaredCohort(h, w).declaredMatters > 1;
}

async function stageScore() {
  const pos = await positives();
  const ctl = await controls(Number(process.argv[4] ?? 6000));

  const recoverable = pos.filter((p) => p.same_court && p.same_date);
  const out: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    t0: T0,
    causeTitleChars: CAUSE_TITLE_CHARS,
    positives: pos.length,
    positivesRecoverable: recoverable.length,
    positivesOutOfScope: pos.length - recoverable.length,
    controls: ctl.length,
    variants: {},
  };

  for (const [name, fires] of Object.entries(VARIANTS)) {
    const hitAll = pos.filter((p) => fires(p.head)).length;
    const hitRec = recoverable.filter((p) => fires(p.head)).length;
    const hitCtl = ctl.filter((c) => fires(c.head)).length;
    (out.variants as Record<string, unknown>)[name] = {
      positivesCaught: hitAll,
      recoverableCaught: hitRec,
      recoverableRecall: recoverable.length ? hitRec / recoverable.length : null,
      controlsRefused: hitCtl,
      controlFalseRefusalRate: ctl.length ? hitCtl / ctl.length : null,
    };
    console.log(
      `${name.padEnd(10)} recoverable ${hitRec}/${recoverable.length}` +
        `  all-positives ${hitAll}/${pos.length}` +
        `  controls ${hitCtl}/${ctl.length} (${((hitCtl / ctl.length) * 100).toFixed(3)}%)`,
    );
  }

  const shipped = VARIANTS[`connector@${CAUSE_TITLE_CHARS}`]!;
  const misses = recoverable.filter((p) => !shipped(p.head));
  console.log(`\nRECOVERABLE MISSES ${misses.length}`);
  for (const m of misses.slice(0, 6)) {
    console.log('--- MISS', m.citation_key, '|', m.case_number);
    console.log(m.head.split('\n').slice(0, 8).join(' / '));
  }
  out.recoverableMisses = misses.map((m) => ({
    citationKey: m.citation_key,
    caseNumber: m.case_number,
    declared: declaredCohort(m.head.slice(0, CAUSE_TITLE_CHARS)),
  }));
  out.outOfScope = pos
    .filter((p) => !(p.same_court && p.same_date))
    .map((p) => ({ citationKey: p.citation_key, sameCourt: p.same_court, sameDate: p.same_date }));

  mkdirSync('docs/ai/lcc-r15', { recursive: true });
  writeFileSync('docs/ai/lcc-r15/cohort-gate.json', JSON.stringify(out, null, 2) + '\n');
  console.log('\nwrote docs/ai/lcc-r15/cohort-gate.json');
}

try {
  if (STAGE === 'keys') await stageKeys();
  else if (STAGE === 'score') await stageScore();
  else console.log('unknown stage', STAGE);
} finally {
  await sql.end();
}
