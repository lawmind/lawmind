/**
 * NEW2 P0 — CITATION RESOLVER TRUTH SET v2.
 *
 * v1.0.0 (22 Aug) proved the four-question battery works. This one is built to
 * the founder's field contract and is deliberately made HARDER: the strata that
 * broke v1's assumptions are named populations here, not accidents of sampling.
 *
 * The relationship vocabulary is fixed by the contract and is the whole point:
 *   UNIQUE                  exactly one held judgment is the right target
 *   LEGITIMATE_MULTI_TARGET several held judgments legitimately carry it — REFUSE
 *   TARGET_NOT_HELD         the reference is real, we do not hold what it names
 *   NOT_A_CITATION          the string is not a citation at all
 *   SOURCE_UNAVAILABLE      we cannot read the citing document well enough to say
 *   UNKNOWN                 evidence does not settle it — never a guess
 *
 * Read-only. Writes one artifact and no database rows.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30, statement_timeout: 300000,
});
const OUT = 'docs/ai/new2/citation-truth-set-v2.json';
const TRUTH_SET_VERSION = '2.0.0';
const RESOLVER_VERSION_UNDER_TEST = {
  identity_path: 'services/ingest/src/citations.ts normaliseCitation() + citationKeys(); judgment_citation_keys.citation_key; judgments.neutral_citation; judgment_citation_aliases.alias_key',
  key_normaliser: "upper(regexp_replace(x,'[^A-Za-z0-9]','','g'))",
  git_rev: '18685e2',
  note: 'LCC resolver COMPONENT V0 is not in this worktree. This set grades the CURRENT production identity path; a later resolver records its own id here and cannot re-grade itself silently.',
};

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const keyOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const MONTHS = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANURARY|SEPTEMEBER|ARPIL|AGT)$/i;
const neutralCode = (s) => (String(s ?? '').match(/^\s*(\d{4})\s*:\s*([A-Za-z-]+)\s*:\s*(\d+)/) ?? []);

function formClass(text) {
  const t = String(text ?? '');
  if (t === '') return 'PLACEHOLDER_SENTINEL_ROW';
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

const STOP = new Set(['the', 'of', 'and', 'v', 'vs', 'versus', 'state', 'union', 'india', 'anr', 'another', 'ors', 'others', 'through', 'its', 'shri', 'smt', 'm', 's', 'in', 're', 'on', 'by', 'for', 'no', 'nos', 'ltd', 'pvt', 'co', 'company']);
const idTokens = (s) => new Set(String(s ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));
function titleAgreement(spanBefore, caseTitle) {
  const a = idTokens(spanBefore); const b = idTokens(caseTitle);
  if (a.size === 0 || b.size === 0) return { overlap: 0, shared: [], verdict: 'NO_TOKENS' };
  const shared = [...b].filter((w) => a.has(w));
  return {
    overlap: +(shared.length / Math.min(a.size, b.size)).toFixed(3),
    shared: shared.slice(0, 8),
    verdict: shared.length >= 2 ? 'AGREES' : (shared.length === 1 ? 'WEAK' : 'DISAGREES'),
  };
}

/** The strata. Each one exists because it can break a resolver a different way. */
const STRATA = [
  ['NEUTRAL_BENCH_QUALIFIED', "c.citation_text ~ '^[0-9]{4}:[A-Za-z-]+:[0-9]+' and c.citation_text ~ '-'", 34],
  ['NEUTRAL_UNQUALIFIED', "c.citation_text ~ '^[0-9]{4}:[A-Za-z-]+:[0-9]+' and c.citation_text !~ '-'", 34],
  ['ALLAHABAD_LKO_AUR', "c.citation_text ~* 'AHC-(LKO|AUR)'", 40],
  ['PH_SHARED_COMMON_ORDER', "c.citation_text ~* 'PHHC'", 40],
  ['INSC', "c.citation_text ~* 'INSC'", 30],
  ['SCC', "c.citation_text ~* 'SCC' and c.citation_text !~* 'OnLine'", 30],
  ['SCC_ONLINE', "c.citation_text ~* 'OnLine'", 22],
  ['AIR', "c.citation_text ~* 'A[.]?I[.]?R'", 30],
  ['SCR', "c.citation_text ~* 'S[.]?C[.]?R'", 30],
  ['PSEUDO_MONTH_STAMP', "c.citation_text ~ '^[0-9]{4}:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)'", 24],
  ['OCR_DAMAGED_CITING', "c.citation_text <> '' and j.script_quality is not null and j.script_quality <> 'clean'", 34],
  ['LOW_TEXT_QUALITY_CITING', "c.citation_text <> '' and j.text_quality is not null and j.text_quality < 0.80", 26],
  ['OTHER_FORM', "c.citation_text <> '' and c.citation_text !~* 'SCC|AIR|SCR|INSC' and c.citation_text !~ '^[0-9]{4}:'", 30],
  ['PLACEHOLDER_SENTINEL', "c.citation_text = ''", 20],
  /* Seeded, not sampled. v1 found exactly one materially unsafe pin — a pinned
   * edge whose citation names more than one authority. It and its two siblings
   * are carried in by edge id so that no later sampling run can lose the case
   * the set exists to catch. */
  ['SEED_UNSAFE_AMBIGUITY', "c.id in ('80e4228a-89a0-46cb-8758-7ddaccf746f5','d04add60-1e15-49e8-81b2-13ffb82cd836','ea6f3f08-ddd8-4f7c-bd81-cf42691fa8d3')", 6],
];
const RESOLVED_ARMS = ['c.cited_judgment_id is not null', 'c.cited_judgment_id is null'];

async function candidatesFor(text) {
  const k = keyOf(text);
  if (!k) return { key: k, all: [] };
  let byAlias = [];
  const [byKey, byNeutral] = await Promise.all([
    sql`select k.judgment_id, k.source, j.case_title, j.court, j.judgment_date, j.neutral_citation, j.case_number, j.content_hash
          from judgment_citation_keys k join judgments j on j.id = k.judgment_id
         where k.citation_key = ${k} limit 30`,
    sql`select j.id as judgment_id, j.case_title, j.court, j.judgment_date, j.neutral_citation, j.case_number, j.content_hash
          from judgments j
         where upper(regexp_replace(coalesce(j.neutral_citation,''),'[^A-Za-z0-9]','','g')) = ${k} limit 30`,
  ]);
  try {
    byAlias = await sql`select a.judgment_id, j.case_title, j.court, j.judgment_date, j.neutral_citation, j.case_number, j.content_hash
          from judgment_citation_aliases a join judgments j on j.id = a.judgment_id
         where a.alias_key = ${k} limit 30`;
  } catch { byAlias = []; }
  const m = new Map();
  for (const c of byKey) m.set(c.judgment_id, { ...c, via: 'citation_key' });
  for (const c of byNeutral) if (!m.has(c.judgment_id)) m.set(c.judgment_id, { ...c, via: 'neutral_citation' });
  for (const c of byAlias) if (!m.has(c.judgment_id)) m.set(c.judgment_id, { ...c, via: 'alias' });
  return { key: k, all: [...m.values()] };
}

const state = {
  truth_set_version: TRUTH_SET_VERSION,
  source_checked_at: new Date().toISOString(),
  resolver_version_under_test: RESOLVER_VERSION_UNDER_TEST,
  relationship_vocabulary: {
    UNIQUE: 'exactly one held judgment is the correct target, and the evidence says which',
    LEGITIMATE_MULTI_TARGET: 'more than one held judgment legitimately carries this reference — the correct behaviour is REFUSE, never a pick',
    TARGET_NOT_HELD: 'the reference is a real citation; no held judgment carries it under any identity source',
    NOT_A_CITATION: 'the string is not a citation (registry stamp, month code, or an extraction sentinel row)',
    SOURCE_UNAVAILABLE: 'the citing document cannot be read well enough to say what it printed',
    UNKNOWN: 'the evidence available does not settle it — recorded as unsettled rather than guessed',
  },
  strata_counts: {},
  records: [],
};

let n = 0;
try {
  for (const [label, pred, want] of STRATA) {
    for (const arm of RESOLVED_ARMS) {
      const per = Math.ceil(want / 2);
      let edges = [];
      try {
        edges = await sql.unsafe(
          `select c.id, c.citing_judgment_id, c.cited_judgment_id, c.citation_text, c.normalised_citation,
                  c.relationship, c.evidence, c.char_offset,
                  j.court as citing_court, j.judgment_date as citing_date, j.case_title as citing_title,
                  j.case_number as citing_case_number, j.source_url as citing_source_url,
                  j.text_quality as citing_text_quality, j.script_quality as citing_script_quality,
                  length(j.full_text) as citing_len,
                  substr(j.full_text, greatest(1, c.char_offset - 220), 220 + length(c.citation_text) + 80) as span,
                  position(c.citation_text in j.full_text) as text_pos
             from judgment_citations c ${label.startsWith('SEED_') ? '' : 'tablesample bernoulli (0.06)'}
             join judgments j on j.id = c.citing_judgment_id
            where ${pred} and ${arm}
            limit ${per}`);
      } catch (e) { console.log(label, arm, 'QUERY ERR', e.message); continue; }

      for (const e of edges) {
        const isSentinel = e.citation_text === '';
        const span = String(e.span ?? '').replace(/\s+/g, ' ');
        /* The needle is collapsed to the same whitespace convention as the
         * haystack. A citation printed across a line break carries a newline in
         * citation_text; matching that raw against a collapsed span reports the
         * document as not printing its own citation. That mistake was made in
         * v1, corrected there, and re-made here — so it is now the first thing
         * this loop does. */
        const needle = isSentinel ? '' : e.citation_text.replace(/\s+/g, ' ').trim();
        const idx = isSentinel ? -1 : span.indexOf(needle);
        const spanBefore = idx > 0 ? span.slice(Math.max(0, idx - 170), idx) : '';
        const spanAround = idx >= 0 ? span.slice(Math.max(0, idx - 240), idx + needle.length + 120) : span;
        const spanVerified = !isSentinel && idx >= 0;
        const form = formClass(e.citation_text);
        const cand = isSentinel ? { key: '', all: [] } : await candidatesFor(e.citation_text);

        const canonical_candidates = cand.all.map((c) => ({
          judgment_id: c.judgment_id,
          via: c.via,
          case_title: (c.case_title ?? '').slice(0, 120),
          court: c.court,
          date: iso(c.judgment_date),
          case_number: c.case_number,
          neutral_citation: c.neutral_citation,
          content_hash: c.content_hash,
          title_check: titleAgreement(spanBefore, c.case_title),
          /* An independent second witness: the case number printed beside the
           * citation. It shares no tokens with the party names, so agreement
           * here is not the title check saying the same thing twice. */
          case_number_printed: !!(c.case_number && String(c.case_number).length >= 6
            && spanAround.toUpperCase().includes(String(c.case_number).toUpperCase())),
        }));
        const agreeing = canonical_candidates.filter(
          (c) => c.title_check.verdict === 'AGREES' || c.case_number_printed,
        );

        let relationship; let ambiguity_reason = null; let correct_target_ids = []; let expected = null; let ambiguity_kind = null;
        if (isSentinel) {
          relationship = 'NOT_A_CITATION';
          expected = 'NEVER_ENTERS_RESOLVER';
          ambiguity_reason = 'extraction sentinel: an empty row written by citations-cli.ts when a judgment cites nothing, so the resumable walk does not re-read it. It is a per-judgment marker, not a reference.';
        } else if (form === 'PSEUDO_CITATION_MONTH_STAMP') {
          relationship = 'NOT_A_CITATION';
          expected = 'REJECT_NOT_A_CITATION';
          ambiguity_reason = 'the court-code position holds a month name — a registry despatch stamp';
        } else if (e.citing_len === null || Number(e.citing_len) < 200) {
          relationship = 'SOURCE_UNAVAILABLE';
          expected = 'REFUSE_SOURCE_UNAVAILABLE';
          ambiguity_reason = 'the citing judgment holds no usable text to check the printed reference against';
        } else if (!spanVerified) {
          relationship = 'UNKNOWN';
          expected = 'REFUSE_SPAN_UNVERIFIED';
          ambiguity_reason = 'the citing judgment does not print this string at or near the recorded offset';
        } else if (canonical_candidates.length === 0) {
          relationship = 'TARGET_NOT_HELD';
          expected = 'REFUSE_TARGET_NOT_HELD';
          ambiguity_reason = 'no held judgment carries this citation under any of the three identity sources';
        } else if (canonical_candidates.length === 1) {
          if (agreeing.length === 1) {
            relationship = 'UNIQUE'; expected = 'RESOLVE_UNIQUE';
            correct_target_ids = [canonical_candidates[0].judgment_id];
          } else {
            relationship = 'UNKNOWN'; expected = 'RESOLVE_UNIQUE_TITLE_UNCONFIRMED';
            correct_target_ids = [canonical_candidates[0].judgment_id];
            ambiguity_reason = 'single candidate, but the party names printed beside the citation do not corroborate it';
          }
        } else if (agreeing.length === 1) {
          relationship = 'UNIQUE'; expected = 'RESOLVE_UNIQUE';
          correct_target_ids = [agreeing[0].judgment_id];
          ambiguity_reason = 'several candidates carry the citation; exactly one is corroborated by the party names beside it';
        } else {
          relationship = 'LEGITIMATE_MULTI_TARGET'; expected = 'REFUSE_AMBIGUOUS';
          correct_target_ids = canonical_candidates.map((c) => c.judgment_id);
          const courts = new Set(canonical_candidates.map((c) => c.court));
          const dates = new Set(canonical_candidates.map((c) => c.date));
          const titles = new Set(canonical_candidates.map((c) => (c.case_title ?? '').toLowerCase().trim()));
          const hashes = new Set(canonical_candidates.map((c) => c.content_hash).filter(Boolean));
          const numbers = new Set(canonical_candidates.map((c) => c.case_number).filter(Boolean));
          /* Byte-identity decides the question the party names cannot: is this
           * one authority we hold twice, or two authorities that share a
           * registry citation? Only the second is dangerous to pin. */
          const byteIdentical = hashes.size === 1 && hashes.size < canonical_candidates.length + 1
            && canonical_candidates.every((c) => c.content_hash);
          ambiguity_kind = byteIdentical
            ? 'SAME_AUTHORITY_HELD_MORE_THAN_ONCE'
            : (titles.size === 1 && numbers.size === 1)
              ? 'SAME_AUTHORITY_HELD_MORE_THAN_ONCE'
              : (courts.size === 1 && dates.size === 1)
                ? 'CONNECTED_MATTER_COMMON_ORDER'
                : (titles.size === 1)
                  ? 'SAME_PARTIES_DIFFERENT_DATES'
                  : 'DIFFERENT_AUTHORITIES';
          ambiguity_reason = byteIdentical
            ? `same authority held ${canonical_candidates.length} times — BYTE-IDENTICAL documents, a pin on any is materially right`
            : ambiguity_kind === 'SAME_AUTHORITY_HELD_MORE_THAN_ONCE'
              ? `same case title and case number across ${canonical_candidates.length} rows — duplicate ingestion, not a legal ambiguity`
              : ambiguity_kind === 'CONNECTED_MATTER_COMMON_ORDER'
                ? `one disposal event: ${canonical_candidates.length} connected matters share this registry citation`
                : ambiguity_kind === 'SAME_PARTIES_DIFFERENT_DATES'
                  ? `same parties, ${dates.size} decision dates — different orders in one proceeding; a pin may name the wrong order`
                  : `${canonical_candidates.length} DIFFERENT held judgments carry this citation and neither the party names nor the case numbers separate them`;
        }

        state.records.push({
          truth_id: `T2-${String(++n).padStart(4, '0')}`,
          truth_set_version: TRUTH_SET_VERSION,
          source_checked_at: state.source_checked_at,
          resolver_version_under_test: RESOLVER_VERSION_UNDER_TEST.git_rev,
          stratum: label,
          form_class: form,
          raw_reference: e.citation_text,
          normalised_reference_stored: e.normalised_citation,
          canonical_key: cand.key,
          source_judgment_id: e.citing_judgment_id,
          source_evidence: {
            court: e.citing_court,
            date: iso(e.citing_date),
            case_title: (e.citing_title ?? '').slice(0, 120),
            case_number: e.citing_case_number,
            source_pdf: e.citing_source_url,
            text_quality: e.citing_text_quality,
            script_quality: e.citing_script_quality,
            full_text_chars: e.citing_len,
            primary_source_checked: false,
          },
          printed_reference: {
            printed_span: span.slice(0, 400),
            offset_recorded: e.char_offset,
            offset_found: Number(e.text_pos),
            printed_in_citing_text: spanVerified,
          },
          canonical_candidates,
          candidate_count: canonical_candidates.length,
          correct_target_ids,
          relationship,
          ambiguity_kind,
          ambiguity_reason,
          expected_resolver_behaviour: expected,
          stored_cited_judgment_id: e.cited_judgment_id,
          stored_relationship: e.relationship,
          stored_treatment_evidence: e.evidence,
        });
      }
      console.log(`${label.padEnd(24)} ${arm.includes('not null') ? 'resolved  ' : 'unresolved'} -> ${edges.length} (total ${state.records.length})`);
    }
    state.strata_counts[label] = state.records.filter((r) => r.stratum === label).length;
    writeFileSync(OUT, JSON.stringify(state, null, 1));
  }
  writeFileSync(OUT, JSON.stringify(state, null, 1));
  const tally = {};
  for (const r of state.records) tally[r.relationship] = (tally[r.relationship] ?? 0) + 1;
  console.log('\nRELATIONSHIP TALLY', JSON.stringify(tally, null, 1));
  console.log('records', state.records.length, '->', OUT);
} finally { await sql.end(); }
