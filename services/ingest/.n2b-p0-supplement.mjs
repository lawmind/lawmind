/**
 * NEW2 P0 supplement — the strata random sampling cannot reach.
 *
 * Two populations are too rare for a 0.06% bernoulli sample and too important
 * to leave out:
 *   SCC_ONLINE          a reporter form the resolver must not treat as neutral
 *   NOT_A_CITATION keys  month-stamp pseudo-citations that live in the KEY table
 *                        rather than the edge table — a resolver looks keys up,
 *                        so a poisoned key is a resolver input even though no
 *                        edge carries it.
 *
 * Appends to citation-truth-set-v2.json, preserving truth_id numbering.
 */
import postgres from 'postgres';
import { writeFileSync, readFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30, statement_timeout: 600000,
});
const OUT = 'docs/ai/new2/citation-truth-set-v2.json';
const state = JSON.parse(readFileSync(OUT, 'utf8'));
let n = state.records.length;
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const MONTHS = /^\d{4}:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*(:|$)/i;

try {
  // ---- 1 · month-stamp keys, straight out of the identity table ------------
  /* The stamps are NOT in judgment_citation_keys — measured, 0 rows for a
   * 200-judgment probe. They live only on judgments.neutral_citation, which is
   * the second of the three identity arms a resolver reads. So the poison is
   * reachable, just not where it was first looked for. */
  const keyRows = await sql`
    select j.neutral_citation as source_text,
           upper(regexp_replace(j.neutral_citation,'[^A-Za-z0-9]','','g')) as citation_key,
           'judgments.neutral_citation' as source, j.id as judgment_id,
           j.court, j.judgment_date, j.case_title, j.case_number, j.source_url,
           j.neutral_citation, j.content_hash, length(j.full_text) as len
      from judgments j
     where j.neutral_citation ~ '^[0-9]{4}:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)'
     limit 400`;
  console.log('month-stamp keys found:', keyRows.length);

  const byKey = new Map();
  for (const r of keyRows) {
    if (!byKey.has(r.source_text)) byKey.set(r.source_text, []);
    byKey.get(r.source_text).push(r);
  }
  let added = 0;
  for (const [text, rows] of [...byKey.entries()].slice(0, 30)) {
    const r = rows[0];
    state.records.push({
      truth_id: `T2-${String(++n).padStart(4, '0')}`,
      truth_set_version: state.truth_set_version,
      source_checked_at: state.source_checked_at,
      resolver_version_under_test: state.resolver_version_under_test.git_rev,
      stratum: 'PSEUDO_MONTH_STAMP_KEY',
      form_class: 'PSEUDO_CITATION_MONTH_STAMP',
      raw_reference: text,
      normalised_reference_stored: r.citation_key,
      canonical_key: r.citation_key,
      source_judgment_id: r.judgment_id,
      source_evidence: {
        court: r.court,
        date: iso(r.judgment_date),
        case_title: (r.case_title ?? '').slice(0, 120),
        case_number: r.case_number,
        source_pdf: r.source_url,
        full_text_chars: r.len,
        primary_source_checked: false,
        identity_row_source: r.source,
      },
      printed_reference: {
        printed_span: `judgment_citation_keys row: source=${r.source} source_text=${text}`,
        offset_recorded: null,
        offset_found: null,
        printed_in_citing_text: null,
      },
      canonical_candidates: rows.slice(0, 10).map((x) => ({
        judgment_id: x.judgment_id,
        via: 'citation_key',
        case_title: (x.case_title ?? '').slice(0, 120),
        court: x.court,
        date: iso(x.judgment_date),
        case_number: x.case_number,
        neutral_citation: x.neutral_citation,
        content_hash: x.content_hash,
        title_check: { overlap: 0, shared: [], verdict: 'NOT_APPLICABLE' },
        case_number_printed: false,
      })),
      candidate_count: rows.length,
      correct_target_ids: [],
      relationship: 'NOT_A_CITATION',
      ambiguity_kind: null,
      ambiguity_reason: `registry despatch stamp in the court-code position (${text.split(':')[1]}); it entered the identity table as a key and must never resolve to anything`,
      expected_resolver_behaviour: 'REJECT_NOT_A_CITATION',
      stored_cited_judgment_id: null,
      stored_relationship: null,
      stored_treatment_evidence: null,
    });
    added += 1;
  }
  console.log('month-stamp key records added:', added, 'distinct keys seen:', byKey.size);

  // ---- 2 · SCC OnLine edges, targeted ------------------------------------
  const online = await sql`
    select c.id, c.citing_judgment_id, c.cited_judgment_id, c.citation_text,
           c.normalised_citation, c.relationship, c.evidence, c.char_offset,
           j.court as citing_court, j.judgment_date as citing_date, j.case_title as citing_title,
           j.case_number as citing_case_number, j.source_url as citing_source_url,
           j.text_quality, j.script_quality, length(j.full_text) as citing_len,
           substr(j.full_text, greatest(1, c.char_offset - 220), 220 + length(c.citation_text) + 80) as span
      from judgment_citations c join judgments j on j.id = c.citing_judgment_id
     where c.citation_text ilike '%online%'
     limit 25`;
  console.log('SCC OnLine edges found:', online.length);
  for (const e of online) {
    const span = String(e.span ?? '').replace(/\s+/g, ' ');
    const needle = e.citation_text.replace(/\s+/g, ' ').trim();
    const idx = span.indexOf(needle);
    const k = needle.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cands = await sql`
      select k.judgment_id, j.case_title, j.court, j.judgment_date, j.case_number, j.neutral_citation, j.content_hash
        from judgment_citation_keys k join judgments j on j.id = k.judgment_id
       where k.citation_key = ${k} limit 20`;
    state.records.push({
      truth_id: `T2-${String(++n).padStart(4, '0')}`,
      truth_set_version: state.truth_set_version,
      source_checked_at: state.source_checked_at,
      resolver_version_under_test: state.resolver_version_under_test.git_rev,
      stratum: 'SCC_ONLINE',
      form_class: 'SCC_ONLINE',
      raw_reference: e.citation_text,
      normalised_reference_stored: e.normalised_citation,
      canonical_key: k,
      source_judgment_id: e.citing_judgment_id,
      source_evidence: {
        court: e.citing_court,
        date: iso(e.citing_date),
        case_title: (e.citing_title ?? '').slice(0, 120),
        case_number: e.citing_case_number,
        source_pdf: e.citing_source_url,
        text_quality: e.text_quality,
        script_quality: e.script_quality,
        full_text_chars: e.citing_len,
        primary_source_checked: false,
      },
      printed_reference: {
        printed_span: span.slice(0, 400),
        offset_recorded: e.char_offset,
        offset_found: idx,
        printed_in_citing_text: idx >= 0,
      },
      canonical_candidates: cands.map((c) => ({
        judgment_id: c.judgment_id,
        via: 'citation_key',
        case_title: (c.case_title ?? '').slice(0, 120),
        court: c.court,
        date: iso(c.judgment_date),
        case_number: c.case_number,
        neutral_citation: c.neutral_citation,
        content_hash: c.content_hash,
        title_check: { overlap: 0, shared: [], verdict: 'NOT_SCORED_IN_SUPPLEMENT' },
        case_number_printed: false,
      })),
      candidate_count: cands.length,
      correct_target_ids: cands.length === 1 ? [cands[0].judgment_id] : [],
      relationship: cands.length === 0 ? 'TARGET_NOT_HELD' : cands.length === 1 ? 'UNKNOWN' : 'LEGITIMATE_MULTI_TARGET',
      ambiguity_kind: null,
      ambiguity_reason: cands.length === 0
        ? 'SCC OnLine is a commercial reporter identity; no held judgment carries this key'
        : 'single candidate carried by the key table, not corroborated by printed party names in this supplement pass',
      expected_resolver_behaviour: cands.length === 0 ? 'REFUSE_TARGET_NOT_HELD' : 'RESOLVE_UNIQUE_TITLE_UNCONFIRMED',
      stored_cited_judgment_id: e.cited_judgment_id,
      stored_relationship: e.relationship,
      stored_treatment_evidence: e.evidence,
    });
  }

  for (const label of ['PSEUDO_MONTH_STAMP_KEY', 'SCC_ONLINE']) {
    state.strata_counts[label] = state.records.filter((r) => r.stratum === label).length;
  }
  writeFileSync(OUT, JSON.stringify(state, null, 1));
  const tally = {};
  for (const r of state.records) tally[r.relationship] = (tally[r.relationship] ?? 0) + 1;
  console.log('TOTAL', state.records.length, JSON.stringify(tally));
} finally { await sql.end(); }
