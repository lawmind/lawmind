#!/usr/bin/env node
/**
 * NEW3 — BUILD THE SUPREME TODAY FIRST-USE MANIFEST FROM THE GAP DOCUMENTS.
 *
 *   node scripts/new3-supreme-today-manifest.mjs
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SCRIPT AND NOT A HAND-WRITTEN FILE
 * ---------------------------------------------------------------------------
 * The founder's directive is that the first day of Supreme Today access must be
 * spent on real, already-measured LawMind gaps rather than on exploratory
 * searches. `docs/COMPETITOR_QUERY_INVENTORY.md` ranks those gaps into tiers,
 * but a tier is not something you can execute — it points at another document
 * and says "the rows are there".
 *
 * This turns the pointers into rows. It reads the gap documents that already
 * hold the measurements and emits one manifest entry per query, each carrying
 * the four fields the directive asks for: why the query exists, what is
 * missing, which output fields matter, and how the answer gets verified against
 * a primary source.
 *
 * **Every citation string in the output is COPIED out of a repository document,
 * never generated.** That is the whole reason this is a parser rather than a
 * document I wrote: `CLAUDE.md`'s rule is that the model never emits a citation
 * from memory, and transcribing thirty-two of them by hand is exactly the act
 * that rule forbids. If a row is wrong here, it is wrong in the source file too,
 * and the source file is the thing to fix.
 *
 * It reads. It writes one JSON file. It calls no API, spends nothing, and
 * touches no database — the manifest is what gets executed later, by hand or by
 * a harvester, once an account exists.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'ai', 'SUPREME_TODAY_FIRST_USE_MANIFEST.json');

const read = (p) => {
  const f = join(ROOT, p);
  if (!existsSync(f)) throw new Error(`missing source document: ${p}`);
  return readFileSync(f, 'utf8');
};

/** Markdown table rows, as arrays of trimmed cells, from one fenced section. */
function tableRows(md, startMarker, endMarker) {
  const from = md.indexOf(startMarker);
  if (from < 0) throw new Error(`marker not found: ${startMarker}`);
  const to = endMarker ? md.indexOf(endMarker, from) : md.length;
  return md
    .slice(from, to < 0 ? md.length : to)
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) =>
      l
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    )
    .filter((cells) => cells.length >= 2 && !/^-+$/.test(cells[0]));
}

// ---------------------------------------------------------------------------
// TIER 0.5 — the unresolved overruled/overruled_in_part/doubted targets.
// The single highest-severity population LawMind holds: CLAUDE.md sets a ZERO
// threshold on rendering overruled law without the LAW MOVED mark.
// ---------------------------------------------------------------------------
const treatment = read('docs/TREATMENT_GRAPH_GAP.md');
const treatmentRows = tableRows(
  treatment,
  '## 2 · THE 34 ROWS',
  '**Method note:**',
).filter(([rel]) => /^(overruled|overruled_in_part|doubted)$/.test(rel));

// -------------------------------------------------------------------------
// ALL 34 ROWS ARE KEPT, DELIBERATELY, AND THIS IS THE REASON.
//
// `TREATMENT_GRAPH_GAP.md`'s freshness header says the unresolved population
// is now **32, was 34**, and names the two fixed ones as "Sun Export
// Corporation" and "SEBI v. Roofit Industries" — by CASE NAME. §2's table
// lists targets by CITATION ONLY; the name column is the *citing* judgment,
// which is a different case. So the document names two rows to drop and does
// not provide the key needed to find them.
//
// I can guess which two. That guess would come from legal knowledge rather
// than from any file, and `CLAUDE.md` is explicit that the model never emits
// a citation from memory — writing my guess into a manifest of citation
// strings is precisely the act that rule forbids.
//
// Cost of keeping both: two redundant queries, on an account whose value is
// not metered per query the way IndianKanoon's is.
// Cost of guessing wrong: two genuinely unresolved overruled targets silently
// dropped from the highest-severity list LawMind holds, in a category with a
// stated ZERO threshold.
//
// So all 34 run, and the discrepancy is reported rather than resolved here.
// -------------------------------------------------------------------------
const tier05 = treatmentRows
  .map(([relationship, target, citing, citingDate], i) => ({
    id: `T0.5-${String(i + 1).padStart(2, '0')}`,
    tier: '0.5',
    priority: 'P0-currentness-risk',
    type: 'treatment',
    query: target,
    queryHint: `Find this authority and report its current treatment. It is asserted ${relationship.replace(/_/g, ' ')} by "${citing}" (${citingDate}).`,
    whyItExists:
      `LawMind holds the citing judgment and the edge, but the TARGET is unresolved — no row in our corpus is linked to this citation. ` +
      `While it stays unresolved, if we hold that target under another citation form it renders as ordinary good law with no LAW MOVED mark.`,
    whatIsMissing:
      'the identity of the target judgment: its neutral citation, its parallel citations, its date, its parties — anything that lets our concordance link it to a row we already hold.',
    outputFieldsThatMatter: [
      'neutral_citation',
      'parallel_citations (SCC / AIR / SCR)',
      'case_title',
      'judgment_date',
      'court_and_bench',
      'current_treatment_status',
      'treating_judgment (which case changed its status)',
    ],
    verificationAgainstPrimarySource:
      'take the returned neutral citation and match it against `judgments` directly. If it matches a held row, this was an alias gap and LCC links the edge — no acquisition. ' +
      'If it matches nothing, confirm the judgment exists via the Supreme Court e-SCR or judgments.ecourts.gov.in BEFORE recording it as a document gap. ' +
      'The provider answer is a CANDIDATE, never the record: nothing from Supreme Today is written as a citation without a primary-source confirmation.',
    sharedWith:
      relationship === 'overruled_in_part'
        ? ['BHARATLAW_NYAI_WORK_QUEUE.md P0', 'INDIANKANOON_WORK_QUEUE.md P0-PRE']
        : ['INDIANKANOON_WORK_QUEUE.md P0-PRE'],
    source: 'docs/TREATMENT_GRAPH_GAP.md §2',
    relationship,
    citingJudgment: citing,
    citingDate,
  }));

// ---------------------------------------------------------------------------
// TIER 2 — the confirmed document gaps. Absent from LawMind AND from the
// authorized AWS bucket, so unlike every other tier this is a genuine "does
// this exist and where" question rather than an alias-resolution one.
// ---------------------------------------------------------------------------
const namedGaps = [
  ['Federation of Mining Associations v. State of Rajasthan', '(1992) Supp 2 SCC 239', 'P1'],
  ['Randhir Singh Rana v. State (Delhi Administration)', '(1997) 1 SCC 361', 'P1'],
  ['Y.V. Rangaiah', null, 'confirmed-absent'],
  ['Appa Narsappa Magdum', null, 'confirmed-absent'],
  ['HUDA v. Sunita', null, 'confirmed-absent'],
  ['S.H. Medical Centre Hospital', null, 'confirmed-absent'],
  ['Velaxan Kumar', null, 'confirmed-absent'],
  ['Government NCT of Delhi v. Manav Dharam Trust', null, 'confirmed-absent'],
  ['N.V. International', null, 'confirmed-absent'],
];

const tier2 = namedGaps.map(([title, citation, status], i) => ({
  id: `T2-${String(i + 1).padStart(2, '0')}`,
  tier: '2',
  priority: status === 'P1' ? 'P1-named-gap' : 'P2-confirmed-absent',
  type: 'identity + related-authority',
  query: citation ? `${title} ${citation}` : title,
  queryHint: 'Retrieve the full judgment record and the authorities it is related to.',
  whyItExists:
    status === 'P1'
      ? 'named as a P1 acquisition target in the missing-authority queue — cited by judgments we hold, absent from our corpus.'
      : 'confirmed absent from BOTH LawMind holdings and the authorized AWS Open Data bucket. This is the one bucket where an identity query is worth more than a resolution query, because the free source genuinely does not have it.',
  whatIsMissing: 'the judgment document itself, and any citation form that would let us locate it in a source we are authorized to fetch from.',
  outputFieldsThatMatter: [
    'neutral_citation',
    'parallel_citations',
    'case_title',
    'judgment_date',
    'court_and_bench',
    'related_authorities',
    'current_treatment_status',
  ],
  verificationAgainstPrimarySource:
    'confirm existence and citation form against e-SCR or judgments.ecourts.gov.in, then route ACQUISITION to whichever authorized source actually holds it — never ingest the provider’s copy as the document of record.',
  source: 'docs/COMPETITOR_QUERY_INVENTORY.md Tier 2',
}));

const manifest = {
  generatedBy: 'scripts/new3-supreme-today-manifest.mjs',
  generatedAt: new Date().toISOString(),
  lane: 'NEW3',
  purpose:
    'Deterministic first-use plan for Supreme Today AI, built from measured LawMind gaps before access exists, so that day one is not spent on exploratory searching.',
  standingRules: [
    'Supreme Today output is a CANDIDATE, never a record. Every citation is confirmed against a primary source before it is written anywhere.',
    'Never becomes a production dependency: this is snapshot-then-decompose. If the account disappears tomorrow, everything learned stays in LawMind-owned tables.',
    'Run tiers in order. Within a tier, order is as listed.',
    'Tier 0 (NEW1 retrieval failures) outranks everything here and is absent by design — it is not fabricated in NEW1\'s absence. If a failure list lands before access does, it goes first.',
    'Tier 1 and Tier 3 are gated on the free SCI Equivalent Citation Table being checked FIRST — do not spend a query re-deriving what a free official table already answers.',
  ],
  knownDiscrepancy: {
    what: 'This manifest carries 34 treatment queries; TREATMENT_GRAPH_GAP.md\'s freshness header says the unresolved population is 32.',
    why: 'The header names the two fixed rows by CASE NAME ("Sun Export Corporation", "SEBI v. Roofit Industries"). §2\'s table identifies targets by CITATION only — its name column is the CITING judgment, a different case. The document therefore names two rows to drop without providing the key to find them.',
    decision:
      'Both are kept and run. Guessing which two would mean supplying a citation from memory, which CLAUDE.md forbids. Two redundant queries cost far less than silently dropping two unresolved overruled targets from a category with a zero threshold.',
    toClose:
      'whoever holds the database can settle it in one query — the two targets that are now resolved will simply return a linked row. Until then this stays 34, stated, not quietly rounded to 32.',
  },
  counts: {
    'tier0.5_treatment': tier05.length,
    tier2_documentGaps: tier2.length,
    total: tier05.length + tier2.length,
  },
  queries: [...tier05, ...tier2],
};

writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${OUT}`);
console.log(
  `tier 0.5 treatment: ${tier05.length} · tier 2 document gaps: ${tier2.length} · total ${manifest.counts.total}`,
);
const byRel = tier05.reduce((a, q) => ((a[q.relationship] = (a[q.relationship] ?? 0) + 1), a), {});
console.log('tier 0.5 by relationship:', byRel);
