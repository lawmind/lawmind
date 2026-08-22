/**
 * NEW2 — re-grade both citation-identity studies against the shared role rules,
 * from the evidence already read. No database, nothing rewritten.
 *
 * Reports THREE outcomes rather than a binary, because "we could not tell from
 * this layout" is a real third answer and folding it into either side would
 * make both numbers wrong.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { roleOf, evidenceClassOf, OWN_ROLES, UNDETERMINED_ROLES } from './.n2-role.mjs';

// ---------------------------------------------------------------- P3.A ------
const EP = JSON.parse(readFileSync('docs/ai/new2/extraction-precision.json', 'utf8'));
for (const r of EP.rows) {
  r.role = roleOf(r, r.citation);
  r.printed_as_own = OWN_ROLES.has(r.role);
  r.undetermined = UNDETERMINED_ROLES.has(r.role);
  r.evidence_class = evidenceClassOf(r, r.court);
}

const byCourt = {};
for (const r of EP.rows) {
  const c = (byCourt[r.court] ??= { sampled: 0, own: 0, cited_authority: 0, not_a_citation: 0, absent: 0, undetermined: 0, roles: {} });
  c.sampled += 1;
  c.roles[r.role] = (c.roles[r.role] ?? 0) + 1;
  if (r.printed_as_own) c.own += 1;
  if (r.role === 'CITED_AUTHORITY') c.cited_authority += 1;
  if (r.role === 'NOT_A_CITATION') c.not_a_citation += 1;
  if (r.role === 'ABSENT_FROM_TEXT') c.absent += 1;
  if (r.undetermined) c.undetermined += 1;
}

let wOwn = 0; let wCited = 0; let wNot = 0; let wAbs = 0; let wUnd = 0; let wTot = 0;
for (const [court, c] of Object.entries(byCourt)) {
  const p = EP.by_court[court]?.population_rows ?? 0;
  c.population_rows = p;
  c.printed_as_own_pct = +((c.own / c.sampled) * 100).toFixed(2);
  c.cited_authority_pct = +((c.cited_authority / c.sampled) * 100).toFixed(2);
  c.not_a_citation_pct = +((c.not_a_citation / c.sampled) * 100).toFixed(2);
  c.absent_from_text_pct = +((c.absent / c.sampled) * 100).toFixed(2);
  c.undetermined_pct = +((c.undetermined / c.sampled) * 100).toFixed(2);
  wTot += p;
  wOwn += (c.own / c.sampled) * p;
  wCited += (c.cited_authority / c.sampled) * p;
  wNot += (c.not_a_citation / c.sampled) * p;
  wAbs += (c.absent / c.sampled) * p;
  wUnd += (c.undetermined / c.sampled) * p;
}
EP.by_court = byCourt;
EP.weighted = {
  denominator_rows: wTot,
  printed_as_own_pct: +((wOwn / wTot) * 100).toFixed(2),
  cited_authority_pct: +((wCited / wTot) * 100).toFixed(2),
  not_a_citation_pct: +((wNot / wTot) * 100).toFixed(2),
  absent_from_text_pct: +((wAbs / wTot) * 100).toFixed(2),
  undetermined_pct: +((wUnd / wTot) * 100).toFixed(2),
  proven_wrong_rows: Math.round(wCited + wNot),
  undetermined_rows: Math.round(wUnd),
};
writeFileSync('docs/ai/new2/extraction-precision.json', JSON.stringify(EP, null, 1));

console.log('=== P3.A extraction precision, population-weighted over ' + wTot.toLocaleString() + ' citation-bearing rows');
console.log(JSON.stringify(EP.weighted, null, 1));
console.log('\ncourt'.padEnd(39) + 'pop'.padStart(8) + '  own%' + ' cited%' + ' notc%' + ' absent%' + ' undet%');
for (const [court, c] of Object.entries(byCourt).sort((a, b) => b[1].population_rows - a[1].population_rows)) {
  console.log(court.padEnd(38) + String(c.population_rows).padStart(9)
    + String(c.printed_as_own_pct).padStart(7) + String(c.cited_authority_pct).padStart(7)
    + String(c.not_a_citation_pct).padStart(7) + String(c.absent_from_text_pct).padStart(8)
    + String(c.undetermined_pct).padStart(8));
}

// ------------------------------------------------------------------ P1 ------
const SAMPLE = JSON.parse(readFileSync('docs/ai/new2/shared-neutral-sample.json', 'utf8'));
const POP = JSON.parse(readFileSync('docs/ai/new2/strata-population.json', 'utf8'));

function verdictFor(g, rows) {
  const n = rows.length;
  if (n === 0) return { verdict: 'SOURCE_UNAVAILABLE', why: 'no document rows read' };
  const roles = rows.map((a) => a.citeRole);
  const nOwn = roles.filter((r) => OWN_ROLES.has(r)).length;
  const nAuth = roles.filter((r) => r === 'CITED_AUTHORITY').length;
  const nNot = roles.filter((r) => r === 'NOT_A_CITATION').length;
  const nAbsent = roles.filter((r) => r === 'ABSENT_FROM_TEXT').length;
  const hashes = new Set(rows.map((a) => a.content_hash));
  const cases = new Set(rows.map((a) => a.case_number));
  const dates = new Set(rows.map((a) => a.date));

  if (nNot >= Math.ceil(n * 0.6)) return { verdict: 'NOT_A_CITATION', why: 'the court-code position holds a month name — a registry stamp read as a citation' };
  if (nAbsent === n) return { verdict: 'SOURCE_UNAVAILABLE', why: 'the citation appears in no sampled document body' };
  if (hashes.size === 1 && n > 1) return { verdict: 'DUPLICATE_DOCUMENT', why: 'all ' + n + ' sampled documents are byte-identical text across ' + cases.size + ' case number(s)' };
  if (nAuth >= Math.ceil(n * 0.6)) return { verdict: 'EXTRACTOR_STAMP_CONTAMINATION', why: nAuth + '/' + n + ' documents carry it inside authority-citing prose — it is another judgment’s citation' };
  if (nOwn >= Math.ceil(n * 0.6)) {
    if (cases.size === 1) return { verdict: 'MULTIPLE_ORDERS_SAME_CASE', why: nOwn + '/' + n + ' print it as their own and all share one case number' };
    if (dates.size === 1) return { verdict: 'CONNECTED_MATTER_COMMON_ORDER', why: nOwn + '/' + n + ' print it as their own; ' + cases.size + ' case numbers, all decided ' + [...dates][0] };
    return { verdict: 'COURT_SHARED_BATCH_CITATION', why: nOwn + '/' + n + ' print it as their own across ' + cases.size + ' case numbers and ' + dates.size + ' decision dates' };
  }
  if (cases.size === 1) return { verdict: 'MULTIPLE_ORDERS_SAME_CASE', why: 'one case number, differing text' };
  return { verdict: 'UNDETERMINED', why: 'no layout rule matched: ' + roles.join('/') };
}

const groups = SAMPLE.groups.map((g) => {
  const rows = g.rows.map((r) => ({ ...r, citeRole: roleOf(r, g.sample_raw), evidence_class: evidenceClassOf(r, g.court) }));
  const ev = {};
  for (const a of rows) ev[a.evidence_class] = (ev[a.evidence_class] ?? 0) + 1;
  return {
    ...g,
    rows,
    ...verdictFor(g, rows),
    evidence: ev,
    documents_read: rows.length,
    documents_printing_it_as_their_own: rows.filter((a) => OWN_ROLES.has(a.citeRole)).length,
  };
});

const VERDICTS = ['DUPLICATE_DOCUMENT', 'CONNECTED_MATTER_COMMON_ORDER', 'MULTIPLE_ORDERS_SAME_CASE', 'COURT_SHARED_BATCH_CITATION', 'EXTRACTOR_STAMP_CONTAMINATION', 'NOT_A_CITATION', 'SOURCE_UNAVAILABLE', 'UNDETERMINED'];
const popKey = (c, s, i) => c + '|' + s + '|' + i;
const byStratum = new Map();
for (const g of groups) {
  const k = popKey(g.stratum.court, g.stratum.size, g.stratum.identity);
  if (!byStratum.has(k)) byStratum.set(k, []);
  byStratum.get(k).push(g);
}

function weighted(filter) {
  const est = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  let cov = 0; let uncov = 0;
  for (const p of POP) {
    if (!filter(p)) continue;
    const s = byStratum.get(popKey(p.court, p.size, p.identity)) ?? [];
    if (!s.length) { uncov += p.rows; continue; }
    cov += p.rows;
    for (const v of VERDICTS) est[v] += (s.filter((g) => g.verdict === v).length / s.length) * p.rows;
  }
  return { est, cov, uncov };
}
function bootstrap(filter, B = 400) {
  const draws = Object.fromEntries(VERDICTS.map((v) => [v, []]));
  for (let b = 0; b < B; b += 1) {
    const acc = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
    let den = 0;
    for (const p of POP) {
      if (!filter(p)) continue;
      const s = byStratum.get(popKey(p.court, p.size, p.identity)) ?? [];
      if (!s.length) continue;
      den += p.rows;
      const c = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
      for (let i = 0; i < s.length; i += 1) c[s[Math.floor(Math.random() * s.length)].verdict] += 1;
      for (const v of VERDICTS) acc[v] += (c[v] / s.length) * p.rows;
    }
    for (const v of VERDICTS) draws[v].push(den ? acc[v] / den : 0);
  }
  const out = {};
  for (const v of VERDICTS) {
    const a = draws[v].sort((x, y) => x - y);
    out[v] = { lo: +(a[Math.floor(B * 0.025)] * 100).toFixed(2), hi: +(a[Math.floor(B * 0.975)] * 100).toFixed(2) };
  }
  return out;
}

const all = weighted(() => true);
const ci = bootstrap(() => true);
const byCourtP1 = {};
for (const court of new Set(POP.map((p) => p.court))) {
  const w = weighted((p) => p.court === court);
  if (!w.cov) continue;
  byCourtP1[court] = {
    population_rows: w.cov + w.uncov,
    shares_pct: Object.fromEntries(VERDICTS.map((v) => [v, +((w.est[v] / w.cov) * 100).toFixed(2)])),
  };
}
const tally = {};
for (const g of groups) tally[g.verdict] = (tally[g.verdict] ?? 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  question: 'is a neutral citation shared by many judgments a fact about the courts, or a defect in our extractor?',
  method: 'stratified by court x group-size x byte-identity; up to 6 source documents read per group; the role of the shared citation inside each document decided by layout rules read off real documents; three decisive groups additionally verified against the source PDFs with an independent extractor',
  population: { groups: POP.reduce((a, b) => a + b.groups, 0), rows: POP.reduce((a, b) => a + b.rows, 0) },
  sample: { groups: groups.length, documents: groups.reduce((a, b) => a + b.rows.length, 0), tally },
  weighted_share_of_shared_rows_pct: Object.fromEntries(VERDICTS.map((v) => [v, +((all.est[v] / all.cov) * 100).toFixed(2)])),
  weighted_share_ci95_pct: ci,
  weighted_row_counts: Object.fromEntries(VERDICTS.map((v) => [v, Math.round(all.est[v])])),
  by_court: byCourtP1,
  groups,
};
writeFileSync('docs/ai/new2/shared-neutral-verdicts.json', JSON.stringify(report, null, 1));

console.log('\n=== P1 shared-citation verdicts, weighted over ' + all.cov.toLocaleString() + ' shared rows');
console.log('sample: ' + groups.length + ' groups, ' + report.sample.documents + ' documents');
for (const v of VERDICTS) {
  console.log('  ' + v.padEnd(32) + String(report.weighted_share_of_shared_rows_pct[v]).padStart(6) + '%  ci [' + ci[v].lo + ', ' + ci[v].hi + ']  ~' + report.weighted_row_counts[v].toLocaleString() + ' rows');
}
