/**
 * NEW2 P2 — RECONCILE LCC's resolver v0 AGAINST TRUTH SET v2.
 *
 * LCC deliberately declined to report a false-unique rate (bus 1052, CURRENT_PLAN
 * 23 Aug §4): "it needs an independently adjudicated sample, and printing a
 * plausible number for it is exactly what would let a backfill through." This
 * lane owns that sample. This script is the grading, and it is the only place
 * the number may come from.
 *
 * NOTHING IS WRITTEN. One indexed read against judgment_citation_keys, via the
 * resolver's own resolveBatch, so the thing measured is the thing shipped.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FALSE_UNIQUE, DEFINED BEFORE IT IS COUNTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A FALSE UNIQUE is: the resolver answered UNIQUE, and a caller that pinned that
 * single candidate would have written a pointer the adjudicated evidence
 * contradicts.
 *
 * It is graded in three severities, because collapsing them is how a scary
 * number gets discounted and a real one gets ignored:
 *
 *   MATERIAL   the pin names a DIFFERENT AUTHORITY — different parties, different
 *              case number, different bytes. An advocate opening it reads the
 *              wrong case. This is the only class that must be zero.
 *   STRUCTURAL the pin names one row of a group that is legitimately multi-target
 *              (a common order over connected matters). The proposition may be
 *              right and the case name wrong.
 *   BENIGN     the pin names one of several duplicate ingestions of the SAME
 *              authority. The advocate reads the right case; the graph is untidy.
 *
 * The denominator is resolver-UNIQUE answers over ADJUDICATED records. Records
 * the truth set records as UNKNOWN are excluded from the rate and counted
 * separately — an unadjudicated record is not evidence of safety.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { canonicalKeyFor, resolveBatch, RESOLVER_VERSION, type Resolution } from './resolver.ts';

const TRUTH = 'docs/ai/new2/citation-truth-set-v2.json';
const OUT = 'docs/ai/new2/resolver-reconciliation.json';

type TruthRecord = {
  truth_id: string;
  stratum: string;
  form_class: string;
  raw_reference: string;
  canonical_key: string | null;
  relationship: string;
  ambiguity_kind: string | null;
  ambiguity_reason: string | null;
  expected_resolver_behaviour: string;
  correct_target_ids: string[];
  candidate_count: number;
  stored_cited_judgment_id: string | null;
  source_evidence?: { court?: string; date?: string };
  canonical_candidates?: { judgment_id: string; case_title?: string; content_hash?: string }[];
};

/** Wilson score interval — a proportion near zero has no symmetric interval. */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

type Verdict =
  | 'CORRECT_UNIQUE'
  | 'CORRECT_AMBIGUOUS_REFUSAL'
  | 'CORRECT_TARGET_NOT_HELD'
  | 'CORRECT_REJECTED_NON_CITATION'
  | 'FALSE_UNIQUE_MATERIAL'
  | 'FALSE_UNIQUE_STRUCTURAL'
  | 'FALSE_UNIQUE_BENIGN'
  | 'FALSE_UNIQUE_PHANTOM'
  | 'FALSE_RESOLVE_NON_CITATION'
  | 'CONSERVATIVE_MISS'
  | 'RECALL_MISS'
  | 'UNADJUDICATED';

function grade(t: TruthRecord, r: Resolution): { verdict: Verdict; why: string } {
  const pinned = r.state === 'UNIQUE' ? r.candidates[0]!.judgmentId : null;
  const correct = new Set(t.correct_target_ids ?? []);

  // NOT_A_CITATION first: a registry stamp or sentinel must never reach a lookup.
  if (t.relationship === 'NOT_A_CITATION') {
    if (r.state === 'REFUSED') return { verdict: 'CORRECT_REJECTED_NON_CITATION', why: r.refusedReason ?? '' };
    if (r.state === 'TARGET_NOT_HELD') {
      return { verdict: 'CORRECT_REJECTED_NON_CITATION', why: 'key formed but matched nothing — harmless' };
    }
    return { verdict: 'FALSE_RESOLVE_NON_CITATION', why: `${r.state} on a non-citation` };
  }

  if (t.relationship === 'UNKNOWN' || t.relationship === 'SOURCE_UNAVAILABLE') {
    return { verdict: 'UNADJUDICATED', why: `truth relationship ${t.relationship}; resolver said ${r.state}` };
  }

  if (t.relationship === 'TARGET_NOT_HELD') {
    if (r.state === 'TARGET_NOT_HELD' || r.state === 'REFUSED') {
      return { verdict: 'CORRECT_TARGET_NOT_HELD', why: r.state };
    }
    return {
      verdict: 'FALSE_UNIQUE_PHANTOM',
      why: `we hold nothing this reference names, resolver returned ${r.state} with ${r.heldCandidates} candidate(s)`,
    };
  }

  if (t.relationship === 'LEGITIMATE_MULTI_TARGET') {
    if (r.state === 'AMBIGUOUS') return { verdict: 'CORRECT_AMBIGUOUS_REFUSAL', why: `${r.heldCandidates} candidates` };
    if (r.state === 'UNIQUE') {
      // Severity comes from the adjudicated ambiguity kind, not from a guess.
      if (t.ambiguity_kind === 'DIFFERENT_AUTHORITIES') {
        return { verdict: 'FALSE_UNIQUE_MATERIAL', why: 'collapsed a group of genuinely different authorities' };
      }
      if (t.ambiguity_kind === 'CONNECTED_MATTER_COMMON_ORDER') {
        return { verdict: 'FALSE_UNIQUE_STRUCTURAL', why: 'collapsed a common order over connected matters' };
      }
      return { verdict: 'FALSE_UNIQUE_BENIGN', why: `collapsed ${t.ambiguity_kind ?? 'a group'}` };
    }
    return { verdict: 'RECALL_MISS', why: `${r.state} on a group we do hold` };
  }

  // t.relationship === 'UNIQUE'
  if (r.state === 'UNIQUE') {
    if (correct.size === 0) return { verdict: 'UNADJUDICATED', why: 'truth UNIQUE with no target id recorded' };
    return correct.has(pinned!)
      ? { verdict: 'CORRECT_UNIQUE', why: 'pinned the adjudicated target' }
      : { verdict: 'FALSE_UNIQUE_MATERIAL', why: `pinned ${pinned} — not the adjudicated target` };
  }
  if (r.state === 'AMBIGUOUS') return { verdict: 'CONSERVATIVE_MISS', why: `${r.heldCandidates} candidates, truth says one` };
  return { verdict: 'RECALL_MISS', why: r.state === 'REFUSED' ? `refused: ${r.refusedReason}` : r.state };
}

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set. Refusing rather than guessing a connection.');
    return 2;
  }
  const doc = JSON.parse(readFileSync(TRUTH, 'utf8')) as { truth_set_version: string; records: TruthRecord[] };
  const records = doc.records;

  const sql = postgres(url, { max: 2, onnotice: () => {}, prepare: false });
  let rows: { truth: TruthRecord; res: Resolution; verdict: Verdict; why: string }[] = [];
  try {
    // Batches of 100 so one pathological key cannot make the read unbounded.
    for (let i = 0; i < records.length; i += 100) {
      const slice = records.slice(i, i + 100);
      const res = await resolveBatch(
        sql,
        slice.map((t) => t.raw_reference),
      );
      slice.forEach((t, j) => {
        const r = res[j]!;
        const { verdict, why } = grade(t, r);
        rows.push({ truth: t, res: r, verdict, why });
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const by = (v: Verdict) => rows.filter((r) => r.verdict === v);
  const count = (v: Verdict) => by(v).length;

  const adjudicated = rows.filter((r) => r.verdict !== 'UNADJUDICATED');
  const resolverUnique = adjudicated.filter((r) => r.res.state === 'UNIQUE');
  const falseUniqueAll =
    count('FALSE_UNIQUE_MATERIAL') +
    count('FALSE_UNIQUE_STRUCTURAL') +
    count('FALSE_UNIQUE_BENIGN') +
    count('FALSE_UNIQUE_PHANTOM');
  const material = count('FALSE_UNIQUE_MATERIAL');

  const strata = new Map<string, { n: number; unique: number; falseUnique: number; material: number }>();
  for (const r of adjudicated) {
    const s = strata.get(r.truth.stratum) ?? { n: 0, unique: 0, falseUnique: 0, material: 0 };
    s.n += 1;
    if (r.res.state === 'UNIQUE') s.unique += 1;
    if (r.verdict.startsWith('FALSE_UNIQUE')) s.falseUnique += 1;
    if (r.verdict === 'FALSE_UNIQUE_MATERIAL') s.material += 1;
    strata.set(r.truth.stratum, s);
  }

  const out = {
    generated_at: new Date().toISOString(),
    truth_set_version: doc.truth_set_version,
    resolver_version: RESOLVER_VERSION,
    n_records: records.length,
    n_adjudicated: adjudicated.length,
    n_unadjudicated: count('UNADJUDICATED'),
    resolver_state_counts: {
      UNIQUE: rows.filter((r) => r.res.state === 'UNIQUE').length,
      AMBIGUOUS: rows.filter((r) => r.res.state === 'AMBIGUOUS').length,
      TARGET_NOT_HELD: rows.filter((r) => r.res.state === 'TARGET_NOT_HELD').length,
      REFUSED: rows.filter((r) => r.res.state === 'REFUSED').length,
    },
    verdicts: Object.fromEntries(
      (
        [
          'CORRECT_UNIQUE',
          'CORRECT_AMBIGUOUS_REFUSAL',
          'CORRECT_TARGET_NOT_HELD',
          'CORRECT_REJECTED_NON_CITATION',
          'FALSE_UNIQUE_MATERIAL',
          'FALSE_UNIQUE_STRUCTURAL',
          'FALSE_UNIQUE_BENIGN',
          'FALSE_UNIQUE_PHANTOM',
          'FALSE_RESOLVE_NON_CITATION',
          'CONSERVATIVE_MISS',
          'RECALL_MISS',
          'UNADJUDICATED',
        ] as Verdict[]
      ).map((v) => [v, count(v)]),
    ),
    false_unique: {
      denominator_definition: 'resolver answered UNIQUE, over ADJUDICATED records only',
      denominator: resolverUnique.length,
      any: falseUniqueAll,
      any_rate: resolverUnique.length ? falseUniqueAll / resolverUnique.length : 0,
      any_ci95: wilson(falseUniqueAll, resolverUnique.length),
      material,
      material_rate: resolverUnique.length ? material / resolverUnique.length : 0,
      material_ci95: wilson(material, resolverUnique.length),
    },
    by_stratum: Object.fromEntries([...strata].sort()),
    failures: rows
      .filter((r) => r.verdict.startsWith('FALSE_') || r.verdict === 'RECALL_MISS' || r.verdict === 'CONSERVATIVE_MISS')
      .map((r) => ({
        truth_id: r.truth.truth_id,
        verdict: r.verdict,
        why: r.why,
        stratum: r.truth.stratum,
        raw_reference: r.truth.raw_reference,
        truth_relationship: r.truth.relationship,
        truth_ambiguity_kind: r.truth.ambiguity_kind,
        resolver_state: r.res.state,
        resolver_key: r.res.key,
        resolver_held: r.res.heldCandidates,
        resolver_pinned: r.res.state === 'UNIQUE' ? r.res.candidates[0]!.judgmentId : null,
        correct_target_ids: r.truth.correct_target_ids,
        stored_cited_judgment_id: r.truth.stored_cited_judgment_id,
      })),
    every_record: rows.map((r) => ({
      truth_id: r.truth.truth_id,
      stratum: r.truth.stratum,
      truth_relationship: r.truth.relationship,
      resolver_state: r.res.state,
      verdict: r.verdict,
    })),
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2));

  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  console.log(`truth set ${doc.truth_set_version} × ${RESOLVER_VERSION}`);
  console.log(`records ${records.length}  adjudicated ${adjudicated.length}  unadjudicated ${count('UNADJUDICATED')}`);
  console.log('resolver states', out.resolver_state_counts);
  console.log('verdicts', out.verdicts);
  console.log(
    `FALSE_UNIQUE any ${falseUniqueAll}/${resolverUnique.length} = ${pct(out.false_unique.any_rate)} ` +
      `CI [${pct(out.false_unique.any_ci95[0])}, ${pct(out.false_unique.any_ci95[1])}]`,
  );
  console.log(
    `FALSE_UNIQUE material ${material}/${resolverUnique.length} = ${pct(out.false_unique.material_rate)} ` +
      `CI [${pct(out.false_unique.material_ci95[0])}, ${pct(out.false_unique.material_ci95[1])}]`,
  );
  for (const [s, v] of [...strata].sort()) {
    console.log(`  ${s.padEnd(28)} n=${String(v.n).padStart(3)} unique=${String(v.unique).padStart(3)} falseUnique=${v.falseUnique} material=${v.material}`);
  }
  console.log(`wrote ${OUT}`);
  // The gate character: a material false unique is a non-zero exit.
  return material === 0 ? 0 : 1;
}

// A pure-function self check so the refusal gate is exercised even offline.
if (process.argv.includes('--gate-only')) {
  for (const s of ['NA', '0', 'SCC', '2019', 'ibid', '2025:DHC:2021-DB']) {
    console.log(s, JSON.stringify(canonicalKeyFor(s)));
  }
  process.exit(0);
}

main().then((c) => process.exit(c));
