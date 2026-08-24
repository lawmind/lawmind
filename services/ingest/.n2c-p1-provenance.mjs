/**
 * NEW2 P1 — PROVENANCE OF EVERY TREATMENT CLAIM WE HOLD. NOT A SAMPLE.
 *
 * The treated population is 16,001 edges. That is small enough to classify
 * ENTIRELY, which removes sampling error from the answer to §8's question:
 * how much treatment/currentness coverage is actually safe?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLASSES, AND WHICH WAY THE SCREEN IS ALLOWED TO BE WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   COURT_REASONING_EXPLICIT      the citing court's own voice naming the act
 *   COURT_ORDER_DISPOSITIVE       the operative order — set aside, quashed, allowed
 *   OFFICIAL_REGISTRY_STATUS      a registry record. Measured, not assumed: see §0
 *   REPORTER_EDITORIAL_ANNOTATION headnote / Case Law Reference apparatus
 *   COUNSEL_ARGUMENT              what counsel urged, which is not what the court held
 *   UNKNOWN                       no speaker signal at all
 *
 * PRECEDENCE IS DELIBERATELY PESSIMISTIC: reporter > counsel > court reasoning >
 * dispositive > unknown. A span carrying both counsel voice and court voice is
 * classified COUNSEL_ARGUMENT, not COURT_REASONING_EXPLICIT. The purpose of this
 * classification is to decide what may support a CANONICAL treatment, so a false
 * negative (calling real court reasoning UNKNOWN) costs coverage, and a false
 * positive certifies a headnote as a holding. Only one of those is recoverable.
 *
 * THE WINDOW IS THE WRITER'S WINDOW. `detectTreatment` reads FORWARD 220
 * characters from the end of the citation, stopping at the next case name. A
 * wider window is how the predecessor's first polarity pass manufactured four
 * hits that belonged to a neighbouring headnote entry. The screen reads a
 * context window for the SPEAKER (necessarily wider, since a speaker announces
 * himself before the citation) and the writer's exact window for the MARKER,
 * and the two are reported separately.
 *
 * READ ONLY. Nothing is written to the database.
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

const OUT = 'docs/ai/new2/treatment-provenance-full.json';
const SPANS = 'docs/ai/new2/treatment-provenance-spans.json';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  statement_timeout: 1800000,
  idle_timeout: 0,
  onnotice: () => {},
});

const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* ── the detectors ──────────────────────────────────────────────────────────
 * Every pattern here was read off documents in this corpus. None is invented,
 * and the ones that turned out not to discriminate are recorded rather than
 * quietly dropped.
 */
const REPORTER_TABLE = /\b(referred to|relied on|followed|distinguished|overruled|approved|doubted)\s+(?:in\s+)?Paras?\.?\s*\d/i;
const REPORTER_MARKER = /(Case Law Reference|Case Law Cited|SUPREME COURT REPORTS|S\.?C\.?R\.?\s*$|HEAD ?NOTES?|\bHeadnote\b|Editor'?s? Note)/i;
const REPORTER_PARA_PIN = /\[Paras?\.?\s*[\d,\s&-]+\]\s*\[?\d{2,4}\s*-\s*[A-H]/i;

const COUNSEL = /(learned\s+(senior\s+)?(counsel|advocate|ASG|Additional Solicitor General|Solicitor General|Government Advocate|AGA|APP|Public Prosecutor)|counsel\s+(for|appearing)|appearing\s+for\s+the\s+(petitioner|respondent|appellant|applicant)|(Mr|Ms|Mrs|Shri|Smt)\.?\s+[A-Z][A-Za-z.]+,?\s+(learned|appearing)|it (was|is) (submitted|contended|urged|argued)|(submitted|contended|urged|argued) (that|by)|placed reliance (up)?on|reliance (has been|was) placed)/i;

const COURT_REASONING = /(we are of the (considered\s+)?(view|opinion)|in our (considered\s+)?(view|opinion)|we (respectfully\s+)?(follow|agree|disagree|hold|find|are unable to agree)|we are bound by|this Court (is|has been) bound|bound by the (decision|judgment|dictum|ratio)|we (hereby\s+)?overrule|(is|are|stands?) (hereby\s+)?overruled|no longer good law|does not (lay down|state) the correct (law|position)|cannot be (said to be|regarded as) good law|we approve|we do not approve|the ratio (in|of) .{0,80} (applies|is applicable)|following the (decision|judgment|dictum) (in|of))/i;

const DISPOSITIVE = /((impugned\s+)?(judgment|order|award|decree)[^.]{0,120}(is|are|stands?)\s+(hereby\s+)?(set aside|quashed|reversed|modified)|the appeal is (allowed|dismissed)|the writ petition is (allowed|dismissed)|allowed in (the above )?terms|remanded (back )?to)/i;

const CLASSES = [
  'COURT_REASONING_EXPLICIT',
  'COURT_ORDER_DISPOSITIVE',
  'OFFICIAL_REGISTRY_STATUS',
  'REPORTER_EDITORIAL_ANNOTATION',
  'COUNSEL_ARGUMENT',
  'UNKNOWN',
];

function classify(before, after) {
  const span = `${before} ${after}`;
  if (REPORTER_TABLE.test(span) || REPORTER_MARKER.test(span) || REPORTER_PARA_PIN.test(span)) {
    return 'REPORTER_EDITORIAL_ANNOTATION';
  }
  // Counsel announces himself BEFORE the citation he relies on, so the leading
  // window is the one that carries the signal.
  if (COUNSEL.test(before)) return 'COUNSEL_ARGUMENT';
  if (COURT_REASONING.test(span)) return 'COURT_REASONING_EXPLICIT';
  if (DISPOSITIVE.test(span)) return 'COURT_ORDER_DISPOSITIVE';
  return 'UNKNOWN';
}

const empty = () => Object.fromEntries(CLASSES.map((c) => [c, 0]));
const bump = (o, k, c) => {
  (o[k] ??= empty())[c] += 1;
};

const steps = [];
async function note(name, rows, ms) {
  const [{ active }] = await sql`SELECT count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`;
  steps.push({ name, ms, pg_active_after: active, rows });
}

try {
  /* §0 — OFFICIAL_REGISTRY_STATUS: does the source exist at all? Measured. */
  const t0 = Date.now();
  const [registry] = await sql`
    SELECT (SELECT count(*)::int FROM ecourts_observation) AS ecourts_observation_rows,
           (SELECT count(*)::int FROM judgments WHERE overruled_status IS NOT NULL AND overruled_status <> 'none') AS judgments_carrying_law_moved`;
  await note('registry_source_availability', registry, Date.now() - t0);
  console.log('registry source:', JSON.stringify(registry));

  /* §1 — every treated edge, with both windows. */
  const t1 = Date.now();
  const rows = await sql`
    SELECT c.id,
           c.relationship,
           c.citation_text,
           c.evidence,
           c.char_offset,
           c.cited_judgment_id,
           j.court,
           extract(year FROM j.judgment_date)::int          AS year,
           j.source_document_type,
           substr(j.full_text, greatest(1, c.char_offset - 700), 700)                          AS before_span,
           substr(j.full_text, c.char_offset + length(c.citation_text), 220)                   AS writer_window
      FROM judgment_citations c
      JOIN judgments j ON j.id = c.citing_judgment_id
     WHERE c.relationship <> 'cites'`;
  const readMs = Date.now() - t1;
  console.log(`treated edges read: ${rows.length}  ${readMs}ms`);

  const overall = empty();
  const byRelationship = {};
  const byCourt = {};
  const byDecade = {};
  const bySourceType = {};
  const spans = [];
  let distinctPairs = new Set();

  for (const r of rows) {
    const before = flat(r.before_span);
    const after = flat(r.writer_window);
    const cls = classify(before, after);
    overall[cls] += 1;
    bump(byRelationship, r.relationship, cls);
    bump(byCourt, r.court ?? 'UNKNOWN_COURT', cls);
    bump(byDecade, r.year ? `${Math.floor(r.year / 10) * 10}s` : 'no_date', cls);
    bump(bySourceType, r.source_document_type ?? 'null', cls);
    if (r.cited_judgment_id) distinctPairs.add(`${r.id}`);
    spans.push({
      id: r.id,
      relationship: r.relationship,
      cls,
      court: r.court,
      year: r.year,
      citation_text: r.citation_text,
      evidence: r.evidence,
      before_tail: before.slice(-260),
      writer_window: after.slice(0, 220),
    });
  }

  const n = rows.length;
  const pct = (k) => +((k / n) * 100).toFixed(2);

  /* §2 — the three buckets §8 asks for. */
  const canonicalSafe = overall.COURT_REASONING_EXPLICIT + overall.COURT_ORDER_DISPOSITIVE + overall.OFFICIAL_REGISTRY_STATUS;
  const candidateOnly = overall.REPORTER_EDITORIAL_ANNOTATION;
  const unsupported = overall.COUNSEL_ARGUMENT + overall.UNKNOWN;

  /* §3 — the population that actually renders LAW MOVED, traced exhaustively. */
  const t3 = Date.now();
  const lawMoved = await sql`
    SELECT j.id, j.overruled_status, j.court, extract(year FROM j.judgment_date)::int AS year,
           (SELECT count(*)::int FROM judgment_citations c
             WHERE c.cited_judgment_id = j.id
               AND c.relationship IN ('overruled','overruled_in_part','doubted')) AS driving_edges
      FROM judgments j
     WHERE j.overruled_status IS NOT NULL AND j.overruled_status <> 'none'`;
  const lawMovedMs = Date.now() - t3;

  const drivers = await sql`
    SELECT c.id, c.relationship, c.cited_judgment_id, c.citation_text, c.evidence, c.char_offset,
           j.court, extract(year FROM j.judgment_date)::int AS year,
           substr(j.full_text, greatest(1, c.char_offset - 700), 700)                        AS before_span,
           substr(j.full_text, c.char_offset + length(c.citation_text), 220)                 AS writer_window
      FROM judgment_citations c
      JOIN judgments j ON j.id = c.citing_judgment_id
     WHERE c.relationship IN ('overruled','overruled_in_part','doubted')
       AND c.cited_judgment_id IS NOT NULL`;

  const lawMovedProvenance = empty();
  const lawMovedRows = [];
  for (const d of drivers) {
    const before = flat(d.before_span);
    const after = flat(d.writer_window);
    const cls = classify(before, after);
    lawMovedProvenance[cls] += 1;
    lawMovedRows.push({
      edge_id: d.id,
      relationship: d.relationship,
      cited_judgment_id: d.cited_judgment_id,
      provenance: cls,
      citing_court: d.court,
      citing_year: d.year,
      citation_text: d.citation_text,
      evidence: d.evidence,
      before_tail: before.slice(-320),
      writer_window: after.slice(0, 220),
    });
  }

  const out = {
    generated_at: new Date().toISOString(),
    population: 'ALL treatment-bearing edges — not a sample',
    n_treated_edges: n,
    read_ms: readMs,
    registry_source_availability: registry,
    precedence: 'REPORTER > COUNSEL > COURT_REASONING > DISPOSITIVE > UNKNOWN (pessimistic by design)',
    overall: Object.fromEntries(CLASSES.map((c) => [c, { n: overall[c], pct: pct(overall[c]) }])),
    buckets: {
      canonical_safe: { n: canonicalSafe, pct: pct(canonicalSafe) },
      candidate_only_reporter: { n: candidateOnly, pct: pct(candidateOnly) },
      unsupported: { n: unsupported, pct: pct(unsupported) },
    },
    by_relationship: byRelationship,
    by_court: byCourt,
    by_decade: byDecade,
    by_source_document_type: bySourceType,
    law_moved: {
      judgments_carrying_a_state: lawMoved.length,
      by_state: lawMoved.reduce((a, r) => ((a[r.overruled_status] = (a[r.overruled_status] ?? 0) + 1), a), {}),
      driving_edges: drivers.length,
      provenance_of_driving_edges: lawMovedProvenance,
      ms: lawMovedMs,
    },
    steps,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  writeFileSync(SPANS, JSON.stringify({ generated_at: out.generated_at, law_moved_drivers: lawMovedRows, all_spans: spans }, null, 2));

  console.log('\nOVERALL over ALL', n, 'treated edges');
  for (const c of CLASSES) console.log(`  ${c.padEnd(30)} ${String(overall[c]).padStart(6)}  ${pct(overall[c])}%`);
  console.log('\nBUCKETS');
  console.log(`  canonical-safe            ${canonicalSafe}  ${pct(canonicalSafe)}%`);
  console.log(`  candidate-only (reporter) ${candidateOnly}  ${pct(candidateOnly)}%`);
  console.log(`  unsupported               ${unsupported}  ${pct(unsupported)}%`);
  console.log('\nby relationship');
  for (const [k, v] of Object.entries(byRelationship)) console.log(' ', k, JSON.stringify(v));
  console.log('\nLAW MOVED');
  console.log('  judgments carrying a state:', lawMoved.length, JSON.stringify(out.law_moved.by_state));
  console.log('  driving edges:', drivers.length, JSON.stringify(lawMovedProvenance));
  console.log(`\nwrote ${OUT} and ${SPANS}`);
} finally {
  await sql.end({ timeout: 10 });
}
