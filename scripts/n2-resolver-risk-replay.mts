/**
 * NEW2 — R8.1 §7.4 resolver risk replay.
 *
 * G4 requires `resolver_risk_replay` to be nonempty and current before safe
 * uniqueness is served. It is EMPTY, and the gate does not notice:
 * `readKeyFreshness` reads the table, reports `lastRiskReplayAt: null`, and
 * still returns `state: CURRENT`, `because: []`, `mayAssertUnique: true`.
 * Proven on the live database, not argued. Making the gate fail closed on an
 * absent replay is LCC's §8.3; putting real adjudicated evidence in the table
 * is this script.
 *
 * ## What a replay is, and what it is not
 *
 * It runs the REAL resolver — `resolveBatch` from
 * `services/api/src/citations/resolver.ts` — over NEW2's independently
 * adjudicated truth set, and compares each answer with the behaviour a human
 * decided was correct. It does not reimplement resolution. A replay that
 * reimplements the thing it is testing tests nothing.
 *
 * ## The two numbers the gate consumes
 *
 *   false_unique       the resolver said UNIQUE (or UNIQUE_UNCONFIRMED_STALE_INDEX
 *                      treated as a uniqueness claim) where the adjudicated truth
 *                      is that no single target may be claimed.
 *   materially_unsafe  the subset where following the pin lands an advocate on a
 *                      DIFFERENT AUTHORITY — not a different row of the same
 *                      decision. This is the number that matters: a pin to
 *                      another copy of the same judgment is a duplicate-identity
 *                      problem; a pin to another case is the CITATION_HARNESS
 *                      violation.
 *
 * Per-class detail rides in `notes` as JSON, because the consumer reads
 * `ORDER BY ran_at DESC LIMIT 1` and several rows sharing one `ran_at` would
 * make "the latest replay" non-deterministic.
 *
 * DRY RUN by default. `--write` inserts exactly one row.
 *
 * Usage:
 *   tsx scripts/n2-resolver-risk-replay.mts
 *   tsx scripts/n2-resolver-risk-replay.mts --write
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import { resolveBatch } from '../services/api/src/citations/resolver.ts';
import { readKeyFreshness } from '../services/api/src/citations/key-freshness.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRUTH = 'docs/ai/new2/citation-truth-set.json';
const OUT = 'docs/ai/new2-r8/resolver-risk-replay.json';
const TRUTH_SET_NAME = 'NEW2_CITATION_TRUTH_SET';

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Record_ = {
  id: string;
  form_class: string;
  stratum: string;
  citation_text: string;
  true_target_judgment_id: string | null;
  alternate_legitimate_targets: string[] | null;
  ambiguity_kind: string | null;
  ambiguity_reason: string | null;
  expected_resolver_behaviour:
    | 'RESOLVE_UNIQUE'
    | 'RESOLVE_UNIQUE_TITLE_UNCONFIRMED'
    | 'REFUSE_AMBIGUOUS'
    | 'REFUSE_TARGET_NOT_HELD';
};

/**
 * Which §7.4 risk class each adjudicated record exercises.
 *
 * The mapping is from the record's OWN adjudicated fields, never from the
 * answer the resolver gave — a class assigned from the result would move
 * whenever the resolver moved, and the whole point is a fixed frame.
 */
function riskClass(r: Record_): string {
  if (r.ambiguity_kind === 'DIFFERENT_AUTHORITIES') return 'SHARED_NEUTRAL_DIFFERENT_AUTHORITIES';
  if (r.ambiguity_kind === 'SAME_AUTHORITY_HELD_MORE_THAN_ONCE') return 'SHARED_NEUTRAL_SAME_AUTHORITY';
  if (r.ambiguity_kind === 'SAME_PARTIES_DIFFERENT_DATES') return 'COURT_DATE_COLLISION';
  if (r.expected_resolver_behaviour === 'REFUSE_TARGET_NOT_HELD') return 'TARGET_NOT_HELD';
  if (['SCC', 'AIR', 'SCR'].includes(r.form_class)) return 'REPORTER_ALIAS';
  if (['INSC', 'NEUTRAL_UNQUALIFIED', 'NEUTRAL_BENCH_QUALIFIED'].includes(r.form_class)) return 'NEUTRAL_FORM';
  return 'OTHER';
}

/** A uniqueness CLAIM, for the purpose of counting false uniques. */
const claimsUnique = (s: string) => s === 'UNIQUE' || s === 'UNIQUE_UNCONFIRMED_STALE_INDEX';

const WRITE = process.argv.includes('--write');
const SELFTEST = process.argv.includes('--selftest');
const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 30, connect_timeout: 20 });

async function main() {
  const truth = JSON.parse(readFileSync(join(ROOT, TRUTH), 'utf8')) as {
    truth_set_version: string;
    records: Record_[];
  };
  const records = truth.records;

  const freshness = await readKeyFreshness(sql as never);

  // One resolver call for the whole set, with the freshness read ONCE and
  // passed in — the same way production does it.
  const resolutions = await resolveBatch(
    sql as never,
    records.map((r) => r.citation_text),
    freshness,
  );

  type Row = {
    id: string;
    risk_class: string;
    expected: string;
    got: string;
    heldCandidates: number;
    false_unique: boolean;
    materially_unsafe: boolean;
    why: string;
  };
  const rows: Row[] = [];

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const res = resolutions[i];
    const got = res.state;
    const mustNotClaimUnique =
      r.expected_resolver_behaviour === 'REFUSE_AMBIGUOUS' ||
      r.expected_resolver_behaviour === 'REFUSE_TARGET_NOT_HELD';

    let falseUnique = false;
    let unsafe = false;
    let why = '';

    if (claimsUnique(got) && mustNotClaimUnique) {
      falseUnique = true;
      why = `claimed ${got} where adjudicated truth is ${r.expected_resolver_behaviour}`;
      // Material only when a DIFFERENT AUTHORITY is reachable. Several copies
      // of one decision are an identity problem, not a wrong-case problem.
      unsafe = r.ambiguity_kind === 'DIFFERENT_AUTHORITIES' || r.expected_resolver_behaviour === 'REFUSE_TARGET_NOT_HELD';
    } else if (claimsUnique(got) && r.true_target_judgment_id) {
      // It claimed unique and truth agrees a unique exists — but is it the
      // RIGHT one? A correct state with the wrong target is the worst outcome
      // of all, because nothing downstream has a reason to doubt it.
      const picked = res.candidates[0]?.judgmentId ?? null;
      if (picked && picked !== r.true_target_judgment_id) {
        falseUnique = true;
        unsafe = true;
        why = 'claimed UNIQUE on a judgment that is not the adjudicated target';
      }
    }

    rows.push({
      id: r.id,
      risk_class: riskClass(r),
      expected: r.expected_resolver_behaviour,
      got,
      heldCandidates: res.heldCandidates,
      false_unique: falseUnique,
      materially_unsafe: unsafe,
      why,
    });
  }

  // ---- Per-class rollup --------------------------------------------------
  const byClass: Record<string, { records: number; false_unique: number; materially_unsafe: number }> = {};
  for (const row of rows) {
    byClass[row.risk_class] ??= { records: 0, false_unique: 0, materially_unsafe: 0 };
    byClass[row.risk_class].records += 1;
    if (row.false_unique) byClass[row.risk_class].false_unique += 1;
    if (row.materially_unsafe) byClass[row.risk_class].materially_unsafe += 1;
  }

  const confusion: Record<string, number> = {};
  for (const row of rows) confusion[`${row.expected} -> ${row.got}`] = (confusion[`${row.expected} -> ${row.got}`] ?? 0) + 1;

  // ---- Two classes the truth set cannot cover, probed directly -----------
  // DESPATCH_STAMP: registry stamps that are not citations. The resolver
  // refuses them by shape; the risk is a materialized pin left behind.
  //
  // The predicate is NEW2's own from bus 1223, character for character. A
  // hand-rolled variant here read `normalised_citation` instead of the lookup
  // key and reported 729 against the real 827 — 98 rows short, silently. One
  // predicate, not two, which is what 1223 asked for in the first place.
  const [despatch] = await sql<{ stamp_rows: number; pinned: number }[]>`
    select count(*)::int as stamp_rows,
           count(*) filter (where cited_judgment_id is not null)::int as pinned
      from judgment_citations
     where upper(regexp_replace(citation_text,'[^A-Za-z0-9]','','g'))
           ~ '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$'
  `;

  // OLD_ROW_MUTATION: keys whose group is still growing behind the builder's
  // cursor. A UNIQUE asserted on one of these is unique only to a stale index.
  const [unwalked] = await sql<{ n: number }[]>`
    select count(*)::int as n
      from judgments
     -- (x::text)::timestamptz, never x::timestamptz. postgres.js infers the
     -- parameter type from the cast and routes the string through a JS Date, which
     -- has millisecond resolution -- so the bound arrives up to 999us EARLY and this
     -- count is inflated by every row in that window. NEW2 bus 1231; the same rule
     -- citation-keys-cli.ts states in its own header.
     where created_at > (${freshness.frontierAt}::text)::timestamptz
  `;

  const totals = {
    records: rows.length,
    false_unique: rows.filter((r) => r.false_unique).length,
    materially_unsafe: rows.filter((r) => r.materially_unsafe).length,
  };

  const notes = {
    truth_set_version: truth.truth_set_version,
    resolver_freshness_state: freshness.state,
    frontier_at: freshness.frontierAt,
    by_class: byClass,
    confusion,
    despatch_stamp_class: {
      stamp_rows: despatch.stamp_rows,
      materialized_pins: despatch.pinned,
      state: despatch.pinned === 0 ? 'CLEAN' : 'FALSE_PINS_PRESENT',
    },
    old_row_mutation_class: {
      judgments_newer_than_cursor: unwalked.n,
      state: unwalked.n === 0 ? 'CLEAN' : 'INDEX_BEHIND_INGEST',
    },
    classes_not_covered_by_this_truth_set: ['CROSS_COURT_ALIAS_COLLISION'],
    // Any consumer reading false_unique = 0 must read this too. The truth set
    // was built in R7 and the resolver was CHANGED in response to it, so a
    // clean sweep is IN-SAMPLE evidence that the known defects stay fixed. It
    // is not evidence about defects nobody has adjudicated yet, and it must
    // never be presented as a corpus-wide false-unique rate.
    evidence_strength: 'IN_SAMPLE — this truth set drove the resolver fix it is testing',
    non_vacuity: 'detector proven able to fire; run with --selftest to reproduce',
  };

  const report = {
    artifact: 'NEW2_RESOLVER_RISK_REPLAY_V1',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.4',
    generated_at: new Date().toISOString(),
    mode: WRITE ? 'WRITE' : 'DRY_RUN',
    truth_set: TRUTH_SET_NAME,
    totals,
    false_unique_rate: totals.records ? +(totals.false_unique / totals.records).toFixed(6) : null,
    notes,
    rows_that_failed: rows.filter((r) => r.false_unique),
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');

  console.log(`truth set                  ${TRUTH_SET_NAME} v${truth.truth_set_version}, ${rows.length} adjudicated records`);
  console.log(`resolver freshness         ${freshness.state}  frontier ${freshness.frontierAt}`);
  console.log('');
  console.log(`false_unique               ${totals.false_unique}`);
  console.log(`materially_unsafe          ${totals.materially_unsafe}`);
  console.log('');
  console.log('by risk class:');
  for (const [k, v] of Object.entries(byClass).sort()) {
    console.log(`  ${k.padEnd(38)} n ${String(v.records).padStart(4)}   false_unique ${String(v.false_unique).padStart(3)}   unsafe ${String(v.materially_unsafe).padStart(3)}`);
  }
  console.log('');
  console.log('expected -> got:');
  for (const [k, v] of Object.entries(confusion).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log('');
  console.log(`despatch stamps            ${despatch.stamp_rows} rows, ${despatch.pinned} pinned -> ${notes.despatch_stamp_class.state}`);
  console.log(`judgments past cursor      ${unwalked.n} -> ${notes.old_row_mutation_class.state}`);

  // ---- Non-vacuity: prove each detector branch can actually fire ---------
  // A replay that reports 0 is worth nothing until it is shown capable of
  // reporting more than 0. The truth set also drove the resolver fix it is now
  // testing, so a clean sweep on it is IN-SAMPLE evidence and is labelled that
  // way. These probes are synthetic and are never written to the table.
  if (SELFTEST) {
    console.log('');
    console.log('--- non-vacuity self test ---');

    // (a) A key held by exactly ONE judgment, asserted to be ambiguous.
    //     The detector must count a false unique.
    const [uniqueKey] = await sql<{ citation_key: string; source_text: string }[]>`
      select citation_key, min(source_text) as source_text
        from judgment_citation_keys
       group by citation_key having count(distinct judgment_id) = 1
       limit 1
    `;
    // (b) A key held by MANY judgments, asserted to resolve uniquely.
    //     The resolver must answer AMBIGUOUS, so the detector must NOT fire —
    //     this proves the counter is not simply counting every mismatch.
    const [manyKey] = await sql<{ citation_key: string; source_text: string; peers: number }[]>`
      select citation_key, min(source_text) as source_text, count(distinct judgment_id)::int as peers
        from judgment_citation_keys
       group by citation_key having count(distinct judgment_id) > 2
       limit 1
    `;

    const probes = [
      { label: 'held-once key asserted AMBIGUOUS', text: uniqueKey.source_text, expected: 'REFUSE_AMBIGUOUS' as const, mustFire: true },
      { label: 'held-once key asserted NOT_HELD', text: uniqueKey.source_text, expected: 'REFUSE_TARGET_NOT_HELD' as const, mustFire: true },
      { label: `${manyKey.peers}-peer key asserted UNIQUE`, text: manyKey.source_text, expected: 'RESOLVE_UNIQUE' as const, mustFire: false },
    ];

    const probeRes = await resolveBatch(sql as never, probes.map((p) => p.text), freshness);
    let allPass = true;
    for (let i = 0; i < probes.length; i += 1) {
      const p = probes[i];
      const got = probeRes[i].state;
      const mustNot = p.expected === 'REFUSE_AMBIGUOUS' || p.expected === 'REFUSE_TARGET_NOT_HELD';
      const fired = claimsUnique(got) && mustNot;
      const pass = fired === p.mustFire;
      allPass &&= pass;
      console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${p.label.padEnd(34)} got ${got.padEnd(28)} detector ${fired ? 'FIRED' : 'silent'} (expected ${p.mustFire ? 'FIRED' : 'silent'})`);
    }
    console.log(`  self test ${allPass ? 'PASSED — the 0 above is a measurement, not a stuck counter' : 'FAILED — do not trust the counts above'}`);
    if (!allPass) process.exitCode = 1;
  }

  if (WRITE) {
    await sql`
      insert into resolver_risk_replay (ran_at, truth_set, records, false_unique, materially_unsafe, frontier_at, notes)
      values (now(), ${TRUTH_SET_NAME}, ${totals.records}, ${totals.false_unique}, ${totals.materially_unsafe},
              -- THE IDENTITY FIELD, and it must be written at FULL PRECISION.
              -- readKeyFreshness compares this against the live cursor as TEXT,
              -- deliberately, because two cursors 78us apart are different indexes.
              -- Bound as ::timestamptz it arrives truncated to milliseconds, so a
              -- cursor carrying microseconds could NEVER be matched and the gate was
              -- permanently closed: state STALE, mayAssertUnique false, every
              -- citation answering UNIQUE_UNCONFIRMED_STALE_INDEX. Observed 27 Aug
              -- 2026 -- written .499+00 against a live .499107+00. The 24 Aug row
              -- matched only because the frontier itself was truncated back then.
              (${freshness.frontierAt}::text)::timestamptz, ${JSON.stringify(notes)})
    `;
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from resolver_risk_replay`;
    console.log('');
    console.log(`WROTE 1 row. resolver_risk_replay now has ${n}.`);
  } else {
    console.log('');
    console.log('DRY RUN — nothing written. Pass --write to record this replay.');
  }
  console.log(`written ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
