/**
 * NEW2 — R7 §10 COURT-REASONING TREATMENT ENRICHMENT, bounded pilot.
 *
 * Goal: increase genuinely court-verifiable currentness evidence. Today the
 * corpus holds **5** treatment edges classified `COURT_REASONING_EXPLICIT`
 * against 11,573 resting on a reporter's headnote.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PIPELINE, AND THE GATE AT EVERY STEP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   later judgment cites earlier          (a resolved edge with a char_offset)
 *     -> locate the citation-context span (a real window of the citing text)
 *     -> identify the SPEAKER               (court / counsel / quoted precedent / headnote)
 *     -> treatment candidate                (vocabulary, polarity and modality)
 *     -> exact span verification            (the words are really there, at that offset)
 *     -> court-reasoning role verification  (the passage-role contract's rules)
 *     -> chronology verification            (the citing judgment post-dates the cited one)
 *     -> candidate PROPOSED, never promoted
 *
 * **A candidate that fails any gate is recorded with the gate that refused it.**
 * The refusal counts are the actual product of this pilot: they are what a
 * pre-registered precision requirement is measured against.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SCRIPT WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It performs **no writes of any kind**. `relationship`, `treatment_provenance`
 * and `overruled_status` are untouched. R7 §10: models may propose candidates;
 * models do not independently establish canonical treatment — and neither does a
 * regular expression. Promotion is a separate, reviewed act.
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'docs/ai/new2-r7';
mkdirSync(OUT, { recursive: true });

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(url, { ssl: false, max: 1, idle_timeout: 30, statement_timeout: 1_800_000 });

const LIMIT = Number(process.env['N2_TREATMENT_LIMIT'] ?? 40000);
const WINDOW_BEFORE = 900;
const WINDOW_AFTER = 700;

/* ── treatment vocabulary ──────────────────────────────────────────────────
 * Deliberately narrow. Every phrase here is one a court uses about an authority,
 * and the polarity is recorded separately from the verb because "is no longer
 * good law" and "is good law" share every word that matters. */
const TREATMENT = [
  { rel: 'overruled', re: /\b(overrul(e|ed|ing)|no longer good law|not good law|stands overruled|is hereby overruled)\b/i },
  { rel: 'overruled_in_part', re: /\b(overruled (in part|to the extent)|partly overruled|to that extent .{0,30}overruled)\b/i },
  { rel: 'doubted', re: /\b(doubt(ed|s) the correctness|we doubt|correctness .{0,25}doubted|requires reconsideration|refer(red)? to a larger bench)\b/i },
  { rel: 'distinguished', re: /\b(distinguish(ed|able)|has no application to the facts|is clearly distinguishable|turns on its own facts)\b/i },
  { rel: 'followed', re: /\b(we (respectfully )?follow|following the (decision|judgment|ratio)|squarely covered by|we are bound by|binding on us)\b/i },
  { rel: 'approved', re: /\b(we approve|is approved|approving the (view|decision)|lays down the correct law|correctly (decided|lays down))\b/i },
  { rel: 'set_aside', re: /\b(is set aside|are set aside|stands set aside|hereby set aside)\b/i },
];

/* ── the trap set, from R7 §10, each with the gate it must trip ──────────── */
const TRAPS = [
  {
    gate: 'SPEAKER_IS_COUNSEL',
    re: /\b(learned (senior )?(counsel|advocate|A\.?G\.?A\.?|Government Advocate|Public Prosecutor)|it (is|was) (submitted|contended|argued|urged)|Mr\.? [A-Z][a-z]+ .{0,40}(submitted|contended|argued|urged))\b/i,
  },
  {
    gate: 'SPEAKER_IS_REPORTER',
    re: /\b(HEADNOTE|Held\s*:—|Editor'?s Note|CASE REFERRED|SHORT NOTES?|\(Paras? \d+ (and|,|to) ?\d*\)\s*$)/i,
  },
  {
    gate: 'MODALITY_DEFECT',
    // "sought to be overruled", "proposed to be", "may be overruled", "if overruled"
    re: /\b(sought to be|proposed to be|may (well )?be|might be|would be|could be|is likely to be|if .{0,20}(overrul|set aside)|liable to be)\b/i,
  },
  {
    gate: 'NEGATED',
    re: /\b(has not been overruled|is not overruled|does not stand overruled|no(t| )? .{0,15}(overrul|doubted)|cannot be said to have been overruled|still holds the field|continues to be good law)\b/i,
  },
  {
    gate: 'INTERROGATIVE_OR_CONDITIONAL',
    re: /\b(whether .{0,60}(overrul|doubted|set aside)|the question (is|arises) whether)\b/i,
  },
  {
    gate: 'QUOTED_PRECEDENT',
    re: /\b(observed as under|held as under|held as follows|observed as follows|in paragraph \d+ .{0,40}(held|observed))\b/i,
  },
];

console.log(`pilot over up to ${LIMIT.toLocaleString()} resolved citation edges …`);
const t0 = Date.now();

/* The window is cut in SQL with substr() over full_text so the 129 GB of TOAST
 * is read once per row and never crosses the wire whole. */
const rows = await sql`
  SELECT c.id                AS edge_id,
         c.citing_judgment_id,
         c.cited_judgment_id,
         c.citation_text,
         c.relationship      AS existing_relationship,
         c.treatment_provenance AS existing_provenance,
         c.char_offset,
         substr(citing.full_text, greatest(1, c.char_offset - ${WINDOW_BEFORE}), ${WINDOW_BEFORE + WINDOW_AFTER}) AS context,
         length(citing.full_text) AS citing_len,
         citing.court        AS citing_court,
         citing.judgment_date AS citing_date,
         citing.script_quality AS citing_script_quality,
         cited.judgment_date  AS cited_date,
         cited.case_title     AS cited_title
  FROM judgment_citations c
  JOIN judgments citing ON citing.id = c.citing_judgment_id
  JOIN judgments cited  ON cited.id  = c.cited_judgment_id
  WHERE c.cited_judgment_id IS NOT NULL
    AND c.char_offset IS NOT NULL AND c.char_offset > 0
  ORDER BY c.id
  LIMIT ${LIMIT}`;

console.log(`loaded ${rows.length.toLocaleString()} edges with context in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const refusals = {};
const candidates = [];
const bump = (g) => (refusals[g] = (refusals[g] ?? 0) + 1);

for (const r of rows) {
  const ctx = String(r.context ?? '');

  /* GATE 1 — exact span verification. The window must actually contain the
   * citation string the edge claims, at the offset the edge claims. An edge
   * whose text is not where it says it is cannot support anything. */
  const cite = String(r.citation_text ?? '').trim();
  if (!cite) {
    bump('NO_CITATION_TEXT');
    continue;
  }
  /* ESCAPE FIRST, THEN LOOSEN THE WHITESPACE — and never the other way round.
   * The first version did it in the opposite order: it turned every run of
   * whitespace into `\s*` and then escaped regex metacharacters, which escaped
   * the backslash and the asterisk it had just inserted. Every citation
   * containing a space — which is nearly all of them — became an impossible
   * literal, and the pilot reported SPAN_NOT_FOUND on 35,612 of 40,000 edges.
   * The offsets were correct all along; the measurement was not. */
  const loose = cite
    .replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`)
    .replace(/(\\?\s)+/g, '\\s+');
  let spanOk = false;
  try {
    spanOk = new RegExp(loose, 'i').test(ctx);
  } catch {
    spanOk = ctx.includes(cite);
  }
  if (!spanOk) {
    bump('SPAN_NOT_FOUND');
    continue;
  }

  /* GATE 2 — a treatment must actually be asserted in the window. */
  const hits = TREATMENT.filter((t) => t.re.test(ctx));
  if (hits.length === 0) {
    bump('NO_TREATMENT_LANGUAGE');
    continue;
  }
  if (hits.length > 1) {
    bump('CONFLICTING_TREATMENT_LANGUAGE');
    continue;
  }
  const proposed = hits[0].rel;

  /* GATE 3 — the trap set. Speaker, modality, negation, quotation. */
  const tripped = TRAPS.filter((t) => t.re.test(ctx)).map((t) => t.gate);
  if (tripped.length > 0) {
    bump(tripped[0]);
    continue;
  }

  /* GATE 4 — court-reasoning role, from PASSAGE_SAFETY_ROLE_CONTRACT_V1. The
   * window must read as the court speaking, not as unattributed narrative. */
  const courtVoice =
    /\b(in (my|our) (considered )?(view|opinion)|we are of the (considered )?(view|opinion)|I am of the (considered )?(view|opinion)|having (heard|considered|perused)|it is well settled|we (hold|find|conclude)|this Court (has|is) )\b/i.test(
      ctx,
    );
  if (!courtVoice) {
    bump('NOT_COURT_VOICE');
    continue;
  }

  /* GATE 5 — chronology. A judgment cannot treat one decided after it. R7 §7.7:
   * a date-suspect source may not silently drive "later authority". */
  if (!r.citing_date || !r.cited_date) {
    bump('DATE_UNKNOWN');
    continue;
  }
  if (new Date(r.citing_date) <= new Date(r.cited_date)) {
    bump('CHRONOLOGY_IMPOSSIBLE');
    continue;
  }

  /* GATE 6 — body damage. A treatment read out of damaged text is not evidence. */
  if (r.citing_script_quality && !['clean', 'mixed_script_ok'].includes(r.citing_script_quality)) {
    bump('CITING_BODY_DAMAGED');
    continue;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(ctx) || /\uFFFD/.test(ctx)) {
    bump('CONTEXT_DAMAGED');
    continue;
  }

  candidates.push({
    edge_id: r.edge_id,
    citing_judgment_id: r.citing_judgment_id,
    cited_judgment_id: r.cited_judgment_id,
    cited_title: r.cited_title,
    citation_text: cite,
    char_offset: r.char_offset,
    citing_court: r.citing_court,
    citing_date: r.citing_date,
    cited_date: r.cited_date,
    existing_relationship: r.existing_relationship,
    existing_provenance: r.existing_provenance,
    proposed_relationship: proposed,
    proposed_provenance: 'COURT_REASONING_EXPLICIT',
    context: ctx,
  });
}

const summary = {
  artifact: 'COURT_REASONING_TREATMENT_ENRICHMENT_V1',
  generated_at: new Date().toISOString(),
  writes_performed: 0,
  note: 'PROPOSALS ONLY. No relationship, treatment_provenance or overruled_status was written.',
  edges_examined: rows.length,
  window: { before: WINDOW_BEFORE, after: WINDOW_AFTER },
  refusals_by_gate: refusals,
  candidates: candidates.length,
  candidates_by_relationship: candidates.reduce((a, c) => ((a[c.proposed_relationship] = (a[c.proposed_relationship] ?? 0) + 1), a), {}),
  candidates_that_agree_with_existing: candidates.filter((c) => c.existing_relationship === c.proposed_relationship).length,
  candidates_that_contradict_existing: candidates.filter(
    (c) => c.existing_relationship && c.existing_relationship !== 'cites' && c.existing_relationship !== c.proposed_relationship,
  ).length,
  candidates_on_plain_cites_edges: candidates.filter((c) => c.existing_relationship === 'cites').length,
};

writeFileSync(`${OUT}/treatment-enrichment-pilot.json`, JSON.stringify({ summary, candidates }, null, 1));
console.log(JSON.stringify(summary, null, 1));
await sql.end();
