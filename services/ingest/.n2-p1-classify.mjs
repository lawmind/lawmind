/**
 * NEW2 P1.5/P1.6 — classify each sampled shared-neutral-citation group from the
 * source-document evidence already read, then reweight the stratified sample
 * back to the population.
 *
 * Pure. Reads two artifacts, writes one. No database, no rewriting.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SAMPLE = JSON.parse(readFileSync('docs/ai/new2/shared-neutral-sample.json', 'utf8'));
const POP = JSON.parse(readFileSync('docs/ai/new2/strata-population.json', 'utf8'));
const OUT = 'docs/ai/new2/shared-neutral-verdicts.json';

/**
 * Role of the shared citation INSIDE one document, in precedence order. The
 * first three are positive evidence that the document prints the citation as
 * its own; `CITED_AUTHORITY` is positive evidence that it does not.
 */
const AUTHORITY_CUES = /(reliance|relied|reported|referred|judgment of|judgement of|order of|decision of|division bench|coordinate bench|apex court|supreme court|\bvs?\.?\b|versus|\bin re\b|following|covered by|passed in)\s*[^.]{0,60}$/i;
const OWN_LABEL = /(neutral\s*citation|(^|\s)nc\s*:?\s*$|citation\s*n[o0]\.?\s*:?\s*-?\s*$)/i;

/**
 * Month names are a closed set and no High Court uses one as its court code, so
 * `2011:AUGUST:23` is provably not a neutral citation — it is the Madras
 * registry's despatch stamp `DM::2011:AUGUST:23::` read by the extractor's
 * `\d{4}:[A-Z]{2,10}:\d{1,6}` pattern. Only this certain case is asserted;
 * other unexpected codes are reported for review, never convicted here.
 */
const MONTHS = /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$/i;
const codeOf = (cite) => (cite.match(/^\d{4}:([A-Za-z-]+):/) ?? [])[1] ?? '';
const COURT_NAME = /(HIGH COURT|SUPREME COURT|IN THE COURT)/i;

function roleOf(r, cite) {
  const pos = Number(r.first_pos);
  if (pos === 0) return 'ABSENT_FROM_TEXT';
  const ctx = r.ctx ?? '';
  const idx = ctx.indexOf(cite);
  const before = idx > 0 ? ctx.slice(0, idx) : '';
  const tail = before.slice(-90);

  // 1. The citation is the first thing on the page — a registry header stamp.
  //    Position 1..6 allows for a leading bracket, quote or stray page digit.
  if (pos <= 6) return 'OWN_HEADER_STAMP';
  // 1b. Still in the masthead: the whole context window is the start of the
  //     document and the court has not been named yet, so nothing has been
  //     cited yet either. Gauhati prints `Page No.# 1/159 <CNR> <citation>`.
  if (pos <= 260 && !COURT_NAME.test(before)) return 'OWN_HEADER_STAMP';
  // 2. Explicitly labelled as a neutral citation.
  if (OWN_LABEL.test(tail)) return 'OWN_LABELLED';
  // 3. Repeated through the document at a rate consistent with a per-page
  //    stamp. A cited authority is quoted once or twice; a stamp repeats per
  //    page, so require both repetition and a plausible per-page rate.
  const occ = Number(r.occurrences);
  const pagesApprox = Math.max(1, Math.round(Number(r.len) / 1800));
  if (occ >= 3 && occ >= pagesApprox * 0.5) return 'OWN_PAGE_STAMP';
  if (occ >= 2 && r.solo_line) return 'OWN_PAGE_STAMP';
  // 4. Somebody else's judgment, named as such.
  if (AUTHORITY_CUES.test(tail)) return 'CITED_AUTHORITY';
  // 5. Residual: on its own line but only once, or loose in prose.
  if (r.solo_line) return 'SOLO_LINE_ONCE';
  return 'IN_BODY_UNLABELLED';
}

const OWN = new Set(['OWN_HEADER_STAMP', 'OWN_LABELLED', 'OWN_PAGE_STAMP']);

/**
 * The addendum's source hierarchy, recorded per document rather than per group.
 *
 * `full_text` is OUR extraction of THAT document's own PDF — `source_url` is
 * unique per row and points at one order in the authorised bucket — so finding
 * the citation there is evidence about the document, not about a listing page.
 * It is still one inference from the paper, which is why
 * `shared-neutral-pdf-evidence.json` re-reads a subset of the PDFs with an
 * independent extractor. The Supreme Court path is different and is labelled
 * differently: `sci.ts` takes the citation from source metadata, so an SC row
 * whose text does not contain it is OFFICIAL_METADATA_ONLY, not NOT_FOUND.
 */
function evidenceClassOf(r, court) {
  if (r.len === null || r.len === undefined || Number(r.len) === 0) return 'SOURCE_UNAVAILABLE';
  if (Number(r.first_pos) > 0) return 'PRINTED_ON_DOCUMENT';
  if (court === 'Supreme Court of India') return 'OFFICIAL_METADATA_ONLY';
  return 'NOT_FOUND';
}

function verdictFor(g, analysed) {
  const n = analysed.length;
  if (n === 0) return { verdict: 'SOURCE_UNAVAILABLE', why: 'no document rows read' };
  if (MONTHS.test(codeOf(g.sample_raw))) {
    return {
      verdict: 'NOT_A_CITATION',
      why: '"' + codeOf(g.sample_raw) + '" is a month, not a court code — the value is a registry despatch stamp read as a citation',
    };
  }
  const roles = analysed.map((a) => a.citeRole);
  const nOwn = roles.filter((r) => OWN.has(r)).length;
  const nAuth = roles.filter((r) => r === 'CITED_AUTHORITY').length;
  const nAbsent = roles.filter((r) => r === 'ABSENT_FROM_TEXT').length;
  const hashes = new Set(analysed.map((a) => a.content_hash));
  const cases = new Set(analysed.map((a) => a.case_number));
  const dates = new Set(analysed.map((a) => a.date));

  if (nAbsent === n) return { verdict: 'SOURCE_UNAVAILABLE', why: 'the citation appears in no sampled document body' };
  // Byte-identical text is a duplicate regardless of what the citation does:
  // the same document is held more than once under different source_urls.
  if (hashes.size === 1 && n > 1) {
    return {
      verdict: 'DUPLICATE_DOCUMENT',
      why: 'all ' + n + ' sampled rows are byte-identical text across ' + cases.size + ' case number(s)',
    };
  }
  if (nAuth >= Math.ceil(n * 0.6)) {
    return { verdict: 'EXTRACTOR_STAMP_CONTAMINATION', why: nAuth + '/' + n + ' rows carry it inside authority-citing prose, so it is another judgment’s citation' };
  }
  if (nOwn >= Math.ceil(n * 0.6)) {
    if (cases.size === 1) return { verdict: 'MULTIPLE_ORDERS_SAME_CASE', why: nOwn + '/' + n + ' print it as their own and all share one case number' };
    if (dates.size === 1) return { verdict: 'CONNECTED_MATTER_COMMON_ORDER', why: nOwn + '/' + n + ' print it as their own; ' + cases.size + ' case numbers, all decided ' + [...dates][0] };
    return { verdict: 'COURT_SHARED_BATCH_CITATION', why: nOwn + '/' + n + ' print it as their own across ' + cases.size + ' case numbers and ' + dates.size + ' decision dates' };
  }
  if (cases.size === 1) return { verdict: 'MULTIPLE_ORDERS_SAME_CASE', why: 'one case number, differing text' };
  return { verdict: 'UNKNOWN', why: 'roles mixed: ' + roles.join('/') };
}

// ---- classify -------------------------------------------------------------
const groups = SAMPLE.groups.map((g) => {
  const analysed = g.rows.map((r) => ({
    ...r,
    citeRole: roleOf(r, g.sample_raw),
    evidence_class: evidenceClassOf(r, g.court),
  }));
  const v = verdictFor(g, analysed);
  const ev = {};
  for (const a of analysed) ev[a.evidence_class] = (ev[a.evidence_class] ?? 0) + 1;
  const printedAsOwn = analysed.filter((a) => OWN.has(a.citeRole)).length;
  return {
    ...g,
    rows: analysed,
    ...v,
    evidence: ev,
    documents_printing_it_as_their_own: printedAsOwn,
    documents_read: analysed.length,
  };
});

// ---- reweight to population ----------------------------------------------
const popKey = (c, s, i) => c + '|' + s + '|' + i;
const popMap = new Map(POP.map((p) => [popKey(p.court, p.size, p.identity), p]));
const sampleByStratum = new Map();
for (const g of groups) {
  const k = popKey(g.stratum.court, g.stratum.size, g.stratum.identity);
  if (!sampleByStratum.has(k)) sampleByStratum.set(k, []);
  sampleByStratum.get(k).push(g);
}

const VERDICTS = ['DUPLICATE_DOCUMENT', 'NOT_A_CITATION', 'CONNECTED_MATTER_COMMON_ORDER', 'COURT_SHARED_BATCH_CITATION', 'EXTRACTOR_STAMP_CONTAMINATION', 'MULTIPLE_ORDERS_SAME_CASE', 'SOURCE_UNAVAILABLE', 'UNKNOWN'];

function weighted(filterFn) {
  const est = Object.fromEntries(VERDICTS.map((v) => [v, { groups: 0, rows: 0 }]));
  let covGroups = 0; let covRows = 0; let uncovGroups = 0; let uncovRows = 0;
  for (const p of POP) {
    if (!filterFn(p)) continue;
    const s = sampleByStratum.get(popKey(p.court, p.size, p.identity)) ?? [];
    if (s.length === 0) { uncovGroups += p.groups; uncovRows += p.rows; continue; }
    covGroups += p.groups; covRows += p.rows;
    for (const v of VERDICTS) {
      const rate = s.filter((g) => g.verdict === v).length / s.length;
      est[v].groups += rate * p.groups;
      est[v].rows += rate * p.rows;
    }
  }
  return { est, covGroups, covRows, uncovGroups, uncovRows };
}

// Bootstrap over sampled groups within each stratum, resampled with
// replacement, so the interval reflects how few groups some strata contributed.
function bootstrap(filterFn, B = 400) {
  const draws = Object.fromEntries(VERDICTS.map((v) => [v, []]));
  for (let b = 0; b < B; b += 1) {
    const acc = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
    let denom = 0;
    for (const p of POP) {
      if (!filterFn(p)) continue;
      const s = sampleByStratum.get(popKey(p.court, p.size, p.identity)) ?? [];
      if (s.length === 0) continue;
      denom += p.rows;
      const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
      for (let i = 0; i < s.length; i += 1) counts[s[Math.floor(Math.random() * s.length)].verdict] += 1;
      for (const v of VERDICTS) acc[v] += (counts[v] / s.length) * p.rows;
    }
    for (const v of VERDICTS) draws[v].push(denom ? acc[v] / denom : 0);
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
const byCourt = {};
for (const court of new Set(POP.map((p) => p.court))) {
  const w = weighted((p) => p.court === court);
  if (w.covRows === 0) continue;
  byCourt[court] = {
    population_rows: w.covRows + w.uncovRows,
    covered_rows: w.covRows,
    shares_pct: Object.fromEntries(VERDICTS.map((v) => [v, +((w.est[v].rows / w.covRows) * 100).toFixed(2)])),
    ci_pct: bootstrap((p) => p.court === court, 200),
  };
}

const sampleTally = {};
for (const g of groups) sampleTally[g.verdict] = (sampleTally[g.verdict] ?? 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  method: 'stratified by court x group-size-band x byte-identity; up to 8 documents read per group; role assigned from the position, repetition and surrounding text of the shared citation inside each document',
  population: { groups: POP.reduce((a, b) => a + b.groups, 0), rows: POP.reduce((a, b) => a + b.rows, 0) },
  sample: { groups: groups.length, documents: groups.reduce((a, b) => a + b.rows.length, 0), tally: sampleTally },
  coverage: { covered_population_rows: all.covRows, uncovered_population_rows: all.uncovRows },
  weighted_share_of_shared_rows_pct: Object.fromEntries(VERDICTS.map((v) => [v, +((all.est[v].rows / all.covRows) * 100).toFixed(2)])),
  weighted_share_ci95_pct: ci,
  weighted_group_counts: Object.fromEntries(VERDICTS.map((v) => [v, Math.round(all.est[v].groups)])),
  weighted_row_counts: Object.fromEntries(VERDICTS.map((v) => [v, Math.round(all.est[v].rows)])),
  by_court: byCourt,
  groups,
};
writeFileSync(OUT, JSON.stringify(report, null, 1));

console.log('sample tally:', JSON.stringify(sampleTally, null, 1));
console.log('weighted share of the ' + all.covRows.toLocaleString() + ' covered shared rows:');
for (const v of VERDICTS) {
  console.log('  ' + v.padEnd(32) + String(report.weighted_share_of_shared_rows_pct[v]).padStart(6) + '%  ci [' + ci[v].lo + ', ' + ci[v].hi + ']  ~' + report.weighted_row_counts[v].toLocaleString() + ' rows');
}
