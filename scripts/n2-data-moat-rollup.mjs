/**
 * NEW2 — roll the per-pass census files up into one machine-readable Data Moat
 * snapshot, plus the tables the ledger prints.
 *
 * Reads only the artifacts. No database. So the ledger can be re-rendered from
 * a snapshot months later and will produce the same numbers, which is the point
 * of writing the snapshot in the first place.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/ai/new2-r7/data-moat-census';
const read = (n) => (existsSync(join(DIR, `${n}.json`)) ? JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8')) : null);

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const _sum = (rows, k) => rows.reduce((a, r) => a + num(r[k]), 0);

const passes = {};
for (const n of ['base', 'body', 'keys', 'citations', 'statutes', 'vectors', 'duplicates', 'passages', 'text_bands', 'eligibility_tiers']) {
  const p = read(n);
  if (p) passes[n] = p;
}

const base = passes.base?.rows ?? [];
const body = passes.body?.rows ?? [];
const keys = passes.keys?.rows ?? [];
const cites = passes.citations?.rows ?? [];
const stat = passes.statutes?.rows ?? [];
const vec = passes.vectors?.rows ?? [];

/** court -> merged row, across every pass that is keyed by court. */
const byCourt = new Map();
const cell = (court) => {
  if (!byCourt.has(court)) byCourt.set(court, { court, raw_documents: 0 });
  return byCourt.get(court);
};
for (const r of base) {
  const c = cell(r.court);
  for (const k of Object.keys(r)) {
    if (k === 'court' || k === 'year' || k === 'source_class') continue;
    c[k] = num(c[k]) + num(r[k]);
  }
  c.source_classes ??= new Set();
  c.source_classes.add(r.source_class);
}
for (const [rows, fields] of [
  [body, ['proven_damaged', 'screened_damaged', 'screened_no_damage_found', 'never_screened', 'text_quality_null', 'text_quality_ge_085', 'full_text_null', 'extracted_by_ocr']],
  [keys, ['real_neutral', 'keyed_neutral', 'has_reporter', 'keyed_reporter']],
  [cites, ['extracted_references', 'resolved_references', 'treatment_edges', 'treatment_with_provenance', 'citing_documents']],
  [stat, ['statute_refs', 'documents_with_statute_ref']],
  [vec, ['documents_with_staged_vector', 'documents_with_chunks']],
]) {
  for (const r of rows) {
    const c = cell(r.court);
    for (const f of fields) c[f] = num(c[f]) + num(r[f]);
  }
}

const courts = [...byCourt.values()].map((c) => ({ ...c, source_classes: [...(c.source_classes ?? [])].sort() }));
courts.sort((a, b) => b.raw_documents - a.raw_documents);

const totals = {};
for (const c of courts) {
  for (const [k, v] of Object.entries(c)) {
    if (typeof v !== 'number') continue;
    totals[k] = (totals[k] ?? 0) + v;
  }
}

/** decade rollup, from the year-keyed passes only. */
const byDecade = new Map();
for (const r of base) {
  const d = r.year === 'unknown' ? 'unknown' : `${String(r.year).slice(0, 3)}0s`;
  const e = byDecade.get(d) ?? { decade: d, raw_documents: 0, has_neutral_real: 0, has_case_number: 0, has_cnr: 0, has_date: 0, has_bench: 0 };
  for (const k of ['raw_documents', 'has_neutral_real', 'has_case_number', 'has_cnr', 'has_date', 'has_bench']) e[k] += num(r[k]);
  byDecade.set(d, e);
}
const decades = [...byDecade.values()].sort((a, b) => (a.decade === 'unknown' ? 1 : b.decade === 'unknown' ? -1 : a.decade.localeCompare(b.decade)));

const snapshot = {
  artifact: 'DATA_MOAT_LEDGER_V1',
  generated_at: new Date().toISOString(),
  lane: 'NEW2',
  evidence: 'OBSERVED_BY_LIVE_DB — exact counts, no planner statistics; see per-pass sql in data-moat-census/*.json',
  passes_present: Object.keys(passes),
  pass_timing_ms: Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, v.ms])),
  corpus_totals: totals,
  duplicates: passes.duplicates?.rows?.[0] ?? null,
  passages: passes.passages?.rows?.[0] ?? null,
  by_court: courts,
  by_decade: decades,
};

writeFileSync('docs/ai/new2-r7/DATA_MOAT_LEDGER_V1.json', JSON.stringify(snapshot, null, 1));

const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(2) + '%' : '—');
const n = (v) => Number(v ?? 0).toLocaleString('en-US');

console.log('CORPUS TOTALS');
for (const k of Object.keys(totals).sort()) console.log('  ', k.padEnd(34), n(totals[k]).padStart(14));
console.log('\ndup groups:', JSON.stringify(snapshot.duplicates), '\npassages:', JSON.stringify(snapshot.passages));
console.log('\nBY COURT (top 30 by raw documents)');
console.log(
  '  ' +
    'court'.padEnd(38) +
    'raw'.padStart(11) +
    'neutral'.padStart(11) +
    'keyed'.padStart(11) +
    'cites'.padStart(12) +
    'resolved'.padStart(11) +
    'vectors'.padStart(10) +
    'damaged'.padStart(10),
);
for (const c of courts.slice(0, 30)) {
  console.log(
    '  ' +
      String(c.court).slice(0, 37).padEnd(38) +
      n(c.raw_documents).padStart(11) +
      n(c.has_neutral_real).padStart(11) +
      n(c.keyed_neutral).padStart(11) +
      n(c.extracted_references).padStart(12) +
      n(c.resolved_references).padStart(11) +
      n(c.documents_with_staged_vector).padStart(10) +
      n(c.proven_damaged).padStart(10),
  );
}
console.log('\nBY DECADE');
for (const d of decades) {
  console.log(
    '  ' +
      d.decade.padEnd(10) +
      n(d.raw_documents).padStart(12) +
      '  neutral ' +
      pct(d.has_neutral_real, d.raw_documents).padStart(7) +
      '  caseno ' +
      pct(d.has_case_number, d.raw_documents).padStart(7) +
      '  cnr ' +
      pct(d.has_cnr, d.raw_documents).padStart(7) +
      '  date ' +
      pct(d.has_date, d.raw_documents).padStart(7) +
      '  bench ' +
      pct(d.has_bench, d.raw_documents).padStart(7),
  );
}
console.log('\nwrote docs/ai/new2-r7/DATA_MOAT_LEDGER_V1.json');
