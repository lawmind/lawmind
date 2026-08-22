/**
 * NEW2 P2 + P3 — the citation resolver GROUND TRUTH set, and the four-question
 * battery that runs on it.
 *
 * LCC and the fifth agent own the resolver. This owns the truth it is graded
 * against, and it is built so that an over-aggressive canonicalizer FAILS:
 * every ambiguous record carries every legitimate target and an expected
 * behaviour of REFUSE, never a single pick.
 *
 * Four questions are kept apart on purpose, because collapsing them into one
 * "citation precision" number is how a corpus with 1% resolution reports well:
 *
 *   A EXTRACTION PRECISION   did the citing judgment actually print this string,
 *                            at the offset the edge claims?
 *   B TARGET RESOLUTION      where `cited_judgment_id` is set, is it the right
 *                            authority — checked against the party names printed
 *                            beside the citation, not against our own key table?
 *   C AMBIGUITY SAFETY       where several targets are legitimate, did anything
 *                            pick one?
 *   D DAMAGED-TEXT BEHAVIOUR does corrupt text manufacture citations?
 *
 * Read-only. Writes two artifacts and no database rows.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const TRUTH = 'docs/ai/new2/citation-truth-set.json';
const BATTERY = 'docs/ai/new2/citation-battery.json';

export const TRUTH_SET_VERSION = '1.0.0';
/** The normaliser this set was built against, so a later one cannot re-grade itself silently. */
const NORMALIZER_UNDER_TEST = "upper(regexp_replace(x,'[^A-Za-z0-9]','','g'))  // judgments_neutral_citation_key + judgment_citation_keys.citation_key";

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const keyOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const MONTHS = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANURARY|SEPTEMEBER|ARPIL|AGT)$/i;
const neutralCode = (s) => (String(s ?? '').match(/^\s*(\d{4})\s*:\s*([A-Za-z-]+)\s*:\s*(\d+)/) ?? []);

/** Form classes the resolver has to tell apart. */
function formClass(text) {
  const t = String(text ?? '');
  const nc = neutralCode(t);
  if (nc.length) {
    if (MONTHS.test(nc[2])) return 'PSEUDO_CITATION_MONTH_STAMP';
    return /-/.test(nc[2]) ? 'NEUTRAL_BENCH_QUALIFIED' : 'NEUTRAL_UNQUALIFIED';
  }
  if (/\bINSC\b/i.test(t)) return 'INSC';
  if (/\bSCC\s*OnLine\b/i.test(t)) return 'SCC_ONLINE';
  if (/\bSCC\b/i.test(t)) return 'SCC';
  if (/\bA\.?\s?I\.?\s?R\.?\b/i.test(t)) return 'AIR';
  if (/\bS\.?\s?C\.?\s?R\.?\b/i.test(t)) return 'SCR';
  return 'OTHER';
}

/** Words that carry no identity in an Indian case title. */
const STOP = new Set(['the', 'of', 'and', 'v', 'vs', 'versus', 'state', 'union', 'india', 'anr', 'another', 'ors', 'others', 'through', 'its', 'shri', 'smt', 'm', 's', 'in', 're', 'on', 'by', 'for', 'no', 'nos', 'ltd', 'pvt', 'co', 'company']);
const idTokens = (s) => new Set(String(s ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));

function titleAgreement(spanBefore, caseTitle) {
  const a = idTokens(spanBefore);
  const b = idTokens(caseTitle);
  if (a.size === 0 || b.size === 0) return { overlap: 0, shared: [], verdict: 'NO_TOKENS' };
  const shared = [...b].filter((w) => a.has(w));
  const overlap = shared.length / Math.min(a.size, b.size);
  return {
    overlap: +overlap.toFixed(3),
    shared: shared.slice(0, 8),
    verdict: shared.length >= 2 ? 'AGREES' : (shared.length === 1 ? 'WEAK' : 'DISAGREES'),
  };
}

const state = {
  truth_set_version: TRUTH_SET_VERSION,
  source_checked_at: new Date().toISOString(),
  normalizer_version_being_tested: NORMALIZER_UNDER_TEST,
  records: [],
};

const STRATA = [
  ["citation_text ~ '^[0-9]{4}:[A-Za-z-]+:[0-9]+' and citation_text ~ '-'", 'NEUTRAL_BENCH_QUALIFIED'],
  ["citation_text ~ '^[0-9]{4}:[A-Za-z-]+:[0-9]+' and citation_text !~ '-'", 'NEUTRAL_UNQUALIFIED'],
  ["citation_text ~* 'INSC'", 'INSC'],
  ["citation_text ~* 'SCC' and citation_text !~* 'OnLine'", 'SCC'],
  ["citation_text ~* 'OnLine'", 'SCC_ONLINE'],
  ["citation_text ~* 'A\\.?I\\.?R'", 'AIR'],
  ["citation_text ~* 'S\\.?C\\.?R'", 'SCR'],
  ["citation_text <> '' and citation_text !~* 'SCC|AIR|SCR|INSC' and citation_text !~ '^[0-9]{4}:'", 'OTHER'],
];
const PER_STRATUM = Number(process.env.PER_STRATUM ?? 45);

async function candidatesFor(text) {
  const k = keyOf(text);
  if (!k) return { key: k, byKey: [], byNeutral: [], byAlias: [] };
  const [byKey, byNeutral, byAlias] = await Promise.all([
    sql`select k.judgment_id, k.source, k.source_text, j.case_title, j.court, j.judgment_date, j.neutral_citation
          from judgment_citation_keys k join judgments j on j.id = k.judgment_id
         where k.citation_key = ${k} limit 25`,
    sql`select j.id as judgment_id, j.case_title, j.court, j.judgment_date, j.neutral_citation
          from judgments j
         where upper(regexp_replace(coalesce(j.neutral_citation,''),'[^A-Za-z0-9]','','g')) = ${k} limit 25`,
    sql`select a.judgment_id, a.alias, a.alias_reporter, a.corroborations, j.case_title, j.court, j.judgment_date
          from judgment_citation_aliases a join judgments j on j.id = a.judgment_id
         where a.alias_key = ${k} limit 25`,
  ]);
  return { key: k, byKey, byNeutral, byAlias };
}

try {
  await sql`set statement_timeout = 0`;

  for (const [pred, label] of STRATA) {
    for (const resolvedPred of ['cited_judgment_id is not null', 'cited_judgment_id is null']) {
      const edges = await sql.unsafe(
        'select c.id, c.citing_judgment_id, c.cited_judgment_id, c.citation_text, c.normalised_citation,'
        + ' c.relationship, c.char_offset,'
        + ' j.court as citing_court, j.judgment_date as citing_date, j.case_title as citing_title,'
        + ' j.text_quality as citing_text_quality, j.script_quality as citing_script_quality,'
        + ' length(j.full_text) as citing_len,'
        + ' substr(j.full_text, greatest(1, c.char_offset - 200), 200 + length(c.citation_text) + 60) as span,'
        + ' position(c.citation_text in j.full_text) as text_pos'
        + ' from judgment_citations c tablesample bernoulli (0.08)'
        + ' join judgments j on j.id = c.citing_judgment_id'
        + ' where ' + pred + ' and ' + resolvedPred
        + ' limit ' + PER_STRATUM,
      );

      for (const e of edges) {
        const span = String(e.span ?? '').replace(/\s+/g, ' ');
        const idx = span.indexOf(e.citation_text);
        const spanBefore = idx > 0 ? span.slice(Math.max(0, idx - 160), idx) : '';
        const spanVerified = idx >= 0;
        const cand = await candidatesFor(e.citation_text);

        const all = new Map();
        for (const c of cand.byKey) all.set(c.judgment_id, { ...c, via: 'citation_key' });
        for (const c of cand.byNeutral) if (!all.has(c.judgment_id)) all.set(c.judgment_id, { ...c, via: 'neutral_citation' });
        for (const c of cand.byAlias) if (!all.has(c.judgment_id)) all.set(c.judgment_id, { ...c, via: 'alias' });
        const candidates = [...all.values()].map((c) => ({
          judgment_id: c.judgment_id,
          via: c.via,
          case_title: (c.case_title ?? '').slice(0, 120),
          court: c.court,
          date: iso(c.judgment_date),
          title_check: titleAgreement(spanBefore, c.case_title),
        }));

        const form = formClass(e.citation_text);
        const agreeing = candidates.filter((c) => c.title_check.verdict === 'AGREES');

        // ---- expected behaviour, decided from evidence only ---------------
        let expected;
        let ambiguity_reason = null;
        let true_target = null;
        let alternates = [];
        if (form === 'PSEUDO_CITATION_MONTH_STAMP') {
          expected = 'REJECT_NOT_A_CITATION';
          ambiguity_reason = 'the court-code position holds a month name — a registry despatch stamp, not a citation';
        } else if (!spanVerified) {
          expected = 'REFUSE_SPAN_UNVERIFIED';
          ambiguity_reason = 'the citing judgment does not contain this string at or near the recorded offset';
        } else if (candidates.length === 0) {
          expected = 'REFUSE_TARGET_NOT_HELD';
          ambiguity_reason = 'no held judgment carries this citation under any of the three identity sources';
        } else if (candidates.length === 1) {
          if (agreeing.length === 1) {
            expected = 'RESOLVE_UNIQUE';
            true_target = candidates[0].judgment_id;
          } else {
            expected = 'RESOLVE_UNIQUE_TITLE_UNCONFIRMED';
            true_target = candidates[0].judgment_id;
            ambiguity_reason = 'single candidate, but the party names printed beside the citation do not corroborate it';
          }
        } else if (agreeing.length === 1) {
          expected = 'RESOLVE_UNIQUE';
          true_target = agreeing[0].judgment_id;
          alternates = candidates.filter((c) => c.judgment_id !== agreeing[0].judgment_id).map((c) => c.judgment_id);
          ambiguity_reason = 'several candidates carry the citation; only one is corroborated by the party names beside it';
        } else {
          // Several legitimate targets. NEVER pick one.
          expected = 'REFUSE_AMBIGUOUS';
          alternates = candidates.map((c) => c.judgment_id);
          const courts = new Set(candidates.map((c) => c.court));
          const dates = new Set(candidates.map((c) => c.date));
          ambiguity_reason = (form.startsWith('NEUTRAL') && courts.size === 1 && dates.size === 1)
            ? 'one disposal event: ' + candidates.length + ' connected matters share this registry citation'
            : candidates.length + ' held judgments carry this citation and the printed party names do not separate them';
        }

        state.records.push({
          id: e.id,
          form_class: form,
          stratum: label,
          citing: {
            judgment_id: e.citing_judgment_id,
            court: e.citing_court,
            date: iso(e.citing_date),
            case_title: (e.citing_title ?? '').slice(0, 120),
            text_quality: e.citing_text_quality,
            script_quality: e.citing_script_quality,
            length: e.citing_len,
          },
          raw_source_span: span.slice(0, 420),
          span_offset_recorded: e.char_offset,
          span_offset_found: Number(e.text_pos),
          span_verified: spanVerified,
          citation_text: e.citation_text,
          normalised_citation_stored: e.normalised_citation,
          normalised_candidate_key: cand.key,
          stored_cited_judgment_id: e.cited_judgment_id,
          candidates,
          candidate_count: candidates.length,
          true_target_judgment_id: true_target,
          alternate_legitimate_targets: alternates,
          ambiguity_reason,
          expected_resolver_behaviour: expected,
          provenance: 'judgment_citations row + the citing judgment own full_text at the recorded offset',
        });
      }
      console.log(label + ' | ' + (resolvedPred.includes('not null') ? 'resolved' : 'unresolved') + ' -> ' + edges.length + ' (total ' + state.records.length + ')');
      writeFileSync(TRUTH, JSON.stringify(state, null, 1));
    }
  }

  writeFileSync(TRUTH, JSON.stringify(state, null, 1));

  // ---------------------------------------------------------------- battery
  const R = state.records;
  const pct = (a, b) => (b ? +((a / b) * 100).toFixed(2) : null);
  const withStored = R.filter((r) => r.stored_cited_judgment_id);
  const storedRight = withStored.filter((r) => r.true_target_judgment_id && r.stored_cited_judgment_id === r.true_target_judgment_id);
  const storedWrong = withStored.filter((r) => r.true_target_judgment_id && r.stored_cited_judgment_id !== r.true_target_judgment_id);
  const storedUnprovable = withStored.filter((r) => !r.true_target_judgment_id);
  const shouldRefuse = R.filter((r) => r.expected_resolver_behaviour === 'REFUSE_AMBIGUOUS');
  const refuseButPinned = shouldRefuse.filter((r) => r.stored_cited_judgment_id);
  const damaged = R.filter((r) => r.citing.text_quality !== null && Number(r.citing.text_quality) < 0.85);
  const pseudo = R.filter((r) => r.form_class === 'PSEUDO_CITATION_MONTH_STAMP');

  const byForm = {};
  for (const r of R) {
    const f = (byForm[r.form_class] ??= { records: 0, span_verified: 0, candidates_0: 0, candidates_1: 0, candidates_many: 0, stored_pin: 0 });
    f.records += 1;
    if (r.span_verified) f.span_verified += 1;
    if (r.candidate_count === 0) f.candidates_0 += 1;
    else if (r.candidate_count === 1) f.candidates_1 += 1;
    else f.candidates_many += 1;
    if (r.stored_cited_judgment_id) f.stored_pin += 1;
  }
  for (const f of Object.values(byForm)) {
    f.span_verified_pct = pct(f.span_verified, f.records);
    f.target_not_held_pct = pct(f.candidates_0, f.records);
    f.ambiguous_pct = pct(f.candidates_many, f.records);
  }

  const battery = {
    truth_set_version: TRUTH_SET_VERSION,
    source_checked_at: state.source_checked_at,
    normalizer_version_being_tested: NORMALIZER_UNDER_TEST,
    records: R.length,
    A_extraction_precision: {
      question: 'did the citing judgment actually print this string, at the offset the edge claims?',
      span_verified: R.filter((r) => r.span_verified).length,
      span_not_verified: R.filter((r) => !r.span_verified).length,
      pct_verified: pct(R.filter((r) => r.span_verified).length, R.length),
    },
    B_target_resolution_precision: {
      question: 'where cited_judgment_id is set, is it the right authority — judged by the party names printed beside the citation?',
      edges_with_a_stored_pin: withStored.length,
      pin_corroborated: storedRight.length,
      pin_contradicted: storedWrong.length,
      pin_unprovable_either_way: storedUnprovable.length,
      precision_over_provable_pct: pct(storedRight.length, storedRight.length + storedWrong.length),
    },
    C_ambiguity_safety: {
      question: 'where several targets are legitimate, did anything pick one?',
      records_where_refusal_is_correct: shouldRefuse.length,
      of_those_already_pinned: refuseButPinned.length,
      unsafe_pin_rate_pct: pct(refuseButPinned.length, shouldRefuse.length),
    },
    D_damaged_text_behaviour: {
      question: 'does corrupt text manufacture citations?',
      records_from_documents_below_text_quality_0_85: damaged.length,
      of_those_span_unverified: damaged.filter((r) => !r.span_verified).length,
      pseudo_citations_found: pseudo.length,
      pseudo_citation_forms: [...new Set(pseudo.map((r) => r.citation_text))].slice(0, 20),
    },
    E_by_form_class: byForm,
  };
  writeFileSync(BATTERY, JSON.stringify(battery, null, 1));
  console.log('\n' + JSON.stringify(battery, null, 1).slice(0, 3200));
} catch (e) {
  console.error('ERR ' + e.message + '\n' + e.stack);
  state.error = e.message;
  writeFileSync(TRUTH, JSON.stringify(state, null, 1));
  process.exitCode = 1;
}
await sql.end();
