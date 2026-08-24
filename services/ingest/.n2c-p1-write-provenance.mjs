/**
 * NEW2 P1c — POPULATE `judgment_citations.treatment_provenance`.
 *
 * LCC shipped the column in migration 0082 (bus 1109) and deliberately left the
 * write path here: the classification is this lane's evidence, not theirs to
 * transcribe. Their two design choices are honoured exactly:
 *
 *   - `NULL` means NOT CLASSIFIED. `UNKNOWN` means classified, and we could not
 *     tell. Collapsing those two is the `unclassified is two populations` error.
 *   - the CHECK is over the adjudicated vocabulary, including `MODALITY_DEFECT`,
 *     which exists only because a document was READ after the screen had run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS WRITTEN, AND WHAT IS DELIBERATELY LEFT NULL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two evidence grades, and only they are written:
 *
 *   HAND    the 137 edges driving a LAW MOVED badge, every one read as primary
 *           text. 131 reporter, 5 court reasoning, 1 modality defect.
 *   SCREEN  rows the mechanical screen classified REPORTER_EDITORIAL_ANNOTATION.
 *           Written because that class's error is ONE-DIRECTIONAL: hand-reading
 *           moved 38 rows INTO it and none out, and a 12-of-12 spot check found
 *           no false positives. It under-detects reporter; it does not invent it.
 *
 * EVERYTHING ELSE STAYS NULL. The screen's small classes were demonstrably
 * wrong when read: its single COUNSEL_ARGUMENT was the court's own voice, and 38
 * of its 42 UNKNOWNs were reporter apparatus it could not reach. Writing
 * `UNKNOWN` from a screen that is known to under-detect would record "we looked
 * and could not tell" about rows we did not really look at.
 *
 *   default   DRY RUN
 *   --apply   write
 *
 * Additive. No relationship changes, no badge moves, nothing is deleted.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const OUT = 'docs/ai/new2/treatment-provenance-written.json';
const SPANS = 'docs/ai/new2/treatment-provenance-spans.json';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, statement_timeout: 900000, idle_timeout: 0, onnotice: () => {},
});

const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* The detectors, identical to `.n2c-p1-provenance.mjs`. */
const REPORTER_TABLE  = /\b(referred to|relied on|followed|distinguished|overruled|approved|doubted)\s+(?:in\s+)?Paras?\.?\s*\d/i;
const REPORTER_MARKER = /(Case Law Reference|Case Law Cited|SUPREME COURT REPORTS|S\.?C\.?R\.?\s*$|HEAD ?NOTES?|\bHeadnote\b|Editor'?s? Note|LISTS? OF CITATIONS)/i;
const REPORTER_PARA_PIN = /\[Paras?\.?\s*[\d,\s&-]+\]\s*\[?\d{2,4}\s*-\s*[A-H]/i;
const isReporter = (span) => REPORTER_TABLE.test(span) || REPORTER_MARKER.test(span) || REPORTER_PARA_PIN.test(span);

/** The one edge whose span says the OPPOSITE of a holding: a 1985 dissent. */
const MODALITY_DEFECT = new Set(['9de8fd68-e248-4e0d-8cef-cfa79220e735']);

try {
  /* The hand adjudication of the 137, recovered from the recorded spans exactly
   * as `.n2c-p1-lawmoved.mjs` derived it, so the two passes cannot drift. */
  const drivers = JSON.parse(readFileSync(SPANS, 'utf8')).law_moved_drivers;
  const COURT_PROSE = new Set(
    drivers
      .filter((s) => s.provenance === 'UNKNOWN' &&
        /was specifically overruled and it was held|the Court overruled the decision in|does not accord with the view expressed by us/
          .test(`${s.writer_window} ${s.before_tail}`))
      .map((s) => s.edge_id),
  );
  for (const s of drivers) if (s.provenance === 'COURT_REASONING_EXPLICIT' || s.provenance === 'COUNSEL_ARGUMENT') COURT_PROSE.add(s.edge_id);
  for (const e of MODALITY_DEFECT) COURT_PROSE.delete(e);

  const hand = new Map(drivers.map((s) => [
    s.edge_id,
    MODALITY_DEFECT.has(s.edge_id) ? 'MODALITY_DEFECT'
      : COURT_PROSE.has(s.edge_id) ? 'COURT_REASONING_EXPLICIT'
      : 'REPORTER_EDITORIAL_ANNOTATION',
  ]));

  /* Re-classified from LIVE rows, never replayed from the earlier artifact — 19
   * rows that were treated when that artifact was written are now `cites`. */
  const rows = await sql`
    SELECT c.id, c.relationship, c.citation_text, c.char_offset,
           substr(j.full_text, greatest(1, c.char_offset - 700), 700)                  AS before_span,
           substr(j.full_text, c.char_offset + length(c.citation_text), 220)           AS writer_window
      FROM judgment_citations c
      JOIN judgments j ON j.id = c.citing_judgment_id
     WHERE c.relationship <> 'cites'`;

  const write = [];
  const tally = { treated: rows.length, hand: 0, screen_reporter: 0, left_null: 0 };
  for (const r of rows) {
    if (hand.has(r.id)) { write.push([r.id, hand.get(r.id)]); tally.hand += 1; continue; }
    const span = `${flat(r.before_span)} ${flat(r.writer_window)}`;
    if (isReporter(span)) { write.push([r.id, 'REPORTER_EDITORIAL_ANNOTATION']); tally.screen_reporter += 1; continue; }
    tally.left_null += 1;
  }

  const byClass = {};
  for (const [, c] of write) byClass[c] = (byClass[c] ?? 0) + 1;

  console.log(JSON.stringify(tally, null, 1));
  console.log('to write, by class:', JSON.stringify(byClass, null, 1));
  console.log(`left NULL (= NOT CLASSIFIED): ${tally.left_null} of ${tally.treated}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  } else {
    const ids = write.map((w) => w[0]);
    const cls = write.map((w) => w[1]);
    const res = await sql`
      UPDATE judgment_citations c
         SET treatment_provenance = v.p
        FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cls}::text[]) AS p) v
       WHERE c.id = v.id
         -- Additive only: never re-label a row somebody else has classified.
         AND c.treatment_provenance IS NULL
         -- And never classify a row that is no longer a treatment.
         AND c.relationship <> 'cites'`;
    console.log(`\napplied: ${res.count}`);
    const after = await sql`
      SELECT coalesce(treatment_provenance,'(NULL = not classified)') AS p, count(*)::int AS n
        FROM judgment_citations WHERE relationship <> 'cites' GROUP BY 1 ORDER BY 2 DESC`;
    console.log('column now reads:', JSON.stringify(after, null, 1));
    const [badges] = await sql`
      SELECT count(*)::int AS n FROM judgments
       WHERE overruled_status IS NOT NULL AND overruled_status <> 'none'`;
    console.log('judgments carrying LAW MOVED (must be unchanged at 104):', badges.n);
  }

  writeFileSync(OUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    policy: 'HAND for the 137 badge drivers; SCREEN only for REPORTER (one-directional error); everything else left NULL = NOT CLASSIFIED',
    tally, by_class: byClass,
  }, null, 2));
  console.log(`wrote ${OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
